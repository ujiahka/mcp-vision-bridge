import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { listClaudeCodeImageCandidates } from "./claude-code-images.js";
import { getClipboardImageCandidate } from "./clipboard-image.js";

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"]);
const IMAGE_MAGIC_BYTES = [
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/gif", bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: "image/bmp", bytes: [0x42, 0x4d] },
  { mime: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46], offset: 0, secondary: { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] } },
];
const SKIP_DIRS = new Set([".git", "node_modules", "$recycle.bin", "system volume information"]);

let sharpPromise;

export async function discoverAttachmentImage(input = {}, config) {
  const candidates = await listRecentAttachmentImages(input, config);
  const index = Math.max(0, Number(input.attachment_index || 1) - 1);
  const eligible = candidates.filter((candidate) => candidate.autoSelectable);
  return eligible[index] || null;
}

export async function listRecentAttachmentImages(input = {}, config) {
  const settings = attachmentSettings(config);
  if (!settings.autoDiscover && !input.auto_discover_attachment) return [];

  const hint = buildHint(input);
  const roots = attachmentSearchRoots(settings, hint);
  const sinceMs = Date.now() - settings.maxAgeMinutes * 60 * 1000;
  const found = [];
  for (const root of roots) {
    collectImages(root.dir, {
      found,
      sinceMs,
      maxDepth: settings.maxDepth,
      maxBytes: config.limits?.maxImageBytes || Infinity,
      maxCandidates: settings.maxCandidates * 4,
      includeMagicByteScan: settings.includeMagicByteScan && root.includeMagicByteScan,
    });
  }
  found.push(...listClaudeCodeImageCandidates(config, settings, hint));

  const top = found
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, settings.maxCandidates);
  if (shouldTryClipboardFallback(input, hint, found, settings)) {
    const clipboard = getClipboardImageCandidate(config);
    if (clipboard) top.unshift(clipboard);
  }
  const enriched = await enrichCandidates(top);
  return enriched
    .map((candidate) => scoreCandidate(candidate, hint, settings))
    .sort((a, b) => {
      if (hint.hasHint && b.score !== a.score) return b.score - a.score;
      return b.mtimeMs - a.mtimeMs;
    });
}

export function attachmentDiscoveryStatus(config) {
  const settings = attachmentSettings(config);
  return {
    ...settings,
    searchDirs: attachmentSearchDirs(settings),
  };
}

function attachmentSettings(config) {
  const attachments = config.attachments || {};
  return {
    autoDiscover: attachments.autoDiscover !== false,
    searchDirs: Array.isArray(attachments.searchDirs) ? attachments.searchDirs : [],
    maxAgeMinutes: clampNumber(attachments.maxAgeMinutes, 1, 24 * 60, 60),
    maxAutoSelectAgeSeconds: clampNumber(attachments.maxAutoSelectAgeSeconds, 5, 24 * 60 * 60, 180),
    maxDepth: clampNumber(attachments.maxDepth, 0, 10, 5),
    maxCandidates: clampNumber(attachments.maxCandidates, 1, 1000, 200),
    includeMagicByteScan: attachments.includeMagicByteScan !== false,
    clipboardFallback: attachments.clipboardFallback !== false,
    claudeCodeFallback: attachments.claudeCodeFallback !== false,
    claudeCodeDirs: Array.isArray(attachments.claudeCodeDirs) ? attachments.claudeCodeDirs : [],
    maxClaudeCodeSessionFiles: clampNumber(attachments.maxClaudeCodeSessionFiles, 1, 100, 12),
    maxClaudeCodeLinesPerFile: clampNumber(attachments.maxClaudeCodeLinesPerFile, 20, 5000, 400),
    maxClaudeCodeImages: clampNumber(attachments.maxClaudeCodeImages, 1, 100, 20),
    maxClaudeCodeAutoSelectAgeSeconds: clampNumber(attachments.maxClaudeCodeAutoSelectAgeSeconds, 5, 24 * 60 * 60, 600),
    maxImageBytes: config.limits?.maxImageBytes || Infinity,
  };
}

function attachmentSearchDirs(settings, hint = {}) {
  return attachmentSearchRoots(settings, hint).map((root) => root.dir);
}

function attachmentSearchRoots(settings, hint = {}) {
  const winTempDir = process.platform === "win32"
    ? path.join(os.homedir(), "AppData", "Local", "Temp")
    : "";
  const rootDir = process.platform === "win32" ? path.parse(process.cwd()).root : "/";
  const roots = [];
  const add = (dir, includeMagicByteScan = false) => {
    if (dir) roots.push({ dir, includeMagicByteScan });
  };

  for (const dir of settings.searchDirs) add(dir, true);
  for (const dir of searchDirsFromHint(hint)) add(dir, true);

  if (process.platform === "win32") {
    add(path.join(winTempDir, "readonly"), true);
    add(path.join(winTempDir, "claude"), true);
    add(path.join(rootDir, "temp", "readonly"), true);
  }
  add(path.join(process.cwd(), "temp"));
  add(path.join(process.cwd(), "temp", "readonly"), true);
  add(path.join(process.cwd(), "tmp"));
  add(path.join(process.cwd(), "tmp", "readonly"), true);
  add(process.env.TEMP);
  add(process.env.TMP);
  add(os.tmpdir());
  add(winTempDir);

  const seen = new Set();
  const resolved = [];
  for (const root of roots) {
    const dir = path.resolve(root.dir);
    const key = dir.toLowerCase();
    if (seen.has(key) || !fs.existsSync(dir)) continue;
    seen.add(key);
    resolved.push({ dir, includeMagicByteScan: root.includeMagicByteScan });
  }
  return resolved;
}

function collectImages(dir, state, depth = 0) {
  if (state.found.length >= state.maxCandidates) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (state.found.length >= state.maxCandidates) return;
    const fullPath = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (depth >= state.maxDepth) continue;
      if (SKIP_DIRS.has(entry.name.toLowerCase())) continue;
      collectImages(fullPath, state, depth + 1);
      continue;
    }
    if (!entry.isFile()) continue;

    const ext = path.extname(entry.name).toLowerCase();
    if (!IMAGE_EXTS.has(ext) && !state.includeMagicByteScan) continue;

    let stat;
    try {
      stat = fs.statSync(fullPath);
    } catch {
      continue;
    }
    if (stat.size <= 0 || stat.size > state.maxBytes || stat.mtimeMs < state.sinceMs) continue;
    const mime = imageMimeFromFile(fullPath, entry.name, state);
    if (!mime) continue;
    state.found.push({
      path: fullPath,
      fileName: entry.name,
      mime,
      sourceKind: "filesystem",
      bytes: stat.size,
      mtime: stat.mtime.toISOString(),
      mtimeMs: stat.mtimeMs,
    });
  }
}

function imageMimeFromFile(filePath, fileName, state) {
  const ext = path.extname(fileName).toLowerCase();
  if (IMAGE_EXTS.has(ext)) return mimeFromExt(ext);
  if (!state.includeMagicByteScan) return false;
  return detectImageMime(filePath);
}

function mimeFromExt(ext) {
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".bmp") return "image/bmp";
  return "";
}

export function detectImageMime(filePath) {
  let header;
  try {
    const fd = fs.openSync(filePath, "r");
    try {
      header = Buffer.alloc(16);
      fs.readSync(fd, header, 0, header.length, 0);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return "";
  }

  for (const signature of IMAGE_MAGIC_BYTES) {
    if (!matchesBytes(header, signature.bytes, signature.offset || 0)) continue;
    if (signature.secondary && !matchesBytes(header, signature.secondary.bytes, signature.secondary.offset)) continue;
    return signature.mime;
  }
  return "";
}

function matchesBytes(buffer, bytes, offset = 0) {
  return bytes.every((byte, index) => buffer[offset + index] === byte);
}

async function enrichCandidates(candidates) {
  const sharp = await loadSharp();
  if (!sharp) return candidates;
  return Promise.all(candidates.map(async (candidate) => {
    try {
      const metadata = await sharp(candidate.path, { animated: false, failOn: "none" }).metadata();
      return {
        ...candidate,
        width: metadata.width,
        height: metadata.height,
      };
    } catch {
      return candidate;
    }
  }));
}

function buildHint(input) {
  const raw = [
    input.attachment_name,
    input.attachment_hint,
    input.image_name,
    input.reference,
    input.task,
    input.prompt,
    input.question,
  ].filter(Boolean).join(" ");
  const dimensions = parseDimensions(raw);
  const tokens = raw.toLowerCase().match(/[a-z0-9._-]{4,}/g) || [];
  return {
    hasHint: Boolean(raw || dimensions),
    rawOriginal: raw,
    raw: raw.toLowerCase(),
    dimensions,
    tokens,
    hasSpecificFileToken: tokens.some((token) => IMAGE_EXTS.has(path.extname(token).toLowerCase())),
  };
}

function searchDirsFromHint(hint) {
  const raw = String(hint.rawOriginal || hint.raw || "");
  if (!raw) return [];

  const dirs = [];
  const matches = raw.match(/(?:[a-z]:)?[\\/][^\s"'<>|]+/gi) || [];
  for (const match of matches) {
    let value = match.replace(/[.,;:)\]}]+$/g, "");
    value = value.replace(/\.{2,}.*$/g, "");
    if (!value) continue;

    if (process.platform === "win32" && /^\\/.test(value)) {
      value = `${path.parse(process.cwd()).root.replace(/\\$/, "")}${value}`;
    }
    dirs.push(value);
    dirs.push(path.dirname(value));
  }
  return dirs;
}

function scoreCandidate(candidate, hint, settings) {
  const ageSeconds = Math.max(0, Math.round((Date.now() - candidate.mtimeMs) / 1000));
  const hintMatchScore = scoreHintMatch(candidate, hint);
  const recencyScore = Math.max(0, 10 - Math.round(ageSeconds / 60));
  const autoSelectable = hint.hasHint
    ? isHintSelectable(candidate, hint, hintMatchScore, ageSeconds, settings)
    : candidate.clipboard || ageSeconds <= settings.maxAutoSelectAgeSeconds;

  return {
    ...candidate,
    score: hint.hasHint ? hintMatchScore + recencyScore : recencyScore,
    hintMatchScore,
    ageSeconds,
    autoSelectable,
    autoSelectReason: autoSelectable
      ? autoSelectReason(candidate, hint)
      : (hint.hasHint ? "hint_not_matched" : "too_old_unhinted"),
  };
}

function isHintSelectable(candidate, hint, hintMatchScore, ageSeconds, settings) {
  if (hintMatchScore <= 0 && !candidate.claudeCodeHintMatched) return false;
  if (!candidate.claudeCode) return true;
  if (hint.hasSpecificFileToken && hintMatchScore > 0) return true;
  return ageSeconds <= settings.maxClaudeCodeAutoSelectAgeSeconds;
}

function autoSelectReason(candidate, hint) {
  if (candidate.clipboard) return "clipboard_image";
  if (candidate.claudeCode) return hint.hasHint ? "claude_code_hint_match" : "claude_code_recent_image";
  return hint.hasHint ? "hint_match" : "fresh_unhinted";
}

function scoreHintMatch(candidate, hint) {
  let score = 0;
  if (!hint.hasHint) return score;

  const fileName = candidate.fileName.toLowerCase();
  const fullPath = candidate.path.toLowerCase();
  for (const token of hint.tokens) {
    if (fileName === token) score += 120;
    else if (fileName.includes(token)) score += 100;
    else if (fullPath.includes(token)) score += 10;
  }

  if (candidate.claudeCode && candidate.claudeCodeHintMatched && score === 0 && !hint.hasSpecificFileToken) {
    score += 80;
  }
  if (candidate.clipboard && score === 0 && /\b(clipboard|paste|pasted|粘贴|剪贴板|参考图|上图|attached|attachment|image)\b/i.test(hint.raw)) {
    score += 30;
  }

  if (hint.dimensions && candidate.width && candidate.height && (!hint.hasSpecificFileToken || score > 0)) {
    const [w, h] = hint.dimensions;
    if ((candidate.width === w && candidate.height === h) || (candidate.width === h && candidate.height === w)) {
      score += 100;
    }
  }
  return score;
}

function parseDimensions(value) {
  const match = String(value || "").match(/(\d{1,5})\s*[x×]\s*(\d{1,5})/i);
  if (!match) return null;
  return [Number(match[1]), Number(match[2])];
}

function shouldTryClipboardFallback(input, hint, found, settings) {
  if (!settings.clipboardFallback) return false;
  if (input.use_clipboard === false) return false;
  if (input.use_clipboard === true) return true;
  if (found.length === 0) return true;
  if (hintLooksLikePastedAttachment(hint)) return true;

  const freshCutoff = Date.now() - settings.maxAutoSelectAgeSeconds * 1000;
  return !found.some((candidate) => candidate.mtimeMs >= freshCutoff);
}

function hintLooksLikePastedAttachment(hint) {
  const raw = hint?.raw || "";
  if (!raw) return false;
  const cjkTriggers = ["粘贴", "剪贴板", "参考图", "上图", "图1", "图2", "图片", "附件", "截图"];
  if (cjkTriggers.some((token) => raw.includes(token))) return true;
  return /\b(clipboard|paste|pasted|attached|attachment|image|screenshot|picture|photo)\b/i.test(raw);
}

async function loadSharp() {
  if (!sharpPromise) {
    sharpPromise = import("sharp")
      .then((module) => module.default || module)
      .catch(() => null);
  }
  return sharpPromise;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}
