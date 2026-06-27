import fs from "node:fs";

const AUTOVISION_PROMPT = {
  name: "single-modal-autovision",
  description: "Rules for text-only agents to call mcp-vision-bridge automatically for image, screenshot, OCR, and visual QA tasks.",
};

const FALLBACK_AUTOVISION_RULE = `# Single-modal Auto Vision Rule

Use this rule when the active chat model is text-only and image understanding must be handled by mcp-vision-bridge.

Do not ask the user to call the vision MCP server. Do not ask for an image path unless automatic discovery fails. Whenever the conversation contains an image-related input or task, call the vision-bridge MCP tools first, then answer normally from the vision result.

Use vision_analyze_attachment for uploaded or pasted attachments with no visible path.
Use vision_analyze_screenshot immediately after Playwright, webapp-testing, browser automation, IDE automation, or terminal capture saves a screenshot.
Use vision_ocr_image for OCR, vision_image_to_markdown for document/table/chart/page screenshots, vision_ask_image for specific questions, and vision_register_image for repeated multi-turn image analysis.
`;

export function listPrompts() {
  return [AUTOVISION_PROMPT];
}

export function getPrompt(name) {
  if (name !== AUTOVISION_PROMPT.name) {
    throw new Error(`Unknown prompt: ${name}`);
  }

  const text = readAutoVisionRule();
  return {
    description: AUTOVISION_PROMPT.description,
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

function readAutoVisionRule() {
  try {
    return fs.readFileSync(new URL("../rules/single-modal-autovision.md", import.meta.url), "utf8");
  } catch {
    return FALLBACK_AUTOVISION_RULE;
  }
}
