import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const configPath = path.join(root, "work", "live-toggle-config.json");

fs.writeFileSync(configPath, JSON.stringify({
  version: 1,
  language: "en",
  vision: {
    enabled: true,
  },
  activeProfile: "test-local",
  provider: {
    name: "test-local",
    type: "openai-compatible",
    plan: "local",
    baseUrl: "http://127.0.0.1:1234/v1",
    model: "qwen/qwen3-vl-8b",
    apiKey: "local",
  },
  profiles: {
    "test-local": {
      name: "Test Local",
      provider: {
        name: "test-local",
        type: "openai-compatible",
        plan: "local",
        baseUrl: "http://127.0.0.1:1234/v1",
        model: "qwen/qwen3-vl-8b",
        apiKey: "local",
      },
    },
  },
}, null, 2));

const env = {
  ...process.env,
  VISION_MCP_CONFIG: configPath,
};

const child = spawn(process.execPath, [path.join(root, "src", "server.js")], {
  cwd: root,
  env,
  stdio: ["pipe", "pipe", "pipe"],
});

const responses = new Map();
const waiters = new Map();
let stdout = "";
let stderr = "";

child.stdout.on("data", (chunk) => {
  stdout += chunk.toString("utf8");
  for (;;) {
    const newline = stdout.indexOf("\n");
    if (newline === -1) break;
    const line = stdout.slice(0, newline).trim();
    stdout = stdout.slice(newline + 1);
    if (!line) continue;
    const response = JSON.parse(line);
    responses.set(response.id, response);
    waiters.get(response.id)?.(response);
    waiters.delete(response.id);
  }
});

child.stderr.on("data", (chunk) => {
  stderr += chunk.toString("utf8");
});

try {
  await send(1, "initialize", { protocolVersion: "2024-11-05" });
  const enabled = await tool(2, "vision_status", {});
  assertText(enabled, "vision_enabled");

  runToggle("off");
  const disabled = await tool(3, "vision_status", {});
  assertText(disabled, "vision_disabled");

  const blockedProbe = await tool(4, "vision_probe", {});
  assertText(blockedProbe, "vision_disabled");

  const rejectedEnable = await tool(6, "vision_set_enabled", { enabled: true });
  assertText(rejectedEnable, "cannot be re-enabled");

  const stillDisabled = await tool(7, "vision_status", {});
  assertText(stillDisabled, "vision_disabled");

  runToggle("on");
  const reenabled = await tool(5, "vision_status", {});
  assertText(reenabled, "vision_enabled");

  console.log("live-toggle: ok");
} finally {
  child.kill();
}

async function tool(id, name, args) {
  return send(id, "tools/call", {
    name,
    arguments: args,
  });
}

function send(id, method, params) {
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  return new Promise((resolve, reject) => {
    const existing = responses.get(id);
    if (existing) {
      resolve(existing);
      return;
    }
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for response ${id}\nSTDERR:\n${stderr}`));
    }, 5000);
    waiters.set(id, (response) => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}

function runToggle(command) {
  const result = spawnSync(process.execPath, [path.join(root, "src", "toggle-vision.js"), command], {
    cwd: root,
    env,
    encoding: "utf8",
    timeout: 10000,
  });
  if (result.status !== 0) {
    throw new Error(`toggle ${command} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  }
}

function assertText(response, text) {
  const payload = response?.result?.content?.[0]?.text || JSON.stringify(response);
  if (!payload.includes(text)) {
    throw new Error(`Expected ${text}, got:\n${payload}\nSTDERR:\n${stderr}`);
  }
}
