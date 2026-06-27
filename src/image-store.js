import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { detectImageMime, discoverAttachmentImage } from "./attachment-discovery.js";
import { assertUrlFetchAllowed, isRemoteEndpoint } from "./privacy.js";

const MIME_BY_EXT = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
};

const EXT_BY_MIME = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/bmp": ".bmp",
};

export function dataUrlFromImage(image) {
  if (!image.buffer) throw new Error("Image buffer is not available for Base64 transport.");
  return `data:${image.mime};base64,${image.buffer.toString("base64")}`;
}

export async function readImageInput(input, config, options = {}) {
  if (input.image_id) return loadImageById(input.image_id, config);
  if (input.image_path) return readImagePath(input.image_path, config);
  if (input.image_url) {
    if (shouldUseDirectImageUrl(config, options)) return readImageUrlDirect(input.image_url, config);
    return readImageUrl(input.image_url, config);
  }
  if (input.image_base64) return readImageBase64(input.image_base64, input.mime_type);
  const attachment = await discoverAttachmentImage(input, config);
  if (attachment) {
    return readImagePath(attachment.path, config, {
      auto_discovered_attachment: true,
      attachment_hint: input.attachment_hint,
      attachment_name: input.attachment_name,
      attachment_index: input.attachment_index || 1,
      matched_path: attachment.path,
      matched_file_name: attachment.fileName,
      matched_mime: attachment.mime,
      matched_width: attachment.width,
      matched_height: attachment.height,
      matched_score: attachment.score,
      matched_age_seconds: attachment.ageSeconds,
      matched_auto_select_reason: attachment.autoSelectReason,
    });
  }
  throw new Error("No current local attachment image was found. Provide image_path/image_url/image_base64, or paste/upload the image again and call attachment auto-discovery within the fresh-image window.");
}

export function registerImage(image, config, source = {}) {
  const imagesDir = path.join(config.dataDir, "images");
  fs.mkdirSync(imagesDir, { recursive: true });

  const hash = crypto.createHash("sha256").update(image.buffer).digest("hex");
  const id = `img_${Date.now().toString(36)}_${hash.slice(0, 10)}`;
  const ext = EXT_BY_MIME[image.mime] || ".img";
  const filePath = path.join(imagesDir, `${id}${ext}`);

  fs.writeFileSync(filePath, image.buffer);

  const record = {
    id,
    path: filePath,
    mime: image.mime,
    bytes: image.buffer.length,
    sha256: hash,
    createdAt: new Date().toISOString(),
    source,
  };

  const indexPath = path.join(config.dataDir, "index.json");
  const index = readIndex(indexPath);
  index.images[id] = record;
  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");

  return record;
}

export function loadImageById(id, config) {
  const indexPath = path.join(config.dataDir, "index.json");
  const index = readIndex(indexPath);
  const record = index.images[id];
  if (!record) throw new Error(`Unknown image_id: ${id}`);
  if (!fs.existsSync(record.path)) throw new Error(`Cached image file is missing for ${id}: ${record.path}`);
  return {
    buffer: fs.readFileSync(record.path),
    mime: record.mime,
    source: { image_id: id, path: record.path },
  };
}

function readImagePath(imagePath, config, sourceExtra = {}) {
  const resolved = path.resolve(imagePath);
  if (!fs.existsSync(resolved)) throw new Error(`Image file does not exist: ${resolved}`);
  const stat = fs.statSync(resolved);
  assertMaxBytes(stat.size, config);
  const ext = path.extname(resolved).toLowerCase();
  return {
    buffer: fs.readFileSync(resolved),
    mime: MIME_BY_EXT[ext] || sourceExtra.matched_mime || detectImageMime(resolved) || "image/jpeg",
    source: { image_path: resolved, ...sourceExtra },
  };
}

async function readImageUrl(imageUrl, config) {
  assertUrlFetchAllowed(config);
  const url = new URL(imageUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http:// and https:// image URLs are supported.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.limits.requestTimeoutMs);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "mcp-vision-bridge/0.1" },
    });
    if (!response.ok) throw new Error(`Image download failed: HTTP ${response.status}`);

    const mime = normalizeMime(response.headers.get("content-type") || "");
    if (!mime.startsWith("image/")) {
      throw new Error(`URL did not return an image content-type: ${mime || "unknown"}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    assertMaxBytes(buffer.length, config);
    return { buffer, mime, source: { image_url: imageUrl } };
  } finally {
    clearTimeout(timer);
  }
}

function readImageUrlDirect(imageUrl, config) {
  assertUrlFetchAllowed(config);
  const url = new URL(imageUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http:// and https:// image URLs are supported.");
  }
  return {
    url: url.toString(),
    mime: "image/url",
    source: { image_url: imageUrl, direct_url: true },
  };
}

function shouldUseDirectImageUrl(config, options) {
  if (options.allowDirectUrl === false) return false;
  const mode = config.image?.urlTransport || "remote-direct";
  if (mode === "fetch") return false;
  if (mode === "direct") return true;
  if (mode !== "remote-direct") return false;
  try {
    return isRemoteEndpoint(config.provider?.baseUrl || "");
  } catch {
    return false;
  }
}

function readImageBase64(value, mimeType) {
  const match = value.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    return {
      buffer: Buffer.from(match[2], "base64"),
      mime: normalizeMime(match[1]),
      source: { image_base64: true },
    };
  }
  return {
    buffer: Buffer.from(value, "base64"),
    mime: normalizeMime(mimeType || "image/jpeg"),
    source: { image_base64: true },
  };
}

function readIndex(indexPath) {
  if (!fs.existsSync(indexPath)) return { images: {} };
  return JSON.parse(fs.readFileSync(indexPath, "utf8"));
}

function normalizeMime(value) {
  return value.split(";")[0].trim().toLowerCase() || "image/jpeg";
}

function assertMaxBytes(bytes, config) {
  if (bytes > config.limits.maxImageBytes) {
    throw new Error(`Image is too large: ${bytes} bytes. Limit is ${config.limits.maxImageBytes} bytes.`);
  }
}
