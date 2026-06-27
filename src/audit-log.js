import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export function appendAuditLog(config, entry) {
  if (!config.logging?.enabled) return;

  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const dir = config.logging.dir || path.join(config.dataDir, "logs");
  fs.mkdirSync(dir, { recursive: true });

  const sanitized = sanitizeEntry({
    timestamp: now.toISOString(),
    ...entry,
  }, config);

  fs.appendFileSync(path.join(dir, `vision-${day}.jsonl`), `${JSON.stringify(sanitized)}\n`, "utf8");
}

export function summarizeImage(image) {
  const summary = {
    mime: image.mime,
    source: image.source || {},
  };
  if (image.url) {
    summary.url = image.url;
    summary.transport = "url";
  }
  if (image.buffer) {
    summary.bytes = image.buffer.length;
    summary.sha256 = crypto.createHash("sha256").update(image.buffer).digest("hex");
    if (!summary.transport) summary.transport = "base64";
  }
  if (image.width && image.height) {
    summary.width = image.width;
    summary.height = image.height;
  }
  if (image.preprocessing) summary.preprocessing = image.preprocessing;
  return summary;
}

export function providerSummary(config) {
  return {
    name: config.provider?.name,
    type: config.provider?.type,
    baseUrl: config.provider?.baseUrl,
    model: config.provider?.model,
  };
}

function sanitizeEntry(entry, config) {
  const next = structuredClone(entry);
  if (!config.logging?.includePrompt) delete next.prompt;
  if (!config.logging?.includeResult) delete next.result;
  delete next.apiKey;
  if (next.provider) delete next.provider.apiKey;
  return next;
}
