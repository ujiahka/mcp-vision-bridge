import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const baseSmokeEnv = { VISION_MCP_SKIP_CLIENT_REGISTER: "true" };
const noCatalogEnv = {
  ...baseSmokeEnv,
  VISION_PROVIDER_CATALOG: path.join(root, "work", "missing-provider-catalog.json"),
};

async function runInit(name, configPath, answers, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, "src", "init-config.js")], {
      cwd: root,
      env: { ...process.env, ...baseSmokeEnv, ...extraEnv, VISION_MCP_CONFIG: configPath },
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

const appendConfigPath = path.join(root, "work", "init-append-config.json");
const appendDataDir = path.join(root, "work", "init-append-data");
const appendLogDir = path.join(root, "work", "init-append-logs");
fs.writeFileSync(appendConfigPath, JSON.stringify({
  version: 1,
  language: "en",
  vision: {
    enabled: false,
  },
  activeProfile: "existing-local",
  provider: {
    name: "existing-local",
    type: "openai-compatible",
    plan: "local",
    baseUrl: "http://127.0.0.1:1234/v1",
    model: "qwen/existing",
    apiKey: "local",
  },
  profiles: {
    "existing-local": {
      name: "Existing Local",
      provider: {
        name: "existing-local",
        type: "openai-compatible",
        plan: "local",
        baseUrl: "http://127.0.0.1:1234/v1",
        model: "qwen/existing",
        apiKey: "local",
      },
    },
  },
  privacy: {
    allowRemoteEndpoint: false,
    allowUrlFetch: true,
    telemetry: false,
    storeImages: true,
  },
  dataDir: appendDataDir,
  logging: {
    enabled: true,
    includePrompt: true,
    includeResult: false,
    dir: appendLogDir,
  },
}, null, 2));

await runInit("init-en-append-profile", appendConfigPath, [
  "2",
  "2",
  "",
  "qwen/new",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
], noCatalogEnv);

const appendConfig = JSON.parse(fs.readFileSync(appendConfigPath, "utf8"));
if (!appendConfig.profiles["existing-local"]) {
  throw new Error("Existing profile was removed during append setup.");
}
if (!appendConfig.profiles["local-local-qwen-new"]) {
  throw new Error(`New appended profile is missing. Profiles: ${Object.keys(appendConfig.profiles).join(", ")}`);
}
if (appendConfig.activeProfile !== "existing-local") {
  throw new Error(`Append setup should preserve the active profile, got: ${appendConfig.activeProfile}`);
}
if (appendConfig.provider.model !== "qwen/existing") {
  throw new Error(`Append setup should preserve the active provider, got: ${appendConfig.provider.model}`);
}
if (appendConfig.dataDir !== appendDataDir) {
  throw new Error(`Append setup should preserve dataDir, got: ${appendConfig.dataDir}`);
}
if (appendConfig.logging.dir !== appendLogDir) {
  throw new Error(`Append setup should preserve log dir, got: ${appendConfig.logging.dir}`);
}
if (appendConfig.logging.includeResult !== false) {
  throw new Error("Append setup should preserve includeResult default.");
}
if (appendConfig.privacy.allowUrlFetch !== true) {
  throw new Error("Append setup should preserve allowUrlFetch default.");
}
if (appendConfig.vision.enabled !== false) {
  throw new Error("Append setup should preserve the vision switch.");
}
