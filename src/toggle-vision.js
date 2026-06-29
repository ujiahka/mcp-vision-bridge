#!/usr/bin/env node
import { defaultConfigPath, isVisionEnabled, loadConfig, saveConfig, setVisionEnabled } from "./config.js";

const command = String(process.argv[2] || "status").trim().toLowerCase();

try {
  const config = loadConfig();
  const language = config.language === "zh" ? "zh" : "en";

  if (["status", "s", ""].includes(command)) {
    printStatus(config, language);
    process.exit(0);
  }

  const enabled = parseEnabled(command);
  const next = setVisionEnabled(config, enabled);
  const configPath = saveConfig(next);
  printSaved(next, configPath, language);
} catch (err) {
  console.error(err.message || String(err));
  console.error(`Usage: ${commandName()} on|off|status`);
  process.exitCode = 1;
}

function printStatus(config, language) {
  const enabled = isVisionEnabled(config);
  const text = language === "zh"
    ? `MCP 识图总开关: ${enabled ? "开启" : "关闭"}`
    : `MCP vision switch: ${enabled ? "enabled" : "disabled"}`;
  console.log(text);
  console.log(`${language === "zh" ? "配置文件" : "Config"}: ${defaultConfigPath()}`);
  printEnvOverride(language);
}

function printSaved(config, configPath, language) {
  const enabled = isVisionEnabled(config);
  if (language === "zh") {
    console.log(`MCP 识图总开关已${enabled ? "开启" : "关闭"}。`);
    console.log(enabled
      ? "当前适合单模态模型：图片会交给 mcp-vision-bridge 识别。"
      : "当前适合多模态模型：MCP 不再接管图片，直接使用模型自身识图能力。");
    console.log(`配置文件: ${configPath}`);
  } else {
    console.log(`MCP vision switch is now ${enabled ? "enabled" : "disabled"}.`);
    console.log(enabled
      ? "Use this for text-only host models; images will be routed through mcp-vision-bridge."
      : "Use this for native multimodal host models; MCP will not take over image recognition.");
    console.log(`Config: ${configPath}`);
  }
  printEnvOverride(language);
}

function parseEnabled(value) {
  if (["1", "true", "yes", "y", "on", "enable", "enabled"].includes(value)) return true;
  if (["0", "false", "no", "n", "off", "disable", "disabled"].includes(value)) return false;
  throw new Error(`Unknown switch value: ${value}`);
}

function commandName() {
  return process.argv[1]?.split(/[\\/]/).pop() || "mcp-vision-bridge-vision";
}

function printEnvOverride(language) {
  if (process.env.VISION_MCP_ENABLED === undefined) return;
  const message = language === "zh"
    ? `注意：当前进程设置了环境变量 VISION_MCP_ENABLED=${process.env.VISION_MCP_ENABLED}，服务器启动时会优先使用环境变量。`
    : `Note: VISION_MCP_ENABLED=${process.env.VISION_MCP_ENABLED} is set for this process and takes precedence when the server starts.`;
  console.log(message);
}
