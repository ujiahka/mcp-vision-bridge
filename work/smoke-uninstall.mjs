import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const smokeDir = path.join(root, "work", "uninstall-smoke");
if (!smokeDir.startsWith(path.join(root, "work"))) {
  throw new Error(`Unexpected smoke directory: ${smokeDir}`);
}
fs.rmSync(smokeDir, { recursive: true, force: true });
fs.mkdirSync(smokeDir, { recursive: true });

const env = {
  ...process.env,
  VISION_MCP_CONFIG: path.join(smokeDir, "missing-config.json"),
  VISION_REASONIX_CONFIG_PATH: path.join(smokeDir, "reasonix-config.toml"),
  VISION_REASONIX_AGENTS_PATH: path.join(smokeDir, "reasonix-AGENTS.md"),
  VISION_CODEX_CONFIG_PATH: path.join(smokeDir, "codex-config.toml"),
  VISION_CODEX_AGENTS_PATH: path.join(smokeDir, "codex-AGENTS.md"),
  VISION_CLAUDE_CONFIG_PATH: path.join(smokeDir, "claude.json"),
};

fs.writeFileSync(env.VISION_REASONIX_CONFIG_PATH, [
  "[[plugins]]",
  "name = \"other\"",
  "command = \"other\"",
  "",
  "[[plugins]]",
  "name = \"vision-bridge\"",
  "command = \"mcp-vision-bridge\"",
  "",
  "[[plugins]]",
  "name = \"keep\"",
  "command = \"keep\"",
  "",
].join("\n"));

fs.writeFileSync(env.VISION_REASONIX_AGENTS_PATH, [
  "# Rules",
  "before",
  "<!-- mcp-vision-bridge-autovision:start -->",
  "use vision bridge",
  "<!-- mcp-vision-bridge-autovision:end -->",
  "after",
  "",
].join("\n"));

fs.writeFileSync(env.VISION_CODEX_CONFIG_PATH, [
  "[mcp_servers.other]",
  "command = \"other\"",
  "",
  "[mcp_servers.vision-bridge]",
  "command = \"mcp-vision-bridge\"",
  "",
  "[mcp_servers.vision-bridge.env]",
  "A = \"B\"",
  "",
  "[mcpServers.\"claude-vision-mcp\"]",
  "command = \"claude-vision-mcp\"",
  "",
  "[profiles.default]",
  "model = \"test\"",
  "",
].join("\n"));

fs.writeFileSync(env.VISION_CODEX_AGENTS_PATH, [
  "before",
  "<!-- mcp-vision-bridge-autovision:start -->",
  "use vision bridge",
  "<!-- mcp-vision-bridge-autovision:end -->",
  "after",
  "",
].join("\n"));

fs.writeFileSync(env.VISION_CLAUDE_CONFIG_PATH, JSON.stringify({
  mcpServers: {
    "vision-bridge": { command: "mcp-vision-bridge" },
    other: { command: "other" },
  },
  projects: {
    sample: {
      mcpServers: {
        "claude-vision-mcp": { command: "claude-vision-mcp" },
        keep: { command: "keep" },
      },
    },
  },
}, null, 2));

runUninstall(env);

assert(!read(env.VISION_REASONIX_CONFIG_PATH).includes("vision-bridge"), "Reasonix vision-bridge plugin should be removed");
assert(read(env.VISION_REASONIX_CONFIG_PATH).includes("name = \"other\""), "Reasonix other plugin should remain");
assert(read(env.VISION_REASONIX_CONFIG_PATH).includes("name = \"keep\""), "Reasonix keep plugin should remain");
assert(!read(env.VISION_REASONIX_AGENTS_PATH).includes("mcp-vision-bridge-autovision"), "Reasonix marked block should be removed");
assert(read(env.VISION_REASONIX_AGENTS_PATH).includes("before"), "Reasonix before text should remain");
assert(read(env.VISION_REASONIX_AGENTS_PATH).includes("after"), "Reasonix after text should remain");

assert(!read(env.VISION_CODEX_CONFIG_PATH).includes("vision-bridge"), "Codex vision-bridge table should be removed");
assert(!read(env.VISION_CODEX_CONFIG_PATH).includes("claude-vision-mcp"), "Codex compatibility table should be removed");
assert(read(env.VISION_CODEX_CONFIG_PATH).includes("[mcp_servers.other]"), "Codex other table should remain");
assert(read(env.VISION_CODEX_CONFIG_PATH).includes("[profiles.default]"), "Codex profile table should remain");
assert(!read(env.VISION_CODEX_AGENTS_PATH).includes("mcp-vision-bridge-autovision"), "Codex marked block should be removed");

const claude = JSON.parse(read(env.VISION_CLAUDE_CONFIG_PATH));
assert(!claude.mcpServers["vision-bridge"], "Claude top-level vision bridge should be removed");
assert(claude.mcpServers.other, "Claude top-level other server should remain");
assert(!claude.projects.sample.mcpServers["claude-vision-mcp"], "Claude nested compatibility server should be removed");
assert(claude.projects.sample.mcpServers.keep, "Claude nested keep server should remain");

const restoreEnv = {
  ...env,
  VISION_REASONIX_CONFIG_PATH: path.join(smokeDir, "restore-reasonix.toml"),
  VISION_REASONIX_AGENTS_PATH: path.join(smokeDir, "restore-AGENTS.md"),
  VISION_CODEX_CONFIG_PATH: path.join(smokeDir, "restore-codex.toml"),
  VISION_CODEX_AGENTS_PATH: path.join(smokeDir, "restore-codex-AGENTS.md"),
  VISION_CLAUDE_CONFIG_PATH: path.join(smokeDir, "restore-claude.json"),
};
fs.writeFileSync(restoreEnv.VISION_REASONIX_CONFIG_PATH, "modified\n");
fs.writeFileSync(`${restoreEnv.VISION_REASONIX_CONFIG_PATH}.bak-mcp-vision-bridge`, "original\n");
fs.writeFileSync(restoreEnv.VISION_REASONIX_AGENTS_PATH, "changed\n");
fs.writeFileSync(`${restoreEnv.VISION_REASONIX_AGENTS_PATH}.bak-mcp-vision-bridge`, "agents-original\n");
fs.writeFileSync(restoreEnv.VISION_CLAUDE_CONFIG_PATH, JSON.stringify({ mcpServers: { "vision-bridge": {} } }, null, 2));
fs.writeFileSync(`${restoreEnv.VISION_CLAUDE_CONFIG_PATH}.bak-mcp-vision-bridge`, JSON.stringify({ mcpServers: { keep: {} } }, null, 2));
runUninstall(restoreEnv);
assert(read(restoreEnv.VISION_REASONIX_CONFIG_PATH) === "original\n", "Reasonix config should restore from backup");
assert(read(restoreEnv.VISION_REASONIX_AGENTS_PATH) === "agents-original\n", "Reasonix AGENTS should restore from backup");
const restoredClaude = JSON.parse(read(restoreEnv.VISION_CLAUDE_CONFIG_PATH));
assert(restoredClaude.mcpServers.keep, "Claude config should restore from backup");
assert(!restoredClaude.mcpServers["vision-bridge"], "Claude backup restore should remove vision bridge");

console.log("uninstall: ok");

function runUninstall(runEnv) {
  const result = spawnSync(process.execPath, [path.join(root, "src", "uninstall.js"), "--yes", "--skip-claude"], {
    cwd: root,
    env: runEnv,
    encoding: "utf8",
    timeout: 10000,
  });
  if (result.status !== 0) {
    throw new Error(`uninstall failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  }
}

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
