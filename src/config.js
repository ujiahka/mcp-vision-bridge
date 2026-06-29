import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const APP_NAME = "mcp-vision-bridge";
export const LEGACY_APP_NAME = "local-vision-mcp";

export function defaultConfigDir() {
  if (process.env.VISION_MCP_CONFIG_DIR) return process.env.VISION_MCP_CONFIG_DIR;
  return appConfigDir(APP_NAME);
}

export function legacyConfigDir() {
  return appConfigDir(LEGACY_APP_NAME);
}

function appConfigDir(appName) {
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), appName);
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", appName);
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), appName);
}

export function defaultDataDir() {
  if (process.env.VISION_MCP_DATA_DIR) return process.env.VISION_MCP_DATA_DIR;
  return path.join(defaultConfigDir(), "data");
}

export function defaultConfigPath() {
  return process.env.VISION_MCP_CONFIG || path.join(defaultConfigDir(), "config.json");
}

export function legacyConfigPath() {
  return path.join(legacyConfigDir(), "config.json");
}

export function baseConfig() {
  return {
    version: 1,
    language: "en",
    provider: {
      name: "default",
      type: "openai-compatible",
      plan: "custom",
      baseUrl: "",
      model: "",
      apiKey: "",
    },
    vision: {
      enabled: true,
    },
    activeProfile: "default",
    profiles: {},
    privacy: {
      allowRemoteEndpoint: false,
      allowUrlFetch: false,
      telemetry: false,
      storeImages: true,
    },
    dataDir: defaultDataDir(),
    logging: {
      enabled: true,
      includePrompt: true,
      includeResult: true,
      dir: path.join(defaultDataDir(), "logs"),
    },
    limits: {
      maxImageBytes: 25 * 1024 * 1024,
      maxTokens: 2048,
      requestTimeoutMs: 120000,
    },
    image: {
      preprocess: true,
      preprocessMode: "local-only",
      urlTransport: "remote-direct",
      maxDimension: 1280,
      jpegQuality: 85,
      convertToJpeg: true,
    },
    attachments: {
      autoDiscover: true,
      searchDirs: [],
      maxAgeMinutes: 60,
      maxAutoSelectAgeSeconds: 180,
      maxDepth: 5,
      maxCandidates: 200,
      includeMagicByteScan: true,
      clipboardFallback: true,
      claudeCodeFallback: true,
      claudeCodeDirs: [],
      maxClaudeCodeSessionFiles: 12,
      maxClaudeCodeLinesPerFile: 400,
      maxClaudeCodeImages: 20,
      maxClaudeCodeAutoSelectAgeSeconds: 600,
    },
  };
}

export function applyEnvOverrides(config) {
  const next = structuredClone(config);
  if (process.env.VISION_MCP_ENABLED) next.vision.enabled = parseBool(process.env.VISION_MCP_ENABLED);
  if (process.env.VISION_BASE_URL) next.provider.baseUrl = process.env.VISION_BASE_URL;
  if (process.env.VISION_MODEL) next.provider.model = process.env.VISION_MODEL;
  if (process.env.VISION_API_KEY) next.provider.apiKey = process.env.VISION_API_KEY;
  if (process.env.VISION_MAX_TOKENS) next.limits.maxTokens = Number(process.env.VISION_MAX_TOKENS);
  if (process.env.VISION_REQUEST_TIMEOUT_MS) next.limits.requestTimeoutMs = Number(process.env.VISION_REQUEST_TIMEOUT_MS);
  if (process.env.VISION_IMAGE_PREPROCESS) next.image.preprocess = parseBool(process.env.VISION_IMAGE_PREPROCESS);
  if (process.env.VISION_IMAGE_PREPROCESS_MODE) next.image.preprocessMode = process.env.VISION_IMAGE_PREPROCESS_MODE;
  if (process.env.VISION_IMAGE_URL_TRANSPORT) next.image.urlTransport = process.env.VISION_IMAGE_URL_TRANSPORT;
  if (process.env.VISION_IMAGE_MAX_DIMENSION) next.image.maxDimension = Number(process.env.VISION_IMAGE_MAX_DIMENSION);
  if (process.env.VISION_IMAGE_JPEG_QUALITY) next.image.jpegQuality = Number(process.env.VISION_IMAGE_JPEG_QUALITY);
  if (process.env.VISION_ATTACHMENTS_AUTO_DISCOVER) next.attachments.autoDiscover = parseBool(process.env.VISION_ATTACHMENTS_AUTO_DISCOVER);
  if (process.env.VISION_ATTACHMENT_DIRS) next.attachments.searchDirs = process.env.VISION_ATTACHMENT_DIRS.split(path.delimiter).filter(Boolean);
  if (process.env.VISION_ATTACHMENT_MAX_AGE_MINUTES) next.attachments.maxAgeMinutes = Number(process.env.VISION_ATTACHMENT_MAX_AGE_MINUTES);
  if (process.env.VISION_ATTACHMENT_MAX_AUTO_SELECT_AGE_SECONDS) next.attachments.maxAutoSelectAgeSeconds = Number(process.env.VISION_ATTACHMENT_MAX_AUTO_SELECT_AGE_SECONDS);
  if (process.env.VISION_ATTACHMENT_CLIPBOARD_FALLBACK) next.attachments.clipboardFallback = parseBool(process.env.VISION_ATTACHMENT_CLIPBOARD_FALLBACK);
  if (process.env.VISION_ATTACHMENT_CLAUDE_CODE_FALLBACK) next.attachments.claudeCodeFallback = parseBool(process.env.VISION_ATTACHMENT_CLAUDE_CODE_FALLBACK);
  if (process.env.VISION_ATTACHMENT_CLAUDE_CODE_DIRS) next.attachments.claudeCodeDirs = process.env.VISION_ATTACHMENT_CLAUDE_CODE_DIRS.split(path.delimiter).filter(Boolean);
  if (process.env.VISION_ATTACHMENT_MAX_CLAUDE_CODE_SESSION_FILES) next.attachments.maxClaudeCodeSessionFiles = Number(process.env.VISION_ATTACHMENT_MAX_CLAUDE_CODE_SESSION_FILES);
  if (process.env.VISION_ATTACHMENT_MAX_CLAUDE_CODE_LINES_PER_FILE) next.attachments.maxClaudeCodeLinesPerFile = Number(process.env.VISION_ATTACHMENT_MAX_CLAUDE_CODE_LINES_PER_FILE);
  if (process.env.VISION_ATTACHMENT_MAX_CLAUDE_CODE_IMAGES) next.attachments.maxClaudeCodeImages = Number(process.env.VISION_ATTACHMENT_MAX_CLAUDE_CODE_IMAGES);
  if (process.env.VISION_ATTACHMENT_MAX_CLAUDE_CODE_AUTO_SELECT_AGE_SECONDS) next.attachments.maxClaudeCodeAutoSelectAgeSeconds = Number(process.env.VISION_ATTACHMENT_MAX_CLAUDE_CODE_AUTO_SELECT_AGE_SECONDS);
  if (process.env.VISION_MCP_DATA_DIR) {
    next.dataDir = process.env.VISION_MCP_DATA_DIR;
    if (!process.env.VISION_MCP_LOG_DIR) next.logging.dir = path.join(next.dataDir, "logs");
  }
  if (process.env.VISION_MCP_LOG_DIR) next.logging.dir = process.env.VISION_MCP_LOG_DIR;
  if (process.env.VISION_MCP_LOGGING) next.logging.enabled = parseBool(process.env.VISION_MCP_LOGGING);
  return syncActiveProfileProvider(next);
}

export function loadConfig({ allowMissing = false } = {}) {
  const configPath = defaultConfigPath();
  const fallbackConfigPath = legacyConfigPath();
  let config = baseConfig();

  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, "utf8");
    config = mergeConfig(config, JSON.parse(raw));
  } else if (!process.env.VISION_MCP_CONFIG && fs.existsSync(fallbackConfigPath)) {
    const raw = fs.readFileSync(fallbackConfigPath, "utf8");
    config = mergeConfig(config, JSON.parse(raw));
  } else if (!allowMissing) {
    throw new Error(`Config not found: ${configPath}. Run mcp-vision-bridge-init before starting the server.`);
  }

  return applyEnvOverrides(normalizeProfiles(config));
}

export function saveConfig(config) {
  const configPath = defaultConfigPath();
  const normalized = normalizeProfiles(config);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return configPath;
}

export function normalizeProfiles(config) {
  const next = structuredClone(config || baseConfig());
  const hadProfiles = Boolean(next.profiles && Object.keys(next.profiles).length);
  next.profiles = normalizeProfileMap(next.profiles || {});

  let activeProfile = next.activeProfile || "default";
  if (hadProfiles && !next.profiles[activeProfile]) {
    activeProfile = Object.keys(next.profiles)[0] || "default";
  }

  if (hadProfiles && next.profiles[activeProfile]?.provider) {
    next.provider = normalizeProvider(next.profiles[activeProfile].provider);
  } else {
    next.provider = normalizeProvider(next.provider || {});
    next.profiles[activeProfile] = normalizeProfileEntry(activeProfile, {
      name: next.provider.name || activeProfile,
      provider: next.provider,
    });
  }

  next.activeProfile = activeProfile;
  return next;
}

export function syncActiveProfileProvider(config) {
  const next = normalizeProfiles(config);
  next.profiles[next.activeProfile] = normalizeProfileEntry(next.activeProfile, {
    ...(next.profiles[next.activeProfile] || {}),
    provider: next.provider,
  });
  return next;
}

export function listProfiles(config) {
  const normalized = normalizeProfiles(config);
  return Object.entries(normalized.profiles).map(([id, entry]) => ({
    id,
    active: id === normalized.activeProfile,
    name: entry.name || entry.provider?.name || id,
    provider: publicProvider(entry.provider),
  }));
}

export function switchActiveProfile(config, profileId) {
  const normalized = normalizeProfiles(config);
  const entry = normalized.profiles[profileId];
  if (!entry) {
    const available = Object.keys(normalized.profiles).join(", ") || "(none)";
    throw new Error(`Unknown vision profile: ${profileId}. Available profiles: ${available}`);
  }
  normalized.activeProfile = profileId;
  normalized.provider = normalizeProvider(entry.provider);
  return normalized;
}

function mergeConfig(base, override) {
  const merged = {
    ...base,
    ...override,
    provider: { ...base.provider, ...(override.provider || {}) },
    vision: { ...base.vision, ...(override.vision || {}) },
    privacy: { ...base.privacy, ...(override.privacy || {}) },
    logging: { ...base.logging, ...(override.logging || {}) },
    limits: { ...base.limits, ...(override.limits || {}) },
    image: { ...base.image, ...(override.image || {}) },
    attachments: { ...base.attachments, ...(override.attachments || {}) },
    profiles: mergeProfiles(base.profiles || {}, override.profiles || {}),
  };
  if (override.dataDir && !override.logging?.dir) {
    merged.logging.dir = path.join(merged.dataDir, "logs");
  }
  return merged;
}

function parseBool(value) {
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

export function isVisionEnabled(config) {
  return config?.vision?.enabled !== false;
}

export function setVisionEnabled(config, enabled) {
  const next = structuredClone(config || baseConfig());
  next.vision = {
    ...(next.vision || {}),
    enabled: Boolean(enabled),
  };
  return next;
}

function mergeProfiles(baseProfiles, overrideProfiles) {
  return {
    ...normalizeProfileMap(baseProfiles),
    ...normalizeProfileMap(overrideProfiles),
  };
}

function normalizeProfileMap(profiles) {
  const normalized = {};
  for (const [id, entry] of Object.entries(profiles || {})) {
    if (!entry || typeof entry !== "object") continue;
    normalized[id] = normalizeProfileEntry(id, entry);
  }
  return normalized;
}

function normalizeProfileEntry(id, entry) {
  const nestedProvider = entry.provider && typeof entry.provider === "object" && !Array.isArray(entry.provider);
  const provider = nestedProvider ? entry.provider : entry;
  return {
    name: entry.name || provider.name || id,
    provider: normalizeProvider(provider),
  };
}

function normalizeProvider(provider) {
  return {
    ...baseConfig().provider,
    ...(provider || {}),
  };
}

function publicProvider(provider) {
  const next = { ...(provider || {}) };
  delete next.apiKey;
  return next;
}
