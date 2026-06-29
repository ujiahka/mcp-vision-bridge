import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const configPath = path.join(root, "work", "toggle-vision-config.json");

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

run("off", "disabled");
assertEnabled(false);
run("status", "disabled");
run("on", "enabled");
assertEnabled(true);

console.log("toggle-vision: ok");

function run(command, expectedText) {
  const result = spawnSync(process.execPath, [path.join(root, "src", "toggle-vision.js"), command], {
    cwd: root,
    env: {
      ...process.env,
      VISION_MCP_CONFIG: configPath,
    },
    encoding: "utf8",
    timeout: 10000,
  });
  if (result.status !== 0) {
    throw new Error(`toggle command failed: ${command}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  }
  if (!result.stdout.includes(expectedText)) {
    throw new Error(`toggle command did not mention ${expectedText}: ${command}\n${result.stdout}`);
  }
}

function assertEnabled(expected) {
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  if (config.vision?.enabled !== expected) {
    throw new Error(`Expected vision.enabled=${expected}, got ${config.vision?.enabled}`);
  }
}
