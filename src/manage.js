#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  defaultConfigPath,
  isVisionEnabled,
  listProfiles,
  loadConfig,
  saveConfig,
  setVisionEnabled,
  switchActiveProfile,
} from "./config.js";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const MIN_WIDTH = 76;
const MAX_WIDTH = 118;
const COLOR_ENABLED = Boolean(process.stdout.isTTY && !process.env.NO_COLOR && process.env.TERM !== "dumb");
const ANSI = {
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  cyan: "\u001b[36m",
};

const COMMANDS = [
  { id: 1, group: "common", usage: "mvb 1", textKey: "cmdStatus" },
  { id: 2, group: "vision", usage: "mvb 2", textKey: "cmdOn" },
  { id: 3, group: "vision", usage: "mvb 3", textKey: "cmdOff" },
  { id: 4, group: "model", usage: "mvb 4", textKey: "cmdProfiles" },
  { id: 5, group: "model", usage: "mvb 5 <no|id>", textKey: "cmdSwitch" },
  { id: 6, group: "system", usage: "mvb 6", textKey: "cmdDoctor" },
  { id: 7, group: "system", usage: "mvb 7", textKey: "cmdInit" },
  { id: 8, group: "system", usage: "mvb 8", textKey: "cmdConfig" },
  { id: 9, group: "common", usage: "mvb 9", textKey: "cmdHelp" },
  { id: 10, group: "client", usage: "mvb 10", textKey: "cmdClient" },
  { id: 11, group: "system", usage: "mvb 11", textKey: "cmdUninstall" },
];

const COMMAND_GROUPS = ["vision", "model", "system", "client", "common"];

const TEXT = {
  zh: {
    dashboardTitle: "MCP Vision Bridge 管理面板",
    subtitle: "本地优先的 MCP 视觉桥接控制台",
    overview: "状态总览",
    config: "配置文件",
    visionSwitch: "识图开关",
    visionOn: "ON  单模态模型通过 MCP 识图",
    visionOff: "OFF 多模态模型使用自身识图",
    activeProfile: "当前配置",
    currentModel: "当前模型",
    provider: "服务商",
    endpoint: "接口地址",
    plan: "套餐",
    format: "格式",
    profilesTitle: "模型列表",
    noProfiles: "未找到模型配置。运行：mvb 7",
    activeTag: "当前",
    switchModelHint: "切换模型：mvb 5 <序号|配置ID>",
    quickActions: "快捷操作",
    quickOn: "单模态模型",
    quickOff: "多模态模型",
    quickSwitch: "切换模型",
    commandsTitle: "命令中心",
    useHint: "执行方式：mvb <序号> [参数]，例如 mvb 5 2",
    unknownCommand: "未知命令",
    unknownProfile: "未知配置",
    runSetup: "请先运行安装向导：mvb 7",
    pathsTitle: "配置和数据路径",
    dataDir: "数据目录",
    logDir: "日志目录",
    clientTitle: "MCP 客户端配置片段",
    claudeCode: "Claude Code",
    reasonix: "Reasonix（%APPDATA%\\reasonix\\config.toml）",
    genericJson: "通用 MCP JSON",
    switchSavedOn: "MCP 识图已开启。",
    switchSavedOff: "MCP 识图已关闭。",
    onDetail: "单模态宿主模型会使用 MCP 识图。",
    offDetail: "多模态宿主模型应使用自身图片能力。",
    saved: "已保存",
    switched: "已切换当前配置",
    model: "模型",
    usageSwitch: "用法：mvb 5 <序号|配置ID>",
    aliases: "别名",
    aliasDashboard: "mvb                 显示管理面板",
    aliasToggle: "mvb on/off/status   开关或查看识图状态",
    aliasSwitchNo: "mvb switch 2        切换到第 2 个配置",
    aliasSwitchId: "mvb switch <id>     按配置 ID 切换",
    aliasUninstall: "mvb uninstall      卸载前还原/清理客户端配置",
    groupVision: "识图开关",
    groupModel: "模型管理",
    groupSystem: "系统维护",
    groupClient: "客户端",
    groupCommon: "常用",
    cmdStatus: "显示管理面板",
    cmdOn: "开启 MCP 识图，供单模态宿主模型使用",
    cmdOff: "关闭 MCP 识图，让多模态宿主模型使用自身图片能力",
    cmdProfiles: "查看已配置的模型列表",
    cmdSwitch: "切换当前使用的视觉模型或套餐",
    cmdDoctor: "运行环境和配置诊断",
    cmdInit: "重新运行安装向导，追加模型配置",
    cmdConfig: "查看配置、数据和日志路径",
    cmdHelp: "显示命令用法",
    cmdClient: "打印 MCP 客户端注册片段",
    cmdUninstall: "卸载前还原/清理客户端配置",
  },
  en: {
    dashboardTitle: "MCP Vision Bridge Management",
    subtitle: "Local-first MCP vision bridge console",
    overview: "Overview",
    config: "Config",
    visionSwitch: "Vision switch",
    visionOn: "ON  text-only host uses MCP vision",
    visionOff: "OFF multimodal host uses native vision",
    activeProfile: "Active profile",
    currentModel: "Current model",
    provider: "Provider",
    endpoint: "Endpoint",
    plan: "Plan",
    format: "Format",
    profilesTitle: "Model Profiles",
    noProfiles: "No profiles found. Run: mvb 7",
    activeTag: "active",
    switchModelHint: "Switch model: mvb 5 <profile-no|profile-id>",
    quickActions: "Quick Actions",
    quickOn: "Text-only model",
    quickOff: "Multimodal model",
    quickSwitch: "Switch model",
    commandsTitle: "Command Center",
    useHint: "Run by number: mvb <number> [args], for example mvb 5 2",
    unknownCommand: "Unknown command",
    unknownProfile: "Unknown profile",
    runSetup: "Run setup: mvb 7",
    pathsTitle: "Paths",
    dataDir: "Data dir",
    logDir: "Log dir",
    clientTitle: "MCP Client Snippets",
    claudeCode: "Claude Code",
    reasonix: "Reasonix (%APPDATA%\\reasonix\\config.toml)",
    genericJson: "Generic MCP JSON",
    switchSavedOn: "Vision switch: ON",
    switchSavedOff: "Vision switch: OFF",
    onDetail: "Text-only host models will use MCP vision.",
    offDetail: "Native multimodal host models should use their own image ability.",
    saved: "Saved",
    switched: "Active profile switched",
    model: "Model",
    usageSwitch: "Usage: mvb 5 <profile-no|profile-id>",
    aliases: "Aliases",
    aliasDashboard: "mvb                 Show dashboard",
    aliasToggle: "mvb on/off/status   Toggle or view vision switch",
    aliasSwitchNo: "mvb switch 2        Switch to profile #2",
    aliasSwitchId: "mvb switch <id>     Switch to profile id",
    aliasUninstall: "mvb uninstall      Restore/clean client config before uninstall",
    groupVision: "Vision Switch",
    groupModel: "Model Management",
    groupSystem: "System",
    groupClient: "Client",
    groupCommon: "Common",
    cmdStatus: "Show this management page",
    cmdOn: "Enable MCP vision for text-only host models",
    cmdOff: "Disable MCP vision for native multimodal host models",
    cmdProfiles: "Show configured model profiles",
    cmdSwitch: "Switch active vision model/profile",
    cmdDoctor: "Run environment and config diagnostics",
    cmdInit: "Run setup wizard again and append profiles",
    cmdConfig: "Print config path and local data paths",
    cmdHelp: "Show command usage",
    cmdClient: "Print MCP client registration snippets",
    cmdUninstall: "Restore/clean client config before uninstall",
  },
};

const ALIASES = new Map([
  ["s", 1],
  ["status", 1],
  ["dashboard", 1],
  ["ui", 1],
  ["on", 2],
  ["enable", 2],
  ["off", 3],
  ["disable", 3],
  ["profiles", 4],
  ["models", 4],
  ["list", 4],
  ["switch", 5],
  ["use", 5],
  ["doctor", 6],
  ["check", 6],
  ["init", 7],
  ["setup", 7],
  ["config", 8],
  ["path", 8],
  ["help", 9],
  ["h", 9],
  ["client", 10],
  ["mcp", 10],
  ["uninstall", 11],
  ["cleanup", 11],
  ["remove", 11],
  ["状态", 1],
  ["面板", 1],
  ["开启", 2],
  ["开", 2],
  ["关闭", 3],
  ["关", 3],
  ["模型", 4],
  ["列表", 4],
  ["切换", 5],
  ["诊断", 6],
  ["初始化", 7],
  ["安装", 7],
  ["配置", 8],
  ["路径", 8],
  ["帮助", 9],
  ["卸载", 11],
  ["清理", 11],
  ["还原", 11],
]);

main();

function main() {
  const args = process.argv.slice(2);
  const commandId = parseCommandId(args[0]);

  if (!args.length || commandId === 1) {
    renderDashboard(loadConfigOrExit());
    return;
  }

  switch (commandId) {
    case 2:
      setVisionSwitch(true);
      return;
    case 3:
      setVisionSwitch(false);
      return;
    case 4:
      renderProfilesPage(loadConfigOrExit());
      return;
    case 5:
      switchProfile(args[1]);
      return;
    case 6:
      runScript("doctor.js");
      return;
    case 7:
      runScript("init-config.js");
      return;
    case 8:
      renderConfigPaths(loadConfigOrExit());
      return;
    case 9:
      renderHelp(loadConfigOrNull());
      return;
    case 10:
      renderClientSnippets(loadConfigOrNull());
      return;
    case 11:
      runScript("uninstall.js", args.slice(1));
      return;
    default:
      {
        const config = loadConfigOrNull();
        const t = textFor(config);
        console.error(`${t.unknownCommand}: ${args[0] || ""}`);
        renderHelp(config);
      }
      process.exitCode = 1;
  }
}

function renderDashboard(config) {
  const t = textFor(config);
  const width = terminalWidth();
  printBanner(t, width);
  printOverview(config, t, width);
  printQuickActions(t, width);
  renderProfiles(config, t, width, { compact: true });
  renderCommands(t, width);
  console.log("");
  console.log(t.useHint);
}

function renderProfilesPage(config) {
  const t = textFor(config);
  const width = terminalWidth();
  printBanner(t, width);
  renderProfiles(config, t, width, { compact: false });
}

function printBanner(t, width) {
  console.log("");
  console.log(`${color("✻", "cyan")} ${color(t.dashboardTitle, "bold")}`);
  console.log(`  ${color(t.subtitle, "dim")}`);
  console.log(color("─".repeat(Math.min(width, 92)), "dim"));
}

function printOverview(config, t, width) {
  const provider = config.provider || {};
  const switchText = isVisionEnabled(config)
    ? `${badge("ON", "green")} ${t.visionOn.replace(/^ON\s*/u, "")}`
    : `${badge("OFF", "yellow")} ${t.visionOff.replace(/^OFF\s*/u, "")}`;
  const lines = [
    formatField(t.visionSwitch, switchText),
    formatField(t.currentModel, provider.model || "(not set)"),
    formatField(t.activeProfile, config.activeProfile || "default"),
    formatField(t.provider, `${provider.name || "(not set)"} / ${provider.plan || "custom"} / ${provider.type || "(not set)"}`),
    formatField(t.endpoint, provider.baseUrl || "(not set)"),
    formatField(t.config, defaultConfigPath()),
  ];
  printSection(t.overview, lines, width);
}

function printQuickActions(t, width) {
  const lines = [
    `${commandNo(2, 2)} ${"mvb 2".padEnd(14)} ${t.quickOn}`,
    `${commandNo(3, 2)} ${"mvb 3".padEnd(14)} ${t.quickOff}`,
    `${commandNo(5, 2)} ${"mvb 5 2".padEnd(14)} ${t.quickSwitch}`,
  ];
  printSection(t.quickActions, lines, width);
}

function renderProfiles(config, t = textFor(config), width = terminalWidth(), options = {}) {
  const profiles = listProfiles(config);
  if (!profiles.length) {
    printSection(t.profilesTitle, [t.noProfiles], width);
    return;
  }

  const lines = [];
  for (const [index, profile] of profiles.entries()) {
    if (index > 0) lines.push("");
    lines.push(formatProfileTitle(index + 1, profile, t));
    const provider = profile.provider || {};
    lines.push(formatField(t.currentModel, provider.model || ""));
    lines.push(formatField(t.provider, provider.name || ""));
    lines.push(formatField(`${t.plan}/${t.format}`, `${provider.plan || "custom"} / ${provider.type || ""}`));
    lines.push(formatField(t.endpoint, provider.baseUrl || ""));
    if (!options.compact) lines.push(formatField("ID", profile.id));
  }
  lines.push("");
  lines.push(t.switchModelHint);
  printSection(t.profilesTitle, lines, width);
}

function renderCommands(t = TEXT.en, width = terminalWidth()) {
  const lines = [];
  for (const group of COMMAND_GROUPS) {
    const commands = COMMANDS.filter((command) => command.group === group);
    if (!commands.length) continue;
    if (lines.length) lines.push("");
    lines.push(color(groupTitle(group, t), "cyan"));
    for (const command of commands) {
      lines.push(formatCommand(command, t));
    }
  }
  printSection(t.commandsTitle, lines, width);
}

function renderHelp(config = null) {
  const t = textFor(config);
  const width = terminalWidth();
  renderCommands(t, width);
  printSection(t.aliases, [
    t.aliasDashboard,
    t.aliasToggle,
    t.aliasSwitchNo,
    t.aliasSwitchId,
    t.aliasUninstall,
  ], width);
}

function renderConfigPaths(config) {
  const t = textFor(config);
  const width = terminalWidth();
  printSection(t.pathsTitle, [
    formatField(t.config, defaultConfigPath()),
    formatField(t.dataDir, config.dataDir || ""),
    formatField(t.logDir, config.logging?.dir || ""),
    formatField(t.activeProfile, config.activeProfile || "default"),
    formatField(t.visionSwitch, isVisionEnabled(config) ? "ON" : "OFF"),
  ], width);
}

function renderClientSnippets(config = null) {
  const t = textFor(config);
  const width = terminalWidth();
  const genericJson = JSON.stringify({
    mcpServers: {
      "vision-bridge": {
        command: "mcp-vision-bridge",
        args: [],
      },
    },
  }, null, 2).split("\n").map((line) => `  ${line}`);
  const reasonixToml = [
    "[[plugins]]",
    "name = \"vision-bridge\"",
    "type = \"stdio\"",
    "command = \"mcp-vision-bridge\"",
    "trusted_read_only_tools = [",
    "  \"vision_status\",",
    "  \"vision_list_profiles\",",
    "  \"vision_list_recent_images\",",
    "  \"vision_analyze_attachment\",",
    "  \"vision_analyze_screenshot\",",
    "  \"vision_describe_image\",",
    "  \"vision_ask_image\",",
    "  \"vision_ocr_image\",",
    "  \"vision_image_to_markdown\"",
    "]",
  ].map((line) => `  ${line}`);
  printSection(t.clientTitle, [
    `${t.claudeCode}:`,
    "  claude mcp add --scope user vision-bridge -- mcp-vision-bridge",
    "",
    `${t.reasonix}:`,
    ...reasonixToml,
    "",
    `${t.genericJson}:`,
    ...genericJson,
  ], width);
}

function setVisionSwitch(enabled) {
  const config = loadConfigOrExit();
  const t = textFor(config);
  const next = setVisionEnabled(config, enabled);
  const configPath = saveConfig(next);
  printSection(t.visionSwitch, [
    enabled ? t.switchSavedOn : t.switchSavedOff,
    enabled ? t.onDetail : t.offDetail,
    `${t.saved}: ${configPath}`,
  ], terminalWidth());
}

function switchProfile(target) {
  const config = loadConfigOrExit();
  const t = textFor(config);
  const profiles = listProfiles(config);
  if (!target) {
    renderProfiles(config, t, terminalWidth(), { compact: false });
    console.log("");
    console.log(t.usageSwitch);
    process.exitCode = 1;
    return;
  }

  const profileId = resolveProfileId(target, profiles);
  if (!profileId) {
    console.error(`${t.unknownProfile}: ${target}`);
    renderProfiles(config, t, terminalWidth(), { compact: false });
    process.exitCode = 1;
    return;
  }

  const next = switchActiveProfile(config, profileId);
  const configPath = saveConfig(next);
  const provider = next.provider || {};
  printSection(t.profilesTitle, [
    `${t.switched}: ${profileId}`,
    `${t.model}: ${provider.model || ""}`,
    `${t.provider}: ${provider.name || ""} / ${provider.plan || "custom"} / ${provider.type || ""}`,
    `${t.endpoint}: ${provider.baseUrl || ""}`,
    `${t.saved}: ${configPath}`,
  ], terminalWidth());
}

function resolveProfileId(target, profiles) {
  const text = String(target || "").trim();
  const index = Number(text);
  if (Number.isInteger(index) && index >= 1 && index <= profiles.length) {
    return profiles[index - 1].id;
  }
  return profiles.some((profile) => profile.id === text) ? text : "";
}

function parseCommandId(value) {
  if (!value) return 1;
  const number = Number(value);
  if (Number.isInteger(number)) return number;
  return ALIASES.get(String(value).trim().toLowerCase()) || -1;
}

function loadConfigOrExit() {
  try {
    return loadConfig();
  } catch (err) {
    console.error(err.message || String(err));
    console.error(TEXT.en.runSetup);
    process.exit(1);
  }
}

function loadConfigOrNull() {
  try {
    return loadConfig();
  } catch {
    return null;
  }
}

function runScript(scriptName, scriptArgs = []) {
  const scriptPath = path.join(SCRIPT_DIR, scriptName);
  const result = spawnSync(process.execPath, [scriptPath, ...scriptArgs], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
  });
  process.exitCode = result.status ?? 1;
}

function printSection(title, lines, width = terminalWidth()) {
  const innerWidth = Math.max(20, width - 4);
  console.log("");
  console.log(`${color("›", "cyan")} ${color(title, "bold")}`);
  for (const line of normalizeLines(lines, innerWidth)) {
    if (!line) {
      console.log("");
      continue;
    }
    console.log(`  ${line}`);
  }
}

function normalizeLines(lines, width) {
  const output = [];
  for (const line of lines) {
    const text = String(line ?? "");
    if (!text) {
      output.push("");
      continue;
    }
    output.push(...wrapLine(text, width));
  }
  return output;
}

function wrapLine(text, width) {
  const result = [];
  let remaining = text.replace(/\s+$/u, "");
  while (displayLength(remaining) > width) {
    const chunk = takeDisplay(remaining, width);
    result.push(chunk.text);
    remaining = remaining.slice(chunk.length).trimStart();
  }
  result.push(remaining);
  return result;
}

function takeDisplay(text, width) {
  let used = 0;
  let length = 0;
  for (const char of text) {
    const charWidth = displayLength(char);
    if (used + charWidth > width) break;
    used += charWidth;
    length += char.length;
  }
  return { text: text.slice(0, length), length };
}

function formatField(label, value) {
  return `${padDisplay(String(label), 12)} : ${value}`;
}

function formatProfileTitle(index, profile, t) {
  const marker = profile.active ? ` ${badge(t.activeTag, "green")}` : "";
  return `${commandNo(index)}${marker} ${profile.id}`;
}

function formatCommand(command, t) {
  return `${commandNo(command.id, 2)} ${command.usage.padEnd(18)} ${t[command.textKey]}`;
}

function groupTitle(group, t) {
  const key = `group${group[0].toUpperCase()}${group.slice(1)}`;
  return t[key] || group;
}

function terminalWidth() {
  const columns = Number(process.stdout.columns) || 100;
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, columns));
}

function displayLength(text) {
  let length = 0;
  for (const char of stripAnsi(String(text))) {
    length += /[^\u0000-\u00ff]/u.test(char) ? 2 : 1;
  }
  return length;
}

function padDisplay(text, width) {
  const value = String(text);
  const padding = Math.max(0, width - displayLength(value));
  return `${value}${" ".repeat(padding)}`;
}

function textFor(config) {
  return config?.language === "zh" ? TEXT.zh : TEXT.en;
}

function color(text, style) {
  if (!COLOR_ENABLED) return String(text);
  return `${ANSI[style] || ""}${text}${ANSI.reset}`;
}

function badge(text, style) {
  return color(`[${text}]`, style);
}

function commandNo(value, width = 1) {
  return color(`[${String(value).padStart(width)}]`, "cyan");
}

function stripAnsi(value) {
  return String(value).replace(/\u001b\[[0-9;]*m/g, "");
}
