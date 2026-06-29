import fs from "node:fs";

const AUTOVISION_PROMPT = {
  name: "single-modal-autovision",
  description: "Rules for text-only agents to call mcp-vision-bridge automatically for image, screenshot, OCR, and visual QA tasks.",
};

const REASONIX_PROMPT = {
  name: "reasonix-autovision",
  description: "Reasonix-specific rules and config guidance for automatic MCP image understanding with text-only models.",
};

const FALLBACK_AUTOVISION_RULE = `# Single-modal Auto Vision Rule

Use this rule when the active chat model is text-only and image understanding must be handled by mcp-vision-bridge.

Do not ask the user to call the vision MCP server. Do not ask for an image path unless automatic discovery fails. Whenever the conversation contains an image-related input or task, call the vision-bridge MCP tools first, then answer normally from the vision result.

If the current host model can natively see uploaded image attachments, disable this bridge with mcp-vision-bridge-vision off or vision_set_enabled enabled=false, then use the host model's native multimodal ability. If any MCP vision tool returns status: "vision_disabled", stop calling MCP vision tools for that image. Do not call vision_set_enabled enabled=true; only the user should re-enable MCP vision by running mcp-vision-bridge-vision on in a terminal.

Use vision_analyze_attachment for uploaded or pasted attachments with no visible path.
Use vision_analyze_screenshot immediately after Playwright, webapp-testing, browser automation, IDE automation, or terminal capture saves a screenshot.
Use vision_ocr_image for OCR, vision_image_to_markdown for document/table/chart/page screenshots, vision_ask_image for specific questions, and vision_register_image for repeated multi-turn image analysis.
`;

const FALLBACK_REASONIX_RULE = `# Reasonix Auto Vision Rule

Use this rule in Reasonix when the active model is text-only and images should be handled by mcp-vision-bridge.

Register the MCP server in %APPDATA%\\reasonix\\config.toml:

[[plugins]]
name = "vision-bridge"
type = "stdio"
command = "mcp-vision-bridge"
trusted_read_only_tools = [
  "vision_status",
  "vision_list_profiles",
  "vision_list_recent_images",
  "vision_analyze_attachment",
  "vision_analyze_screenshot",
  "vision_describe_image",
  "vision_ask_image",
  "vision_ocr_image",
  "vision_image_to_markdown"
]

When the user uploads, pastes, or refers to an image with phrases such as 上图, 参考图, 图1, 图2, screenshot, attached image, or the image above, call mcp__vision-bridge__vision_analyze_attachment before answering. If direct upload to the host model causes provider HTTP 400, avoid sending image blocks to the text-only model and use MCP attachment discovery, clipboard fallback, local path, or URL instead.
`;

export function listPrompts() {
  return [AUTOVISION_PROMPT, REASONIX_PROMPT];
}

export function getPrompt(name) {
  if (name === AUTOVISION_PROMPT.name) {
    return promptResult(AUTOVISION_PROMPT, readRule("../rules/single-modal-autovision.md", FALLBACK_AUTOVISION_RULE));
  }

  if (name === REASONIX_PROMPT.name) {
    return promptResult(REASONIX_PROMPT, readRule("../rules/reasonix-autovision.md", FALLBACK_REASONIX_RULE));
  }

  throw new Error(`Unknown prompt: ${name}`);
}

function promptResult(prompt, text) {
  return {
    description: prompt.description,
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text,
        },
      },
    ],
  };
}

function readRule(rulePath, fallback) {
  try {
    return fs.readFileSync(new URL(rulePath, import.meta.url), "utf8");
  } catch {
    return fallback;
  }
}
