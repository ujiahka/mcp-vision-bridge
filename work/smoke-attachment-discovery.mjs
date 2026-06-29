import fs from "node:fs";
import path from "node:path";
import { discoverAttachmentImage, listRecentAttachmentImages } from "../src/attachment-discovery.js";

const root = process.cwd();
const tmpDir = path.join(root, "work", "attachment-discovery-smoke");
const claudeDir = path.join(tmpDir, "claude-projects", "project");
fs.mkdirSync(tmpDir, { recursive: true });

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64");
try {
  const stalePath = path.join(tmpDir, "stale-upload.png");
  const freshPath = path.join(tmpDir, "fresh-upload.png");
  const readonlyDir = path.join(tmpDir, "readonly", "mcp_vision_case");
  const extensionlessPath = path.join(readonlyDir, "payload");
  const now = Date.now();
  fs.mkdirSync(readonlyDir, { recursive: true });
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.writeFileSync(stalePath, png);
  fs.writeFileSync(freshPath, png);
  fs.writeFileSync(extensionlessPath, png);
  const claudeSessionPath = path.join(claudeDir, "session.jsonl");
  fs.writeFileSync(claudeSessionPath, `${JSON.stringify({
    type: "user",
    uuid: "claude-image-message",
    promptId: "claude-image-prompt",
    timestamp: new Date(now + 2000).toISOString(),
    message: {
      role: "user",
      content: [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: png.toString("base64"),
          },
        },
        { type: "text", text: "reference image" },
      ],
    },
  })}\n`, "utf8");

  const staleTime = new Date(now - 10 * 60 * 1000);
  const freshTime = new Date(now + 1000);
  fs.utimesSync(stalePath, staleTime, staleTime);
  fs.utimesSync(freshPath, freshTime, freshTime);
  fs.utimesSync(extensionlessPath, freshTime, freshTime);

  const config = {
    dataDir: path.join(tmpDir, "data"),
    attachments: {
      autoDiscover: true,
      searchDirs: [tmpDir],
      maxAgeMinutes: 60,
      maxAutoSelectAgeSeconds: 180,
      maxDepth: 0,
      maxCandidates: 20,
      claudeCodeFallback: true,
      claudeCodeDirs: [path.join(tmpDir, "claude-projects")],
      maxClaudeCodeSessionFiles: 5,
      maxClaudeCodeLinesPerFile: 20,
      maxClaudeCodeImages: 5,
      clipboardFallback: false,
    },
    limits: {
      maxImageBytes: 25 * 1024 * 1024,
    },
  };

  const images = await listRecentAttachmentImages({}, config);
  if (!images.some((image) => image.fileName === "stale-upload.png" && image.autoSelectable === false)) {
    throw new Error("Expected stale image to be listed but not auto-selectable.");
  }
  if (!images.some((image) => image.fileName === "fresh-upload.png" && image.autoSelectable === true)) {
    throw new Error("Expected fresh image to be auto-selectable.");
  }
  if (!images.some((image) => image.sourceKind === "claude-code-session" && image.autoSelectable === true)) {
    throw new Error("Expected Claude Code session image to be listed and auto-selectable.");
  }

  const unhinted = await discoverAttachmentImage({}, config);
  if (!unhinted?.path) {
    throw new Error("Expected an image for unhinted discovery.");
  }

  const unmatchedHint = await discoverAttachmentImage({ attachment_hint: "missing-file.png 1x1" }, config);
  if (unmatchedHint) {
    throw new Error(`Expected unmatched hint to return no image, got ${unmatchedHint.path}`);
  }

  const matchedHint = await discoverAttachmentImage({ attachment_hint: "stale-upload.png 1x1" }, config);
  if (matchedHint?.path !== stalePath) {
    throw new Error(`Expected exact hint to select stale image, got ${matchedHint?.path}`);
  }

  const pathHint = await discoverAttachmentImage({
    attachment_hint: `${path.join(readonlyDir, "mcp_vision_payload")} image.png 1x1`,
  }, config);
  if (pathHint?.path !== extensionlessPath || pathHint.mime !== "image/png") {
    throw new Error(`Expected path/dimension hint to select extensionless PNG, got ${pathHint?.path} ${pathHint?.mime}`);
  }

  const claudeHint = await discoverAttachmentImage({ attachment_hint: "attached image" }, config);
  if (claudeHint?.sourceKind !== "claude-code-session" || claudeHint.mime !== "image/png") {
    throw new Error(`Expected Claude Code session image, got ${claudeHint?.sourceKind} ${claudeHint?.path}`);
  }

  console.log("attachment-discovery: ok");
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
