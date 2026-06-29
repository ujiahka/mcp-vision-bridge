#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { stdin as input, stdout as output } from "node:process";
import { baseConfig, defaultConfigDir, defaultConfigPath, defaultDataDir, legacyConfigDir, legacyConfigPath, loadConfig, saveConfig } from "./config.js";
import { isRemoteEndpoint, parseUrl } from "./privacy.js";

const rl = readline.createInterface({ input, crlfDelay: Infinity });
const lineIterator = rl[Symbol.asyncIterator]();
const BACK = Symbol("BACK");

const CATALOG = loadProviderCatalog({
  bailianCoding: {
    name: { zh: "阿里云百炼", en: "Alibaba Cloud Bailian" },
    provider: "aliyun-bailian",
    plan: "bailian",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen3.5-omni-plus",
    type: "openai-compatible",
    apiKeyLabel: { zh: "DASHSCOPE API Key", en: "DASHSCOPE API key" },
  },
  xiaomiToken: {
    name: { zh: "小米 MiMo Token Plan", en: "Xiaomi MiMo Token Plan" },
    provider: "xiaomi-mimo",
    plan: "token",
    baseUrls: {
      "openai-compatible": "https://token-plan-cn.xiaomimimo.com/v1",
      "anthropic-compatible": "https://token-plan-cn.xiaomimimo.com/anthropic",
    },
    model: "mimo-v2.5",
    type: "openai-compatible",
    apiKeyLabel: { zh: "小米 API Key", en: "Xiaomi API key" },
  },
  volcengineAgent: {
    name: { zh: "火山引擎 Agent Plan", en: "Volcengine Agent Plan" },
    provider: "volcengine",
    plan: "agent",
    baseUrls: {
      "openai-compatible": "https://ark.cn-beijing.volces.com/api/plan/v3",
      "anthropic-compatible": "https://ark.cn-beijing.volces.com/api/plan",
    },
    model: "mimo-v2.5",
    type: "openai-compatible",
    apiKeyLabel: { zh: "火山引擎 API Key", en: "Volcengine API key" },
  },
  volcengineCoding: {
    name: { zh: "火山引擎 Coding Plan", en: "Volcengine Coding Plan" },
    provider: "volcengine",
    plan: "coding",
    baseUrls: {
      "openai-compatible": "https://ark.cn-beijing.volces.com/api/coding/v3",
      "anthropic-compatible": "https://ark.cn-beijing.volces.com/api/coding",
    },
    model: "mimo-v2.5",
    type: "openai-compatible",
    apiKeyLabel: { zh: "火山引擎 API Key", en: "Volcengine API key" },
  },
  opencodeGo: {
    name: { zh: "OpenCode Go", en: "OpenCode Go" },
    provider: "opencode",
    plan: "go",
    baseUrl: "https://opencode.ai/zen/go",
    model: "mimo-v2.5",
    type: "openai-compatible",
    apiKeyLabel: { zh: "OpenCode API Key", en: "OpenCode API key" },
  },
});

const TEXT = {
  zh: {
    setupTitle: "MCP Vision Bridge 安装向导",
    setupIntro: "此向导会在部署前写入本地配置文件，不会启用遥测。",
    appendIntro: "检测到已有配置，将在现有模型列表基础上继续添加，不会清空旧模型。",
    providerMode: "请选择视觉模型来源",
    modeApi: "API 订阅/云端服务",
    modeLocal: "本地或局域网大模型 URL",
    apiPlan: "请选择推荐的 API 订阅方案",
    otherApi: "其他 API 订阅/自定义服务",
    customProviderName: "Provider 名称",
    apiFormat: "请选择接口格式",
    formatOpenAI: "OpenAI-compatible (/chat/completions)",
    formatAnthropic: "Anthropic-compatible (/v1/messages)",
    modelId: "视觉模型 ID",
    profileId: "配置档 ID（用于之后切换模型/plan）",
    profileIdHint: "只建议使用英文、数字和短横线",
    addAnotherProfile: "是否继续添加另一个模型/plan 配置档？",
    baseUrl: "Provider Base URL",
    baseUrlOpenAI: "OpenAI-compatible Base URL",
    baseUrlAnthropic: "Anthropic-compatible Base URL",
    apiKeyBlank: "API Key，本地模型可留空",
    localApiKey: "本地模型 API Key，可留空",
    localModelDefault: "qwen/qwen3-vl-8b",
    localUrlDefault: "http://127.0.0.1:1234/v1",
    remoteWarning: "警告：这是公网模型 endpoint。调用识图工具时，图片会发送给你配置的 provider。",
    allowRemote: "是否明确允许使用此远程 provider？",
    allowUrlFetch: "是否允许 MCP 工具抓取 image_url 网络图片？",
    dataDir: "本地数据目录",
    enableLogs: "是否开启本地识别日志，方便排查？",
    includeResult: "日志中是否记录完整识别结果？",
    summary: "配置摘要",
    configPath: "配置路径",
    activeProfile: "默认启用配置档",
    profiles: "配置档",
    remoteAllowed: "允许远程 endpoint",
    urlFetchAllowed: "允许抓取图片 URL",
    localLogging: "本地识别日志",
    logDir: "日志目录",
    writeConfig: "是否写入此配置？",
    saved: "配置已保存",
    dataDirOut: "本地数据目录",
    privacy: "未启用遥测。图片只会在调用工具时发送到你配置的视觉模型 endpoint。",
    registerClaude: "是否自动注册到 Claude Code 用户级 MCP（之后 /mcp 可直接看到 vision-bridge）？",
    claudeAlreadyRegistered: "Claude Code 已注册 vision-bridge。",
    claudeRegistered: "Claude Code 已注册 vision-bridge。",
    claudeUnavailable: "未检测到 claude 命令，已跳过 Claude Code 自动注册。",
    claudeRegisterFailed: "Claude Code 自动注册失败",
    claudeManual: "可手动执行",
    cancelled: "安装已取消。",
    remoteDenied: "未允许远程 provider。请返回上一步改用本地/LAN endpoint，或明确允许远程使用。",
    invalidChoice: "无效选项，请重新输入。",
    required: "必填",
    languagePrompt: "请选择安装语言 / Select setup language",
    backHint: "输入 b 或“返回”可回到上一步",
    backShort: "b=返回",
    noPrevious: "已经是当前阶段的第一步。",
  },
  en: {
    setupTitle: "MCP Vision Bridge setup",
    setupIntro: "This writes a local config file before deployment. Telemetry is disabled.",
    appendIntro: "Existing config found. New model profiles will be appended without clearing old profiles.",
    providerMode: "Choose vision model source",
    modeApi: "API subscription / cloud provider",
    modeLocal: "Local or LAN model URL",
    apiPlan: "Choose a recommended API subscription plan",
    otherApi: "Other API subscription / custom service",
    customProviderName: "Provider name",
    apiFormat: "Choose API compatibility format",
    formatOpenAI: "OpenAI-compatible (/chat/completions)",
    formatAnthropic: "Anthropic-compatible (/v1/messages)",
    modelId: "Vision model id",
    profileId: "Profile id for later model/plan switching",
    profileIdHint: "Use letters, numbers, and hyphens when possible",
    addAnotherProfile: "Add another model/plan profile?",
    baseUrl: "Provider base URL",
    baseUrlOpenAI: "OpenAI-compatible base URL",
    baseUrlAnthropic: "Anthropic-compatible base URL",
    apiKeyBlank: "API key, blank is ok for local models",
    localApiKey: "Local model API key, blank is ok",
    localModelDefault: "qwen/qwen3-vl-8b",
    localUrlDefault: "http://127.0.0.1:1234/v1",
    remoteWarning: "Warning: this model endpoint is public internet. Image bytes will be sent to that provider during tool calls.",
    allowRemote: "Explicitly allow this remote provider?",
    allowUrlFetch: "Allow MCP tools to fetch image_url inputs from the network?",
    dataDir: "Local data directory",
    enableLogs: "Enable local recognition logs for troubleshooting?",
    includeResult: "Include full recognition results in local logs?",
    summary: "Config summary",
    configPath: "Config path",
    activeProfile: "Default active profile",
    profiles: "Profiles",
    remoteAllowed: "Remote endpoint allowed",
    urlFetchAllowed: "URL fetch allowed",
    localLogging: "Local recognition logging",
    logDir: "Log directory",
    writeConfig: "Write this config?",
    saved: "Config saved",
    dataDirOut: "Local data dir",
    privacy: "No telemetry is enabled. Images are sent only to the configured model endpoint during tool calls.",
    registerClaude: "Register to Claude Code user MCP automatically so /mcp can show vision-bridge?",
    claudeAlreadyRegistered: "Claude Code already has vision-bridge registered.",
    claudeRegistered: "Claude Code registered vision-bridge.",
    claudeUnavailable: "Claude Code command was not found; skipped automatic Claude Code registration.",
    claudeRegisterFailed: "Claude Code automatic registration failed",
    claudeManual: "You can run manually",
    cancelled: "Setup cancelled.",
    remoteDenied: "Remote provider was not allowed. Go back and choose a local/LAN endpoint, or explicitly allow remote use.",
    invalidChoice: "Invalid choice, please try again.",
    required: "Required",
    languagePrompt: "Select setup language / 请选择安装语言",
    backHint: "Type b or back to return to the previous step",
    backShort: "b=back",
    noPrevious: "Already at the first step in this section.",
  },
};

try {
  const language = await chooseLanguage();
  const t = TEXT[language];
  const config = await promptConfig(language, t);
  const configPath = saveConfig(config);
  fs.mkdirSync(config.dataDir, { recursive: true });
  console.log("");
  console.log(`${t.saved}: ${configPath}`);
  console.log(`${t.dataDirOut}: ${config.dataDir}`);
  console.log(t.privacy);
  await promptClientRegistration(t);
} finally {
  rl.close();
}

function loadProviderCatalog(baseCatalog) {
  const catalogPath = process.env.VISION_PROVIDER_CATALOG || firstExistingPath([
    path.join(defaultConfigDir(), "provider-catalog.json"),
    path.join(legacyConfigDir(), "provider-catalog.json"),
  ]);
  if (!fs.existsSync(catalogPath)) return baseCatalog;

  let raw;
  try {
    raw = JSON.parse(stripBom(fs.readFileSync(catalogPath, "utf8")));
  } catch (err) {
    console.warn(`Warning: ignored invalid provider catalog at ${catalogPath}: ${err.message}`);
    return baseCatalog;
  }
  const overrides = raw.providers || raw;
  const next = structuredClone(baseCatalog);
  for (const [key, value] of Object.entries(overrides)) {
    if (!value || typeof value !== "object") continue;
    const current = next[key] || {};
    next[key] = {
      ...current,
      ...value,
      name: { ...(current.name || {}), ...(value.name || {}) },
      apiKeyLabel: { ...(current.apiKeyLabel || {}), ...(value.apiKeyLabel || {}) },
      baseUrls: { ...(current.baseUrls || {}), ...(value.baseUrls || {}) },
    };
  }
  return next;
}

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function firstExistingPath(paths) {
  return paths.find((candidate) => fs.existsSync(candidate)) || paths[0];
}

async function chooseLanguage() {
  console.log("1) 中文");
  console.log("2) English");
  for (;;) {
    const answer = (await question("请选择安装语言 / Select setup language [1]: ")).trim() || "1";
    if (answer === "1" || /^zh/i.test(answer) || answer === "中文") return "zh";
    if (answer === "2" || /^en/i.test(answer) || /^english$/i.test(answer)) return "en";
    console.log("无效选项 / Invalid choice");
  }
}

async function promptConfig(language, t) {
  const existingConfig = loadExistingConfig();
  const existingProfiles = existingProfilesForAppend(existingConfig);
  const existingProfileIds = Object.keys(existingProfiles);
  const config = existingConfig ? structuredClone(existingConfig) : baseConfig();
  config.language = language;

  console.log("");
  console.log(t.setupTitle);
  console.log(t.setupIntro);
  if (existingProfileIds.length) console.log(t.appendIntro);
  console.log(t.backHint);
  console.log("");

  const profileResult = await promptProfiles(language, t, new Set(existingProfileIds));

  for (;;) {
    const allowRemoteEndpoint = Boolean(config.privacy?.allowRemoteEndpoint || profileResult.allowRemoteEndpoint);
    const postSettings = await promptPostSettings(t, allowRemoteEndpoint, config);
    const profiles = {
      ...existingProfiles,
      ...profileResult.profiles,
    };
    const activeProfile = resolveActiveProfile(config.activeProfile, profiles, profileResult.activeProfile);

    config.activeProfile = activeProfile;
    config.profiles = profiles;
    config.provider = profiles[activeProfile].provider;
    config.privacy.allowRemoteEndpoint = allowRemoteEndpoint;
    config.privacy.allowUrlFetch = postSettings.allowUrlFetch;
    config.privacy.telemetry = false;
    config.privacy.storeImages = true;
    config.dataDir = postSettings.dataDir;
    config.logging.enabled = postSettings.loggingEnabled;
    config.logging.includePrompt = postSettings.loggingEnabled;
    config.logging.includeResult = postSettings.includeResult;
    config.logging.dir = postSettings.logDir;

    try {
      await confirmSummary(config, t);
      return config;
    } catch (err) {
      if (err !== BACK) throw err;
    }
  }
}

function loadExistingConfig() {
  const configPath = defaultConfigPath();
  const fallbackConfigPath = legacyConfigPath();
  const hasConfig = fs.existsSync(configPath) || (!process.env.VISION_MCP_CONFIG && fs.existsSync(fallbackConfigPath));
  if (!hasConfig) return null;

  try {
    return loadConfig();
  } catch (err) {
    console.warn(`Warning: existing config was ignored: ${err.message}`);
    return null;
  }
}

function existingProfilesForAppend(config) {
  const profiles = structuredClone(config?.profiles || {});
  const keys = Object.keys(profiles);
  if (keys.length === 1 && keys[0] === "default" && !hasProviderConfig(profiles.default?.provider)) {
    delete profiles.default;
  }
  return profiles;
}

function hasProviderConfig(provider = {}) {
  return Boolean(provider.model || provider.baseUrl || provider.apiKey);
}

function resolveActiveProfile(currentActiveProfile, profiles, firstAddedProfile) {
  if (currentActiveProfile && profiles[currentActiveProfile] && hasProviderConfig(profiles[currentActiveProfile].provider)) {
    return currentActiveProfile;
  }
  if (firstAddedProfile && profiles[firstAddedProfile]) return firstAddedProfile;
  return Object.keys(profiles)[0] || "default";
}

async function promptProfiles(language, t, existingIds = new Set()) {
  const profiles = {};
  const order = [];
  const usedIds = new Set(existingIds);
  let allowRemoteEndpoint = false;

  for (;;) {
    try {
      const profile = await promptProfile(language, t, usedIds.size + 1, usedIds);
      profiles[profile.id] = {
        name: profile.name,
        provider: profile.provider,
      };
      order.push(profile.id);
      usedIds.add(profile.id);
      allowRemoteEndpoint = allowRemoteEndpoint || profile.remoteEndpointAllowed;

      const more = await confirm(t.addAnotherProfile, false, t);
      if (!more) break;
    } catch (err) {
      if (err !== BACK) throw err;
      if (!order.length) {
        console.log(t.noPrevious);
        continue;
      }
      const previous = order.pop();
      delete profiles[previous];
      usedIds.delete(previous);
      continue;
    }
  }

  return {
    activeProfile: order[0],
    profiles,
    allowRemoteEndpoint,
  };
}

async function promptProfile(language, t, profileNumber, existingIds) {
  const state = {};
  let step = "mode";
  const history = [];

  const next = (nextStep) => {
    history.push(step);
    step = nextStep;
  };
  const previous = () => {
    if (!history.length) {
      console.log(t.noPrevious);
      return;
    }
    step = history.pop();
  };

  while (step !== "done") {
    try {
      if (step === "mode") {
        state.mode = await choose(t.providerMode, [
          { value: "api", label: t.modeApi },
          { value: "local", label: t.modeLocal },
        ], "api", t);
        state.selected = state.mode === "local" ? localPlan(t) : undefined;
        next(state.mode === "api" ? "apiPlan" : "providerType");
      } else if (step === "apiPlan") {
        state.selected = await chooseApiPlan(language, t);
        next(state.selected.needsProviderName ? "providerName" : "providerType");
      } else if (step === "providerName") {
        state.selected.provider = await askRequired(t.customProviderName, state.selected.provider || "custom-api", t);
        next("providerType");
      } else if (step === "providerType") {
        if (!state.selected) state.selected = localPlan(t);
        state.providerType = await choose(t.apiFormat, [
          { value: "openai-compatible", label: t.formatOpenAI },
          { value: "anthropic-compatible", label: t.formatAnthropic },
        ], state.selected.type || "openai-compatible", t);
        next("model");
      } else if (step === "model") {
        state.model = await askRequired(t.modelId, state.selected.model || "", t);
        next("baseUrl");
      } else if (step === "baseUrl") {
        const label = baseUrlLabel(t, state.providerType);
        state.baseUrl = await askRequired(label, defaultBaseUrl(state.selected, state.providerType), t);
        parseUrl(state.baseUrl, label);
        state.remoteEndpoint = isRemoteEndpoint(state.baseUrl);
        next(state.remoteEndpoint ? "allowRemote" : "apiKey");
      } else if (step === "allowRemote") {
        console.log("");
        console.log(t.remoteWarning);
        state.remoteEndpointAllowed = await confirm(t.allowRemote, state.mode === "api", t);
        if (!state.remoteEndpointAllowed) throw new Error(t.remoteDenied);
        next("apiKey");
      } else if (step === "apiKey") {
        const label = state.selected.apiKeyLabel?.[language] || (state.mode === "local" ? t.localApiKey : t.apiKeyBlank);
        state.apiKey = await askSecret(label, state.mode === "local" ? "" : "", t);
        next("profileId");
      } else if (step === "profileId") {
        const defaultId = uniqueProfileId(defaultProfileId(state, profileNumber), existingIds);
        state.profileId = await askRequired(`${t.profileId} - ${t.profileIdHint}`, defaultId, t);
        state.profileId = uniqueProfileId(slugifyProfileId(state.profileId), existingIds);
        next("done");
      }
    } catch (err) {
      if (err !== BACK) throw err;
      previous();
    }
  }

  return {
    id: state.profileId,
    name: catalogLabel(state.selected, state.profileId, language),
    remoteEndpointAllowed: Boolean(state.remoteEndpoint && state.remoteEndpointAllowed),
    provider: {
      name: state.selected.provider || state.profileId,
      type: state.providerType,
      plan: state.selected.plan || "custom",
      baseUrl: state.baseUrl,
      model: state.model,
      apiKey: state.apiKey || "local",
      anthropicVersion: state.providerType === "anthropic-compatible" ? "2023-06-01" : undefined,
    },
  };
}

async function promptPostSettings(t, defaultAllowUrlFetch, existingConfig = null) {
  const state = {};
  const defaultDataDirValue = existingConfig?.dataDir || defaultDataDir();
  const defaultLoggingEnabled = existingConfig?.logging?.enabled ?? true;
  const defaultIncludeResult = existingConfig?.logging?.includeResult ?? true;
  const steps = [
    async () => {
      state.allowUrlFetch = await confirm(t.allowUrlFetch, existingConfig?.privacy?.allowUrlFetch || defaultAllowUrlFetch, t);
    },
    async () => {
      state.dataDir = await askRequired(t.dataDir, defaultDataDirValue, t);
    },
    async () => {
      state.loggingEnabled = await confirm(t.enableLogs, defaultLoggingEnabled, t);
    },
    async () => {
      state.includeResult = state.loggingEnabled ? await confirm(t.includeResult, defaultIncludeResult, t) : false;
    },
  ];

  let index = 0;
  while (index < steps.length) {
    try {
      await steps[index]();
      index += 1;
    } catch (err) {
      if (err !== BACK) throw err;
      if (index === 0) {
        console.log(t.noPrevious);
      } else {
        index -= 1;
      }
    }
  }

  state.logDir = existingConfig?.logging?.dir && state.dataDir === existingConfig.dataDir
    ? existingConfig.logging.dir
    : path.join(state.dataDir, "logs");
  return state;
}

async function confirmSummary(config, t) {
  console.log("");
  console.log(t.summary);
  console.log(`${t.configPath}: ${defaultConfigPath()}`);
  console.log(`${t.activeProfile}: ${config.activeProfile}`);
  console.log(`${t.profiles}:`);
  for (const [id, profile] of Object.entries(config.profiles)) {
    const provider = profile.provider;
    console.log(`- ${id}: ${provider.name} / ${provider.plan || "custom"} / ${provider.model}`);
    console.log(`  ${provider.type}: ${provider.baseUrl}`);
  }
  console.log(`${t.remoteAllowed}: ${config.privacy.allowRemoteEndpoint}`);
  console.log(`${t.urlFetchAllowed}: ${config.privacy.allowUrlFetch}`);
  console.log(`${t.localLogging}: ${config.logging.enabled}`);
  console.log(`${t.logDir}: ${config.logging.dir}`);

  if (await confirm(t.writeConfig, true, t)) return;
  throw new Error(t.cancelled);
}

function baseUrlLabel(t, providerType) {
  if (providerType === "anthropic-compatible") return t.baseUrlAnthropic || t.baseUrl;
  if (providerType === "openai-compatible") return t.baseUrlOpenAI || t.baseUrl;
  return t.baseUrl;
}

function defaultBaseUrl(selected, providerType) {
  if (selected.baseUrls?.[providerType]) return selected.baseUrls[providerType];
  if (selected.baseUrl) return selected.baseUrl;
  return "";
}

async function chooseApiPlan(language, t) {
  const catalogOptions = Object.entries(CATALOG).map(([value, provider]) => ({
    value,
    label: catalogLabel(provider, value, language),
  }));
  const options = [
    ...catalogOptions,
    { value: "custom", label: t.otherApi },
  ];
  const choice = await choose(t.apiPlan, options, catalogOptions[0]?.value || "custom", t);
  if (choice === "custom") {
    return {
      provider: "custom-api",
      plan: "custom-api",
      baseUrl: "",
      model: "",
      type: "openai-compatible",
      apiKeyLabel: { [language]: t.apiKeyBlank },
      needsProviderName: true,
    };
  }
  return structuredClone(CATALOG[choice]);
}

function catalogLabel(provider, value, language) {
  if (provider.name?.[language]) return provider.name[language];
  if (provider.name?.en) return provider.name.en;
  return value;
}

function localPlan(t) {
  return {
    name: { zh: "本地模型", en: "Local model" },
    provider: "local",
    plan: "local",
    baseUrl: t.localUrlDefault,
    model: t.localModelDefault,
    type: "openai-compatible",
    apiKeyLabel: { zh: t.localApiKey, en: t.localApiKey },
  };
}

async function choose(label, options, defaultValue, t) {
  console.log("");
  console.log(label);
  options.forEach((option, index) => {
    const defaultMark = option.value === defaultValue ? " *" : "";
    console.log(`${index + 1}) ${option.label}${defaultMark}`);
  });

  for (;;) {
    const answer = (await question(`[1-${options.length}, ${t.backShort}]: `)).trim();
    if (isBack(answer)) throw BACK;
    if (!answer) return defaultValue;
    const index = Number(answer) - 1;
    if (Number.isInteger(index) && options[index]) return options[index].value;
    const match = options.find((option) => option.value === answer);
    if (match) return match.value;
    console.log(t.invalidChoice);
  }
}

async function askRequired(label, defaultValue = "", t = TEXT.en) {
  for (;;) {
    const value = await ask(label, defaultValue, t);
    if (value) return value;
    console.log(t.required);
  }
}

async function ask(label, defaultValue, t = TEXT.en) {
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  const value = (await question(`${label}${suffix} (${t.backShort}): `)).trim();
  if (isBack(value)) throw BACK;
  return value || defaultValue;
}

async function askSecret(label, defaultValue, t) {
  return ask(label, defaultValue, t);
}

async function confirm(label, defaultValue, t) {
  for (;;) {
    const hint = defaultValue ? "Y/n" : "y/N";
    const answer = (await question(`${label} (${hint}, ${t.backShort}): `)).trim();
    if (isBack(answer)) throw BACK;
    const normalized = answer.toLowerCase();
    if (!normalized) return defaultValue;
    if (["y", "yes", "是", "好", "确认"].includes(normalized)) return true;
    if (["n", "no", "否", "不"].includes(normalized)) return false;
    console.log(t.invalidChoice);
  }
}

async function question(prompt) {
  output.write(prompt);
  const next = await lineIterator.next();
  if (next.done) return "";
  return String(next.value);
}

function isBack(answer) {
  const value = String(answer || "").trim().toLowerCase();
  return ["b", "back", "prev", "previous", "return", "返回", "上一步", "后退"].includes(value);
}

function defaultProfileId(state, profileNumber) {
  const parts = [
    state.selected.provider || "provider",
    state.selected.plan || "custom",
    state.model || `profile-${profileNumber}`,
  ];
  return slugifyProfileId(parts.join("-")) || `profile-${profileNumber}`;
}

function slugifyProfileId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function uniqueProfileId(base, existingIds) {
  const root = base || "profile";
  let candidate = root;
  let suffix = 2;
  while (existingIds.has(candidate)) {
    candidate = `${root}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

async function promptClientRegistration(t) {
  if (isTruthyEnv(process.env.VISION_MCP_SKIP_CLIENT_REGISTER)) return;
  if (!(await confirm(t.registerClaude, true, t))) return;

  const serverCommand = findCommand("mcp-vision-bridge") || "mcp-vision-bridge";
  const result = registerClaudeCode(serverCommand);
  if (result.ok) {
    console.log(result.already ? t.claudeAlreadyRegistered : t.claudeRegistered);
    return;
  }

  if (result.missingClaude) {
    console.log(t.claudeUnavailable);
  } else {
    console.log(`${t.claudeRegisterFailed}: ${result.error}`);
  }
  console.log(`${t.claudeManual}: claude mcp add --scope user vision-bridge -- ${serverCommand}`);
}

function registerClaudeCode(serverCommand) {
  const claudeCommand = findCommand("claude");
  if (!claudeCommand) return { ok: false, missingClaude: true };

  const existing = runCommand(claudeCommand, ["mcp", "get", "vision-bridge"]);
  if (existing.status === 0 && existing.stdout.includes("vision-bridge:")) {
    return { ok: true, already: true };
  }

  backupClaudeConfig();
  const added = runCommand(claudeCommand, ["mcp", "add", "--scope", "user", "vision-bridge", "--", serverCommand]);
  if (added.status === 0) return { ok: true, already: false };

  const message = [added.stderr, added.stdout].filter(Boolean).join(" ").trim() || `exit ${added.status}`;
  return { ok: false, error: message };
}

function backupClaudeConfig() {
  const configPath = process.env.VISION_CLAUDE_CONFIG_PATH || path.join(os.homedir(), ".claude.json");
  const backupPath = `${configPath}.bak-mcp-vision-bridge`;
  try {
    if (fs.existsSync(configPath) && !fs.existsSync(backupPath)) {
      fs.copyFileSync(configPath, backupPath);
    }
  } catch {
    // Registration can still proceed; uninstall will fall back to targeted cleanup.
  }
}

function findCommand(command) {
  const result = process.platform === "win32"
    ? spawnSync("where.exe", [command], { encoding: "utf8", timeout: 10000 })
    : spawnSync("sh", ["-lc", `command -v ${shellQuote(command)}`], { encoding: "utf8", timeout: 10000 });
  if (result.status !== 0) return "";

  const lines = String(result.stdout || "")
    .split(/\r?\n/)
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

function winShellQuote(value) {
  const text = String(value);
  if (!/[ \t&()^|<>"]/u.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function isTruthyEnv(value) {
  return /^(1|true|yes|y)$/i.test(String(value || ""));
}
