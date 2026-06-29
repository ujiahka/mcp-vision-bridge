import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const tmpDir = path.join(root, "tmp");
const attachmentPath = path.join(tmpDir, "recent-attachment.png");
const configPath = path.join(root, "work", "smoke-mcp-config.json");
fs.mkdirSync(tmpDir, { recursive: true });
fs.writeFileSync(
  attachmentPath,
  Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64"),
);
fs.writeFileSync(configPath, JSON.stringify({
  version: 1,
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
    "backup-local": {
      name: "Backup Local",
      provider: {
        name: "backup-local",
        type: "openai-compatible",
        plan: "local",
        baseUrl: "http://127.0.0.1:1234/v1",
        model: "qwen/qwen2.5-vl-7b",
        apiKey: "local",
      },
    },
  },
  privacy: {
    allowRemoteEndpoint: false,
    allowUrlFetch: false,
    telemetry: false,
    storeImages: true,
  },
  dataDir: path.join(root, "work", "test-data"),
  logging: {
    enabled: true,
    includePrompt: true,
    includeResult: true,
    dir: path.join(root, "work", "test-data", "logs"),
  },
  limits: {
    maxImageBytes: 26214400,
    maxTokens: 2048,
    requestTimeoutMs: 120000,
  },
  attachments: {
    clipboardFallback: false,
  },
}, null, 2));

const child = spawn(process.execPath, [path.join(root, "src", "server.js")], {
  cwd: root,
  env: {
    ...process.env,
    VISION_MCP_CONFIG: configPath,
    VISION_ATTACHMENT_DIRS: tmpDir,
  },
  stdio: ["pipe", "pipe", "pipe"],
});

const responses = [];
let stdout = "";
let stderr = "";

child.stdout.on("data", (chunk) => {
  stdout += chunk.toString("utf8");
  for (;;) {
    const newline = stdout.indexOf("\n");
    if (newline === -1) break;
    const line = stdout.slice(0, newline).trim();
    stdout = stdout.slice(newline + 1);
    if (line) responses.push(JSON.parse(line));
  }
});

child.stderr.on("data", (chunk) => {
  stderr += chunk.toString("utf8");
});

function send(message) {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } });
send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
send({
  jsonrpc: "2.0",
  id: 3,
  method: "tools/call",
  params: {
    name: "vision_register_image",
    arguments: {
      image_base64:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    },
  },
});
send({
  jsonrpc: "2.0",
  id: 4,
  method: "tools/call",
  params: {
    name: "vision_list_recent_images",
    arguments: {
      attachment_hint: "recent-attachment.png 1x1",
      max_results: 3,
    },
  },
});
send({
  jsonrpc: "2.0",
  id: 5,
  method: "tools/call",
  params: {
    name: "vision_register_image",
    arguments: {
      attachment_hint: "recent-attachment.png 1x1",
    },
  },
});
send({
  jsonrpc: "2.0",
  id: 6,
  method: "tools/call",
  params: {
    name: "vision_list_profiles",
    arguments: {},
  },
});
send({
  jsonrpc: "2.0",
  id: 7,
  method: "tools/call",
  params: {
    name: "vision_switch_profile",
    arguments: {
      profile: "backup-local",
    },
  },
});
send({ jsonrpc: "2.0", id: 8, method: "prompts/list", params: {} });
send({
  jsonrpc: "2.0",
  id: 9,
  method: "prompts/get",
  params: {
    name: "single-modal-autovision",
  },
});
send({
  jsonrpc: "2.0",
  id: 10,
  method: "tools/call",
  params: {
    name: "vision_status",
    arguments: {},
  },
});
send({
  jsonrpc: "2.0",
  id: 11,
  method: "tools/call",
  params: {
    name: "vision_set_enabled",
    arguments: {
      enabled: false,
    },
  },
});
send({
  jsonrpc: "2.0",
  id: 12,
  method: "tools/call",
  params: {
    name: "vision_list_recent_images",
    arguments: {
      attachment_hint: "recent-attachment.png 1x1",
      max_results: 3,
    },
  },
});
send({
  jsonrpc: "2.0",
  id: 13,
  method: "tools/call",
  params: {
    name: "vision_set_enabled",
    arguments: {
      enabled: true,
    },
  },
});
send({
  jsonrpc: "2.0",
  id: 14,
  method: "tools/call",
  params: {
    name: "vision_status",
    arguments: {},
  },
});

setTimeout(() => {
  child.kill();
}, 1500);

child.on("exit", () => {
  try {
    fs.unlinkSync(attachmentPath);
  } catch {
    // Test cleanup only.
  }
  const init = responses.find((r) => r.id === 1);
  const tools = responses.find((r) => r.id === 2);
  const register = responses.find((r) => r.id === 3);
  const recentImages = responses.find((r) => r.id === 4);
  const autoRegister = responses.find((r) => r.id === 5);
  const profileList = responses.find((r) => r.id === 6);
  const profileSwitch = responses.find((r) => r.id === 7);
  const promptList = responses.find((r) => r.id === 8);
  const promptGet = responses.find((r) => r.id === 9);
  const visionStatus = responses.find((r) => r.id === 10);
  const visionDisable = responses.find((r) => r.id === 11);
  const disabledRecentImages = responses.find((r) => r.id === 12);
  const visionEnable = responses.find((r) => r.id === 13);
  const finalVisionStatus = responses.find((r) => r.id === 14);
  if (!init?.result?.serverInfo?.name) {
    console.error("Missing initialize response");
    console.error({ responses, stderr });
    process.exit(1);
  }
  if (!init?.result?.capabilities?.prompts) {
    console.error("Missing prompts capability");
    console.error({ responses, stderr });
    process.exit(1);
  }
  if (!Array.isArray(tools?.result?.tools) || tools.result.tools.length < 5) {
    console.error("Missing tools/list response");
    console.error({ responses, stderr });
    process.exit(1);
  }
  const toolNames = tools.result.tools.map((tool) => tool.name);
  if (!toolNames.includes("vision_analyze_attachment")) {
    console.error("Missing vision_analyze_attachment tool");
    console.error({ responses, stderr });
    process.exit(1);
  }
  if (!toolNames.includes("vision_analyze_screenshot")) {
    console.error("Missing vision_analyze_screenshot tool");
    console.error({ responses, stderr });
    process.exit(1);
  }
  if (!toolNames.includes("vision_status") || !toolNames.includes("vision_set_enabled")) {
    console.error("Missing vision switch tools");
    console.error({ responses, stderr });
    process.exit(1);
  }
  if (!register?.result?.content?.[0]?.text?.includes("img_")) {
    console.error("Missing vision_register_image response");
    console.error({ responses, stderr });
    process.exit(1);
  }
  if (!recentImages?.result?.content?.[0]?.text?.includes("recent-attachment.png")) {
    console.error("Missing vision_list_recent_images response");
    console.error({ responses, stderr });
    process.exit(1);
  }
  if (!recentImages.result.content[0].text.includes("autoSelectable")) {
    console.error("Missing attachment auto-selectability metadata");
    console.error({ responses, stderr });
    process.exit(1);
  }
  const recentImagesPayload = JSON.parse(recentImages.result.content[0].text);
  if (recentImagesPayload.status !== "ready_for_analysis") {
    console.error("Missing ready_for_analysis next-step status");
    console.error({ recentImagesPayload, responses, stderr });
    process.exit(1);
  }
  if (recentImagesPayload.recommendedCall?.tool !== "vision_analyze_attachment") {
    console.error("Missing recommended attachment analysis call");
    console.error({ recentImagesPayload, responses, stderr });
    process.exit(1);
  }
  if (!autoRegister?.result?.content?.[0]?.text?.includes("auto_discovered_attachment")) {
    console.error("Missing auto-discovered register response");
    console.error({ responses, stderr });
    process.exit(1);
  }
  if (!profileList?.result?.content?.[0]?.text?.includes("backup-local")) {
    console.error("Missing vision_list_profiles response");
    console.error({ responses, stderr });
    process.exit(1);
  }
  if (!profileSwitch?.result?.content?.[0]?.text?.includes("backup-local")) {
    console.error("Missing vision_switch_profile response");
    console.error({ responses, stderr });
    process.exit(1);
  }
  if (!promptList?.result?.prompts?.some((prompt) => prompt.name === "single-modal-autovision")) {
    console.error("Missing single-modal-autovision prompt");
    console.error({ responses, stderr });
    process.exit(1);
  }
  if (!promptGet?.result?.messages?.[0]?.content?.text?.includes("vision_analyze_screenshot")) {
    console.error("Missing autovision prompt content");
    console.error({ responses, stderr });
    process.exit(1);
  }
  if (!visionStatus?.result?.content?.[0]?.text?.includes("vision_enabled")) {
    console.error("Missing vision_status enabled response");
    console.error({ responses, stderr });
    process.exit(1);
  }
  if (!visionDisable?.result?.content?.[0]?.text?.includes("vision_disabled")) {
    console.error("Missing vision_set_enabled disabled response");
    console.error({ responses, stderr });
    process.exit(1);
  }
  if (!disabledRecentImages?.result?.content?.[0]?.text?.includes("vision_disabled")) {
    console.error("Vision tool did not respect disabled switch");
    console.error({ responses, stderr });
    process.exit(1);
  }
  if (!visionEnable?.result?.content?.[0]?.text?.includes("cannot be re-enabled")) {
    console.error("vision_set_enabled unexpectedly re-enabled MCP vision from disabled state");
    console.error({ responses, stderr });
    process.exit(1);
  }
  if (!finalVisionStatus?.result?.content?.[0]?.text?.includes("vision_disabled")) {
    console.error("Vision switch did not stay disabled after rejected MCP re-enable");
    console.error({ responses, stderr });
    process.exit(1);
  }
  const savedConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
  if (savedConfig.activeProfile !== "backup-local") {
    console.error("Profile switch was not persisted");
    console.error({ savedConfig, responses, stderr });
    process.exit(1);
  }
  if (savedConfig.vision?.enabled !== false) {
    console.error("Vision switch was not kept disabled after rejected MCP re-enable");
    console.error({ savedConfig, responses, stderr });
    process.exit(1);
  }
  console.log(`initialize: ${init.result.serverInfo.name}`);
  console.log(`tools: ${toolNames.join(", ")}`);
  console.log("register: ok");
  console.log("attachments: ok");
  console.log("profiles: ok");
  console.log("vision switch: ok");
  console.log("prompts: ok");
});
