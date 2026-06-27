import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"]);
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

  const dirs = attachmentSearchDirs(settings);
  const sinceMs = Date.now() - settings.maxAgeMinutes * 60 * 1000;
  const found = [];
  for (const dir of dirs) {
    collectImages(dir, {
      found,
      sinceMs,
      maxDepth: settings.maxDepth,
      maxBytes: config.limits?.maxImageBytes || Infinity,
      maxCandidates: settings.maxCandidates * 4,
    });
  }

  const hint = buildHint(input);
  const top = found
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, settings.maxCandidates);
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
  };
}

function attachmentSearchDirs(settings) {
  const dirs = [
    ...settings.searchDirs,
    process.env.TEMP,
    process.env.TMP,
    os.tmpdir(),
  ];
  if (process.platform === "win32") {
    dirs.push(path.join(os.homedir(), "AppData", "Local", "Temp"));
  }
  dirs.push(path.join(process.cwd(), "temp"));
  dirs.push(path.join(process.cwd(), "tmp"));
  return [...new Set(dirs.filter(Boolean).map((dir) => path.resolve(dir)))].filter((dir) => fs.existsSync(dir));
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
    if (!IMAGE_EXTS.has(path.extname(entry.name).toLowerCase())) continue;

    let stat;
    try {
      stat = fs.statSync(fullPath);
    } catch {
      continue;
    }
    if (stat.size <= 0 || stat.size > state.maxBytes || stat.mtimeMs < state.sinceMs) continue;
    state.found.push({
      path: fullPath,
      fileName: entry.name,
      bytes: stat.size,
      mtime: stat.mtime.toISOString(),
      mtimeMs: stat.mtimeMs,
    });
  }
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
  ].filter(Boolean).join(" ");
  const dimensions = parseDimensions(raw);
  const tokens = raw.toLowerCase().match(/[a-z0-9._-]{4,}/g) || [];
  return {
    hasHint: Boolean(raw || dimensions),
    raw: raw.toLowerCase(),
    dimensions,
    tokens,
  };
}

function scoreCandidate(candidate, hint, settings) {
  const ageSeconds = Math.max(0, Math.round((Date.now() - candidate.mtimeMs) / 1000));
  const hintMatchScore = scoreHintMatch(candidate, hint);
  const recencyScore = Math.max(0, 10 - Math.round(ageSeconds / 60));
  const autoSelectable = hint.hasHint
    ? hintMatchScore > 0
    : ageSeconds <= settings.maxAutoSelectAgeSeconds;

  return {
    ...candidate,
    score: hint.hasHint ? hintMatchScore + recencyScore : recencyScore,
    hintMatchScore,
    ageSeconds,
    autoSelectable,
    autoSelectReason: autoSelectable
      ? (hint.hasHint ? "hint_match" : "fresh_unhinted")
      : (hint.hasHint ? "hint_not_matched" : "too_old_unhinted"),
  };
}

function scoreHintMatch(candidate, hint) {
  let score = 0;
  if (!hint.hasHint) return score;

  const fileName = candidate.fileName.toLowerCase();
  const fullPath = candidate.path.toLowerCase();
  for (const token of hint.tokens) {
    if (fileName === token) score += 40;
    else if (fileName.includes(token)) score += 20;
    else if (fullPath.includes(token)) score += 10;
  }

  if (hint.dimensions && candidate.width && candidate.height) {
    const [w, h] = hint.dimensions;
    if ((candidate.width === w && candidate.height === h) || (candidate.width === h && candidate.height === w)) {
      score += 100;
    }
  }
  return score;
}

function parseDimensions(value) {
  const match = String(value || "").match(/(\d{2,5})\s*[x×]\s*(\d{2,5})/i);
  if (!match) return null;
  return [Number(match[1]), Number(match[2])];
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
