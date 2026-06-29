#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { stdin as input, stdout as output } from "node:process";
import { defaultConfigDir, loadConfig } from "./config.js";

const SERVER_NAMES = [
  "vision-bridge",
  "mcp-vision-bridge",
  "claude-vision-mcp",
  "local-vision-mcp",
];

const REASONIX_START_MARKER = "<!-- mcp-vision-bridge-autovision:start -->";
const REASONIX_END_MARKER = "<!-- mcp-vision-bridge-autovision:end -->";

const TEXT = {
  zh: {
    title: "MCP Vision Bridge 卸载清理",
    intro: "此命令会还原或清理本项目写入过的 MCP 客户端配置。不会删除你的本地识图日志、图片缓存或 API Key 配置目录。",
    confirm: "继续清理客户端配置吗？",
    cancelled: "已取消。",
    dryRun: "dry-run：只展示将要执行的操作，不写入文件。",
    changed: "已处理",
    unchanged: "无需处理",
    skipped: "已跳过",
    failed: "失败",
    restored: "已从备份恢复",
    removed: "已移除项目写入项",
    backupMade: "已创建卸载前安全备份",
    backupWould: "将创建卸载前安全备份",
    missing: "文件不存在",
    claudeMissing: "未检测到 claude 命令",
    claudeRemove: "移除 Claude Code MCP 注册项",
    claudeJson: "清理 Claude Code 配置文件",
    reasonixConfig: "清理 Reasonix config.toml",
    reasonixAgents: "清理 Reasonix AGENTS.md",
    codexConfig: "清理 Codex config.toml",
    codexAgents: "清理 Codex AGENTS.md",
    localData: "本地数据仍保留在",
    npmNext: "之后再运行：npm uninstall -g mcp-vision-bridge",
    help: "用法：mcp-vision-bridge-uninstall [--dry-run] [--yes] [--skip-claude]",
    summary: "清理结果",
  },
  en: {
    title: "MCP Vision Bridge uninstall cleanup",
    intro: "This command restores or removes MCP client config written by this project. It does not delete local recognition logs, image cache, or API key config.",
    confirm: "Continue cleaning client config?",
    cancelled: "Cancelled.",
    dryRun: "dry-run: show planned operations without writing files.",
    changed: "changed",
    unchanged: "unchanged",
    skipped: "skipped",
    failed: "failed",
    restored: "restored from backup",
    removed: "removed project entries",
    backupMade: "created pre-uninstall safety backup",
    backupWould: "would create pre-uninstall safety backup",
    missing: "file not found",
    claudeMissing: "claude command not found",
    claudeRemove: "Remove Claude Code MCP registration",
    claudeJson: "Clean Claude Code config file",
    reasonixConfig: "Clean Reasonix config.toml",
    reasonixAgents: "Clean Reasonix AGENTS.md",
    codexConfig: "Clean Codex config.toml",
    codexAgents: "Clean Codex AGENTS.md",
    localData: "Local data remains at",
    npmNext: "Then run: npm uninstall -g mcp-vision-bridge",
    help: "Usage: mcp-vision-bridge-uninstall [--dry-run] [--yes] [--skip-claude]",
    summary: "Cleanup summary",
  },
};

if (isDirectRun()) {
  main().catch((err) => {
    console.error(err?.message || String(err));
    process.exitCode = 1;
  });
}

export {
  removeMarkedBlock,
  removeMcpServerKeys,
  removeNamedTomlTables,
  removeReasonixPluginToml,
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const language = detectLanguage();
  const t = TEXT[language] || TEXT.en;

  if (options.help) {
    console.log(t.help);
    return;
  }

  console.log(t.title);
  console.log(t.intro);
  if (options.dryRun) console.log(t.dryRun);
  console.log("");

  if (!options.yes && !options.dryRun) {
    const ok = await confirm(t.confirm, language);
    if (!ok) {
      console.log(t.cancelled);
      return;
    }
  }

  const records = [];
  const context = { options, records, t };

  cleanupReasonixConfig(context);
  cleanupReasonixAgents(context);
  cleanupCodexConfig(context);
  cleanupCodexAgents(context);
  cleanupClaudeCode(context);
  cleanupClaudeJson(context);

  console.log("");
  console.log(t.summary);
  for (const record of records) {
    console.log(`- [${record.status}] ${record.label}: ${record.detail}`);
  }
  console.log("");
  console.log(`${t.localData}: ${defaultConfigDir()}`);
  console.log(t.npmNext);
}

function cleanupReasonixConfig(context) {
  cleanupTextFile({
    label: context.t.reasonixConfig,
    target: reasonixConfigPath(),
    backup: `${reasonixConfigPath()}.bak-mcp-vision-bridge`,
    transform: removeReasonixPluginToml,
    context,
  });
}

function cleanupReasonixAgents(context) {
  cleanupTextFile({
    label: context.t.reasonixAgents,
    target: reasonixAgentsPath(),
    backup: `${reasonixAgentsPath()}.bak-mcp-vision-bridge`,
    transform: (text) => removeMarkedBlock(text, REASONIX_START_MARKER, REASONIX_END_MARKER),
    context,
  });
}

function cleanupCodexConfig(context) {
  cleanupTextFile({
    label: context.t.codexConfig,
    target: codexConfigPath(),
    backup: `${codexConfigPath()}.bak-mcp-vision-bridge`,
    transform: (text) => removeNamedTomlTables(text, ["mcp_servers", "mcpServers"], SERVER_NAMES),
    context,
  });
}

function cleanupCodexAgents(context) {
  cleanupTextFile({
    label: context.t.codexAgents,
    target: codexAgentsPath(),
    backup: `${codexAgentsPath()}.bak-mcp-vision-bridge`,
    transform: (text) => removeMarkedBlock(text, REASONIX_START_MARKER, REASONIX_END_MARKER),
    context,
  });
}

function cleanupClaudeCode(context) {
  const { options, t } = context;
  if (options.skipClaude) {
    addRecord(context, "skipped", t.claudeRemove, "--skip-claude");
    return;
  }

  const claudeCommand = findCommand("claude");
  if (!claudeCommand) {
    addRecord(context, "skipped", t.claudeRemove, t.claudeMissing);
    return;
  }

  const attempts = [
    ["mcp", "remove", "--scope", "user", "vision-bridge"],
    ["mcp", "remove", "vision-bridge", "--scope", "user"],
    ["mcp", "remove", "vision-bridge"],
  ];

  if (options.dryRun) {
    addRecord(context, "dry-run", t.claudeRemove, `${claudeCommand} ${attempts[0].join(" ")}`);
    return;
  }

  for (const args of attempts) {
    const result = runCommand(claudeCommand, args);
    if (result.status === 0) {
      addRecord(context, "changed", t.claudeRemove, `${t.removed}: vision-bridge`);
      return;
    }
    if (isNotFoundMessage(result.stderr) || isNotFoundMessage(result.stdout)) {
      addRecord(context, "unchanged", t.claudeRemove, "vision-bridge not registered");
      return;
    }
  }

  addRecord(context, "failed", t.claudeRemove, "claude mcp remove returned a non-zero exit code");
}

function cleanupClaudeJson(context) {
  const target = claudeConfigPath();
  const backup = `${target}.bak-mcp-vision-bridge`;
  if (fs.existsSync(backup)) {
    restoreFromBackup({ label: context.t.claudeJson, target, backup, context });
    return;
  }

  cleanupJsonFile({
    label: context.t.claudeJson,
    target,
    transform: (json) => removeMcpServerKeys(json, SERVER_NAMES),
    context,
  });
}

function cleanupTextFile({ label, target, backup, transform, context }) {
  const { options, t } = context;
  if (backup && fs.existsSync(backup)) {
    restoreFromBackup({ label, target, backup, context });
    return;
  }

  if (!fs.existsSync(target)) {
    addRecord(context, "skipped", label, `${t.missing}: ${target}`);
    return;
  }

  const original = fs.readFileSync(target, "utf8");
  const next = transform(original);
  if (next === original) {
    addRecord(context, "unchanged", label, target);
    return;
  }

  const safetyBackup = createSafetyBackup(target, context);
  if (!options.dryRun) fs.writeFileSync(target, next, "utf8");
  addRecord(context, options.dryRun ? "dry-run" : "changed", label, `${t.removed}: ${target}; ${safetyBackup}`);
}

function cleanupJsonFile({ label, target, transform, context }) {
  const { options, t } = context;
  if (!fs.existsSync(target)) {
    addRecord(context, "skipped", label, `${t.missing}: ${target}`);
    return;
  }

  let json;
  try {
    json = JSON.parse(fs.readFileSync(target, "utf8"));
  } catch (err) {
    addRecord(context, "failed", label, `${target}: ${err.message}`);
    return;
  }

  const changed = transform(json);
  if (!changed) {
    addRecord(context, "unchanged", label, target);
    return;
  }

  const safetyBackup = createSafetyBackup(target, context);
  if (!options.dryRun) fs.writeFileSync(target, `${JSON.stringify(json, null, 2)}\n`, "utf8");
  addRecord(context, options.dryRun ? "dry-run" : "changed", label, `${t.removed}: ${target}; ${safetyBackup}`);
}

function restoreFromBackup({ label, target, backup, context }) {
  const { options, t } = context;
  const backupContent = fs.readFileSync(backup, "utf8");
  const currentContent = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : null;
  if (currentContent === backupContent) {
    addRecord(context, "unchanged", label, `${t.restored}: ${target}`);
    return;
  }

  const safetyBackup = fs.existsSync(target) ? createSafetyBackup(target, context) : "";
  if (!options.dryRun) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(backup, target);
  }
  const detail = `${t.restored}: ${backup} -> ${target}${safetyBackup ? `; ${safetyBackup}` : ""}`;
  addRecord(context, options.dryRun ? "dry-run" : "changed", label, detail);
}

function createSafetyBackup(target, context) {
  const { options, t } = context;
  const backup = uniquePath(`${target}.bak-before-mcp-vision-bridge-uninstall-${timestamp()}`);
  if (options.dryRun) return `${t.backupWould}: ${backup}`;
  fs.copyFileSync(target, backup);
  return `${t.backupMade}: ${backup}`;
}

function removeReasonixPluginToml(text) {
  const eol = detectEol(text);
  const lines = splitLines(text);
  const output = [];

  for (let index = 0; index < lines.length;) {
    if (isTomlArrayHeader(lines[index], "plugins")) {
      const block = [];
      do {
        block.push(lines[index]);
        index += 1;
      } while (index < lines.length && !isTomlAnyHeader(lines[index]));

      if (block.some((line) => /^\s*name\s*=\s*["']vision-bridge["']\s*(?:#.*)?$/u.test(line))) {
        continue;
      }
      output.push(...block);
      continue;
    }

    output.push(lines[index]);
    index += 1;
  }

  return joinLines(output, eol, text);
}

function removeNamedTomlTables(text, prefixes, names) {
  const eol = detectEol(text);
  const lines = splitLines(text);
  const output = [];

  for (let index = 0; index < lines.length;) {
    const header = parseTomlSingleHeader(lines[index]);
    if (header && matchesNamedTable(header, prefixes, names)) {
      do {
        index += 1;
      } while (index < lines.length && !isTomlAnyHeader(lines[index]));
      continue;
    }

    output.push(lines[index]);
    index += 1;
  }

  return joinLines(output, eol, text);
}

function removeMarkedBlock(text, startMarker, endMarker) {
  const eol = detectEol(text);
  const lines = splitLines(text);
  const output = [];
  let removed = false;

  for (let index = 0; index < lines.length;) {
    if (lines[index].includes(startMarker)) {
      removed = true;
      index += 1;
      while (index < lines.length && !lines[index].includes(endMarker)) index += 1;
      if (index < lines.length) index += 1;
      continue;
    }
    output.push(lines[index]);
    index += 1;
  }

  return removed ? joinLines(output, eol, text).replace(/\n{3,}/g, "\n\n") : text;
}

function removeMcpServerKeys(value, names = SERVER_NAMES) {
  let changed = false;

  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }

    if (node.mcpServers && typeof node.mcpServers === "object" && !Array.isArray(node.mcpServers)) {
      for (const name of names) {
        if (Object.prototype.hasOwnProperty.call(node.mcpServers, name)) {
          delete node.mcpServers[name];
          changed = true;
        }
      }
    }

    for (const item of Object.values(node)) visit(item);
  }

  visit(value);
  return changed;
}

function parseTomlSingleHeader(line) {
  const match = /^\s*\[(?!\[)([^\]]+)\]\s*(?:#.*)?$/u.exec(line);
  return match ? normalizeTomlPath(match[1]) : null;
}

function matchesNamedTable(parts, prefixes, names) {
  for (const prefix of prefixes) {
    const prefixParts = prefix.split(".");
    if (parts.length <= prefixParts.length) continue;
    if (!prefixParts.every((part, index) => parts[index] === part)) continue;
    if (names.includes(parts[prefixParts.length])) return true;
  }
  return false;
}

function normalizeTomlPath(value) {
  return String(value)
    .split(".")
    .map((part) => part.trim().replace(/^["']|["']$/g, ""));
}

function isTomlArrayHeader(line, name) {
  return new RegExp(`^\\s*\\[\\[\\s*${escapeRegExp(name)}\\s*\\]\\]\\s*(?:#.*)?$`, "u").test(line);
}

function isTomlAnyHeader(line) {
  return /^\s*\[\[?[^\]]+\]\]?\s*(?:#.*)?$/u.test(line);
}

function splitLines(text) {
  const lines = text.split(/\r?\n/u);
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function joinLines(lines, eol, originalText) {
  const body = lines.join(eol);
  return originalText.endsWith("\n") || originalText.endsWith("\r\n") ? `${body}${eol}` : body;
}

function detectEol(text) {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

function reasonixConfigPath() {
  return process.env.VISION_REASONIX_CONFIG_PATH || path.join(reasonixDir(), "config.toml");
}

function reasonixAgentsPath() {
  return process.env.VISION_REASONIX_AGENTS_PATH || path.join(reasonixDir(), "AGENTS.md");
}

function codexConfigPath() {
  return process.env.VISION_CODEX_CONFIG_PATH || path.join(os.homedir(), ".codex", "config.toml");
}

function codexAgentsPath() {
  return process.env.VISION_CODEX_AGENTS_PATH || path.join(os.homedir(), ".codex", "AGENTS.md");
}

function claudeConfigPath() {
  return process.env.VISION_CLAUDE_CONFIG_PATH || path.join(os.homedir(), ".claude.json");
}

function reasonixDir() {
  if (process.env.VISION_REASONIX_DIR) return process.env.VISION_REASONIX_DIR;
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "reasonix");
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "reasonix");
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "reasonix");
}

function detectLanguage() {
  try {
    const config = loadConfig({ allowMissing: true });
    if (config.language === "zh") return "zh";
  } catch {
    // Fall through to environment detection.
  }
  return /^zh/i.test(process.env.LANG || process.env.LANGUAGE || "") ? "zh" : "en";
}

function parseArgs(args) {
  const options = {
    dryRun: false,
    yes: false,
    skipClaude: false,
    help: false,
  };
  for (const arg of args) {
    if (arg === "--dry-run" || arg === "--check") options.dryRun = true;
    else if (arg === "--yes" || arg === "-y") options.yes = true;
    else if (arg === "--skip-claude") options.skipClaude = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
  }
  return options;
}

async function confirm(prompt, language) {
  const rl = readline.createInterface({ input, output });
  try {
    const hint = language === "zh" ? "y/N" : "y/N";
    const answer = (await rl.question(`${prompt} (${hint}): `)).trim().toLowerCase();
    return ["y", "yes", "1", "true", "是", "好", "确认"].includes(answer);
  } finally {
    rl.close();
  }
}

function addRecord(context, status, label, detail) {
  context.records.push({ status, label, detail });
}

function findCommand(command) {
  const result = process.platform === "win32"
    ? spawnSync("where.exe", [command], { encoding: "utf8", timeout: 10000 })
    : spawnSync("sh", ["-lc", `command -v ${shellQuote(command)}`], { encoding: "utf8", timeout: 10000 });
  if (result.status !== 0) return "";

  const lines = String(result.stdout || "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return "";
  if (process.platform === "win32") {
    return lines.find((line) => line.toLowerCase().endsWith(".cmd")) || lines[0];
  }
  return lines[0];
}

function runCommand(command, args) {
  const result = spawnCommand(command, args, {
    encoding: "utf8",
    timeout: 30000,
    windowsHide: true,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || result.error?.message || "",
  };
}

function spawnCommand(command, args, options) {
  if (process.platform === "win32" && /\.(cmd|bat)$/i.test(command)) {
    return spawnSync(process.env.ComSpec || "cmd.exe", [
      "/d",
      "/s",
      "/c",
      [winShellQuote(command), ...args.map(winShellQuote)].join(" "),
    ], options);
  }
  return spawnSync(command, args, options);
}

function isNotFoundMessage(value) {
  return /(not\s+found|does\s+not\s+exist|unknown|no\s+such|未找到|不存在)/iu.test(String(value || ""));
}

function uniquePath(basePath) {
  if (!fs.existsSync(basePath)) return basePath;
  let index = 2;
  for (;;) {
    const candidate = `${basePath}-${index}`;
    if (!fs.existsSync(candidate)) return candidate;
    index += 1;
  }
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/u, "").replace("T", "-");
}

function isDirectRun() {
  return path.resolve(process.argv[1] || "") === path.resolve(fileURLToPath(import.meta.url));
}

function winShellQuote(value) {
  const text = String(value);
  if (!/[ \t&()^|<>"]/u.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
