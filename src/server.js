#!/usr/bin/env node
import { loadConfig } from "./config.js";
import { getPrompt, listPrompts } from "./prompts.js";
import { callTool, listTools } from "./tools.js";

const SERVER_INFO = { name: "mcp-vision-bridge", version: "0.1.0" };
const DEFAULT_PROTOCOL_VERSION = "2024-11-05";

let config;
let configError;
try {
  config = loadConfig();
} catch (err) {
  configError = err;
  config = null;
}

let inputBuffer = Buffer.alloc(0);
let framing = "ndjson";
let inputEnded = false;
let processing = Promise.resolve();

process.stdin.on("data", (chunk) => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);
  scheduleProcess();
});

process.stdin.on("end", () => {
  inputEnded = true;
  scheduleProcess();
});

function scheduleProcess() {
  processing = processing
    .then(processInput)
    .then(() => {
      if (inputEnded && inputBuffer.length === 0) process.exit(0);
    })
    .catch((err) => {
      console.error(`[mcp-vision-bridge] Failed to process input: ${err.stack || err.message}`);
      if (inputEnded) process.exit(1);
    });
}

async function processInput() {
  while (inputBuffer.length > 0) {
    const message = readNextMessage();
    if (!message) return;
    await handleMessage(message);
  }
}

function readNextMessage() {
  const textStart = inputBuffer.slice(0, Math.min(inputBuffer.length, 32)).toString("utf8");
  if (/^Content-Length:/i.test(textStart)) {
    framing = "headers";
    const headerEnd = inputBuffer.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd === -1) return null;
    const headerText = inputBuffer.slice(0, headerEnd).toString("utf8");
    const match = headerText.match(/Content-Length:\s*(\d+)/i);
    if (!match) throw new Error("Invalid Content-Length header.");
    const length = Number(match[1]);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + length;
    if (inputBuffer.length < bodyEnd) return null;
    const body = inputBuffer.slice(bodyStart, bodyEnd).toString("utf8");
    inputBuffer = inputBuffer.slice(bodyEnd);
    return JSON.parse(body);
  }

  const newline = inputBuffer.indexOf(0x0a);
  if (newline === -1) return null;
  const line = inputBuffer.slice(0, newline).toString("utf8").trim();
  inputBuffer = inputBuffer.slice(newline + 1);
  if (!line) return null;
  framing = "ndjson";
  return JSON.parse(line);
}

async function handleMessage(message) {
  if (!message || typeof message !== "object") return;
  if (!("id" in message)) return;

  try {
    const result = await dispatch(message.method, message.params || {});
    send({ jsonrpc: "2.0", id: message.id, result });
  } catch (err) {
    send({
      jsonrpc: "2.0",
      id: message.id,
      error: {
        code: -32000,
        message: err.message || String(err),
      },
    });
  }
}

async function dispatch(method, params) {
  switch (method) {
    case "initialize":
      return {
        protocolVersion: params.protocolVersion || DEFAULT_PROTOCOL_VERSION,
        capabilities: { tools: {}, prompts: {} },
        serverInfo: SERVER_INFO,
      };
    case "ping":
      return {};
    case "tools/list":
      return { tools: listTools() };
    case "tools/call":
      reloadConfig();
      if (!config) {
        throw new Error(`${configError?.message || "Server is not configured."} Run mcp-vision-bridge-init before calling vision tools.`);
      }
      return {
        content: [
          {
            type: "text",
            text: await callTool(params.name, params.arguments || {}, config),
          },
        ],
      };
    case "prompts/list":
      return { prompts: listPrompts() };
    case "prompts/get":
      return getPrompt(params.name);
    default:
      throw new Error(`Unsupported method: ${method}`);
  }
}

function reloadConfig() {
  try {
    config = loadConfig();
    configError = null;
  } catch (err) {
    configError = err;
    config = null;
  }
}

function send(message) {
  const body = JSON.stringify(message);
  if (framing === "headers") {
    process.stdout.write(`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`);
  } else {
    process.stdout.write(`${body}\n`);
  }
}
