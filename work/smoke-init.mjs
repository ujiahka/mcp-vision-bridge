import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const noCatalogEnv = { VISION_PROVIDER_CATALOG: path.join(root, "work", "missing-provider-catalog.json") };

async function runInit(name, configPath, answers, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, "src", "init-config.js")], {
      cwd: root,
      env: { ...process.env, ...extraEnv, VISION_MCP_CONFIG: configPath },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.stdin.end(`${answers.join("\n")}\n`);

    child.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`${name} failed with code ${code}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
        return;
      }
      console.log(`${name}: ok`);
      resolve({ stdout, stderr });
    });
  });
}

await runInit("init-en-api", path.join(root, "work", "init-en-config.json"), [
  "2",
  "",
  "",
  "",
  "",
  "https://example.test/v1",
  "",
  "sk-test",
  "",
  "",
  "",
  path.join(root, "work", "init-en-data"),
  "",
  "",
  "",
], noCatalogEnv);

await runInit("init-zh-local", path.join(root, "work", "init-zh-config.json"), [
  "1",
  "2",
  "",
  "",
  "http://127.0.0.1:1234/v1",
  "",
  "",
  "",
  "n",
  path.join(root, "work", "init-zh-data"),
  "",
  "",
  "",
], noCatalogEnv);

await runInit("init-en-anthropic", path.join(root, "work", "init-anthropic-config.json"), [
  "2",
  "",
  "6",
  "anthropic-test",
  "2",
  "claude-test",
  "https://api.example.test",
  "",
  "sk-test",
  "",
  "",
  "",
  path.join(root, "work", "init-anthropic-data"),
  "",
  "",
  "",
], noCatalogEnv);

const xiaomiAnthropicConfigPath = path.join(root, "work", "init-xiaomi-anthropic-config.json");
const providerCatalogPath = path.join(root, "work", "provider-catalog-test.json");
fs.writeFileSync(providerCatalogPath, JSON.stringify({
  providers: {
    xiaomiToken: {
      baseUrls: {
        "openai-compatible": "https://user-provided.example/openai/v1",
        "anthropic-compatible": "https://user-provided.example/anthropic",
      },
    },
    opencodeGo: {
      name: {
        en: "OpenCode Go",
      },
      provider: "opencode",
      plan: "go",
      type: "openai-compatible",
      baseUrl: "https://user-provided.example/opencode/go",
      model: "mimo-v2.5",
    },
  },
}, null, 2));
await runInit("init-en-xiaomi-anthropic", xiaomiAnthropicConfigPath, [
  "2",
  "",
  "2",
  "2",
  "mimo-v2.5",
  "",
  "",
  "sk-test",
  "",
  "",
  "",
  path.join(root, "work", "init-xiaomi-anthropic-data"),
  "",
  "",
  "",
], { VISION_PROVIDER_CATALOG: providerCatalogPath });

const xiaomiAnthropicConfig = JSON.parse(fs.readFileSync(xiaomiAnthropicConfigPath, "utf8"));
if (xiaomiAnthropicConfig.provider.baseUrl !== "https://user-provided.example/anthropic") {
  throw new Error(`Unexpected Xiaomi Anthropic URL: ${xiaomiAnthropicConfig.provider.baseUrl}`);
}
if (xiaomiAnthropicConfig.provider.type !== "anthropic-compatible") {
  throw new Error(`Unexpected Xiaomi provider type: ${xiaomiAnthropicConfig.provider.type}`);
}

const opencodeConfigPath = path.join(root, "work", "init-opencode-config.json");
await runInit("init-en-opencode", opencodeConfigPath, [
  "2",
  "",
  "5",
  "",
  "",
  "",
  "",
  "sk-test",
  "",
  "",
  "",
  path.join(root, "work", "init-opencode-data"),
  "",
  "",
  "",
], { VISION_PROVIDER_CATALOG: providerCatalogPath });

const opencodeConfig = JSON.parse(fs.readFileSync(opencodeConfigPath, "utf8"));
if (opencodeConfig.provider.baseUrl !== "https://user-provided.example/opencode/go") {
  throw new Error(`Unexpected OpenCode Go URL: ${opencodeConfig.provider.baseUrl}`);
}
if (opencodeConfig.provider.model !== "mimo-v2.5") {
  throw new Error(`Unexpected OpenCode Go model: ${opencodeConfig.provider.model}`);
}

const backConfigPath = path.join(root, "work", "init-back-config.json");
await runInit("init-en-back-to-local", backConfigPath, [
  "2",
  "",
  "b",
  "2",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  path.join(root, "work", "init-back-data"),
  "",
  "",
  "",
], noCatalogEnv);

const backConfig = JSON.parse(fs.readFileSync(backConfigPath, "utf8"));
if (backConfig.provider.name !== "local") {
  throw new Error(`Back navigation did not reselect local provider: ${backConfig.provider.name}`);
}
if (!backConfig.profiles || !backConfig.activeProfile) {
  throw new Error("Back navigation config did not write profiles.");
}
