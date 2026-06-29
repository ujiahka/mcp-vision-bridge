import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CLAUDE_MAX_SESSION_FILES = 12;
const CLAUDE_MAX_LINES_PER_FILE = 400;
const MIME_EXTS = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/bmp": ".bmp",
};

export function listClaudeCodeImageCandidates(config, settings, hint = {}) {
  if (!settings.claudeCodeFallback) return [];
  if (!config?.dataDir) return [];

  const files = listRecentClaudeSessionFiles(settings);
  const images = [];
  for (const file of files) {
    for (const image of extractImagesFromSessionFile(file, config, settings)) {
      images.push(image);
      if (images.length >= settings.maxClaudeCodeImages) return finalizeClaudeCodeImages(images, hint);
    }
  }

  return finalizeClaudeCodeImages(images, hint);
}

function finalizeClaudeCodeImages(images, hint) {
  return images.map((image) => ({
    ...image,
    claudeCodeHintMatched: claudeCodeHintMatches(image, hint),
  }));
}

function listRecentClaudeSessionFiles(settings) {
  const roots = claudeProjectRoots(settings);
  const files = [];
  for (const root of roots) collectJsonlFiles(root, files);
  return files
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, settings.maxClaudeCodeSessionFiles);
}

function claudeProjectRoots(settings) {
  const configured = Array.isArray(settings.claudeCodeDirs) ? settings.claudeCodeDirs : [];
  const defaults = [
    path.join(os.homedir(), ".claude", "projects"),
  ];
  const candidates = configured.length ? configured : defaults;
  const seen = new Set();
  const roots = [];
  for (const dir of candidates) {
    if (!dir) continue;
    const resolved = path.resolve(dir);
    const key = resolved.toLowerCase();
    if (seen.has(key) || !fs.existsSync(resolved)) continue;
    seen.add(key);
    roots.push(resolved);
  }
  return roots;
}

function collectJsonlFiles(dir, files, depth = 0) {
  if (depth > 2 || files.length >= CLAUDE_MAX_SESSION_FILES * 8) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectJsonlFiles(fullPath, files, depth + 1);
      continue;
    }
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".jsonl") continue;
    try {
      const stat = fs.statSync(fullPath);
      files.push({ path: fullPath, mtimeMs: stat.mtimeMs, mtime: stat.mtime });
    } catch {
      // Ignore files that disappear during scanning.
    }
  }
}

function extractImagesFromSessionFile(file, config, settings) {
  const lines = readTailLines(file.path, settings.maxClaudeCodeLinesPerFile);
  const images = [];
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    let record;
    try {
      record = JSON.parse(lines[i]);
    } catch {
      continue;
    }

    const timestampMs = Date.parse(record.timestamp || "");
    if (!Number.isFinite(timestampMs)) continue;
    const maxAgeMs = settings.maxAgeMinutes * 60 * 1000;
    if (Date.now() - timestampMs > maxAgeMs) continue;

    const blocks = imageBlocksFromRecord(record);
    for (const block of blocks.reverse()) {
      const candidate = saveClaudeCodeImage(block, record, file, config, settings, images.length + 1);
      if (candidate) images.push(candidate);
      if (images.length >= settings.maxClaudeCodeImages) return images;
    }
  }
  return images;
}

function readTailLines(filePath, maxLines) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return [];
  }
  return raw.split(/\r?\n/).filter(Boolean).slice(-maxLines);
}

function imageBlocksFromRecord(record) {
  const blocks = [];
  collectImageBlocks(record?.message?.content, blocks);
  return blocks;
}

function collectImageBlocks(value, blocks) {
  if (!value) return;
  if (Array.isArray(value)) {
    for (const item of value) collectImageBlocks(item, blocks);
    return;
  }
  if (typeof value !== "object") return;

  if (value.type === "image" && value.source?.type === "base64" && value.source.data) {
    blocks.push(value);
    return;
  }

  for (const key of ["content", "message"]) {
    if (value[key]) collectImageBlocks(value[key], blocks);
  }
}

function saveClaudeCodeImage(block, record, file, config, settings, index) {
  const mime = normalizeImageMime(block.source.media_type);
  if (!mime) return null;
  const buffer = safeBase64Buffer(block.source.data);
  if (!buffer || buffer.length <= 0 || buffer.length > settings.maxImageBytes) return null;

  const hash = crypto.createHash("sha256").update(buffer).digest("hex");
  const ext = MIME_EXTS[mime] || ".img";
  const fileName = `claude-code-${hash.slice(0, 16)}${ext}`;
  const dir = path.join(config.dataDir, "attachments", "claude-code");
  const outPath = path.join(dir, fileName);
  try {
    fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(outPath)) fs.writeFileSync(outPath, buffer);
    const stat = fs.statSync(outPath);
    return {
      path: outPath,
      fileName,
      mime,
      sourceKind: "claude-code-session",
      bytes: stat.size,
      mtime: new Date(Date.parse(record.timestamp)).toISOString(),
      mtimeMs: Date.parse(record.timestamp),
      claudeCodeSessionPath: file.path,
      claudeCodeMessageUuid: record.uuid,
      claudeCodePromptId: record.promptId,
      claudeCodeImageIndex: index,
      claudeCode: true,
    };
  } catch {
    return null;
  }
}

function safeBase64Buffer(value) {
  try {
    return Buffer.from(String(value || ""), "base64");
  } catch {
    return null;
  }
}

function normalizeImageMime(value) {
  const mime = String(value || "").split(";")[0].trim().toLowerCase();
  return MIME_EXTS[mime] ? mime : "";
}

function claudeCodeHintMatches(image, hint) {
  if (!hint?.hasHint) return false;
  if (hintLooksLikeClaudeAttachment(hint.raw)) return true;
  for (const token of hint.tokens || []) {
    if (image.fileName.toLowerCase().includes(token)) return true;
    if (String(image.claudeCodeMessageUuid || "").toLowerCase().includes(token)) return true;
    if (String(image.claudeCodePromptId || "").toLowerCase().includes(token)) return true;
  }
  return false;
}

function hintLooksLikeClaudeAttachment(raw) {
  if (!raw) return false;
  const cjkTriggers = ["参考图", "上图", "图1", "图2", "图片", "附件", "截图", "粘贴", "上传"];
  if (cjkTriggers.some((token) => raw.includes(token))) return true;
  return /\b(image|attached|attachment|screenshot|picture|photo|paste|pasted|upload|uploaded)\b/i.test(raw);
}
