import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const configPath = path.join(root, "work", "manage-config.json");

fs.writeFileSync(configPath, JSON.stringify({
  version: 1,
  language: "en",
  vision: {
    enabled: true,
  },
  activeProfile: "first-local",
  provider: {
    name: "first-local",
    type: "openai-compatible",
    plan: "local",
    baseUrl: "http://127.0.0.1:1234/v1",
    model: "qwen/qwen3-vl-8b",
    apiKey: "local",
  },
  profiles: {
    "first-local": {
      name: "First Local",
      provider: {
        name: "first-local",
        type: "openai-compatible",
        plan: "local",
        baseUrl: "http://127.0.0.1:1234/v1",
        model: "qwen/qwen3-vl-8b",
        apiKey: "local",
      },
    },
    "second-api": {
      name: "Second API",
      provider: {
        name: "xiaomi-mimo",
        type: "anthropic-compatible",
        plan: "token",
        baseUrl: "https://token-plan-cn.xiaomimimo.com/anthropic",
        model: "mimo-v2.5",
        apiKey: "sk-test",
      },
    },
  },
  dataDir: path.join(root, "work", "manage-data"),
}, null, 2));

const dashboard = run([], ["MCP Vision Bridge", "Overview", "Quick Actions", "Command Center", "qwen/qwen3-vl-8b", "mvb 5"]);
assertNoTruncation(dashboard.stdout);
run(["4"], ["Model Profiles", "first-local", "second-api", "http://127.0.0.1:1234/v1"]);
run(["3"], ["Vision switch: OFF"]);
assertConfig((config) => config.vision?.enabled === false, "vision switch should be off");
run(["2"], ["Vision switch: ON"]);
assertConfig((config) => config.vision?.enabled === true, "vision switch should be on");
run(["5", "2"], ["Active profile switched: second-api", "mimo-v2.5"]);
assertConfig((config) => config.activeProfile === "second-api", "active profile should be second-api");
run(["5", "first-local"], ["Active profile switched: first-local", "qwen/qwen3-vl-8b"]);
assertConfig((config) => config.activeProfile === "first-local", "active profile should be first-local");
run(["8"], ["Paths", "Config", "Data dir"]);
run(["10"], ["claude mcp add", "mcpServers"]);

updateConfig((config) => {
  config.language = "zh";
});
const zhDashboard = run([], ["MCP Vision Bridge 管理面板", "状态总览", "识图开关", "命令中心", "切换模型"]);
assertNoTruncation(zhDashboard.stdout);
run(["4"], ["模型列表", "first-local", "second-api"]);

console.log("manage: ok");

function run(args, expectedTexts) {
  const result = spawnSync(process.execPath, [path.join(root, "src", "manage.js"), ...args], {
    cwd: root,
    env: {
      ...process.env,
      VISION_MCP_CONFIG: configPath,
    },
    encoding: "utf8",
    timeout: 10000,
  });
  if (result.status !== 0) {
    throw new Error(`manage command failed: ${args.join(" ")}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  }
  for (const text of expectedTexts) {
    if (!result.stdout.includes(text)) {
      throw new Error(`manage output missing ${text}: ${args.join(" ")}\n${result.stdout}`);
    }
  }
  return result;
}

function assertConfig(predicate, message) {
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  if (!predicate(config)) throw new Error(message);
}

function updateConfig(mutator) {
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  mutator(config);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function assertNoTruncation(output) {
  if (output.includes("...")) throw new Error(`management UI should wrap instead of truncating:\n${output}`);
}
