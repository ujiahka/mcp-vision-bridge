import { readImageInput, registerImage } from "./image-store.js";
import { prepareImageForVision } from "./image-preprocess.js";
import { callVisionModel } from "./vision-client.js";
import { appendAuditLog, providerSummary, summarizeImage } from "./audit-log.js";
import { listRecentAttachmentImages } from "./attachment-discovery.js";
import { listProfiles, saveConfig, switchActiveProfile } from "./config.js";

const IMAGE_INPUT_PROPERTIES = {
  image_id: { type: "string", description: "Previously registered local image id." },
  image_path: { type: "string", description: "Local image path." },
  image_url: { type: "string", description: "HTTP(S) image URL. Requires allowUrlFetch=true. Remote API providers can receive this URL directly; local providers fetch and convert it to Base64." },
  image_base64: { type: "string", description: "Raw base64 image or data:image/...;base64,... value." },
  mime_type: { type: "string", description: "MIME type for raw base64 input, e.g. image/png." },
  attachment_name: { type: "string", description: "Optional attachment file name shown by the client, e.g. image.png." },
  attachment_hint: { type: "string", description: "Optional free-form hint from the attachment chip. Include all visible chip text/path fragments, e.g. 'image.png 2911x1440 \\temp\\readonly\\mcp_vision...'." },
  attachment_index: { type: "number", description: "Use the Nth newest matching auto-discovered attachment image. Default is 1." },
  auto_discover_attachment: { type: "boolean", description: "Search recent local temp images when no explicit image input is provided. Enabled by default in config." },
};

export function listTools() {
  return [
    {
      name: "vision_list_profiles",
      description: "List configured vision provider profiles. Use this before switching plans or models when quota is exhausted.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "vision_switch_profile",
      description: "Switch the active vision provider profile and persist it to the local config. Useful when one API plan/model is out of quota.",
      inputSchema: {
        type: "object",
        properties: {
          profile: { type: "string", description: "Profile id from vision_list_profiles." },
        },
        required: ["profile"],
      },
    },
    {
      name: "vision_analyze_attachment",
      description: "One-shot image analysis for uploaded/pasted attachments when the user says common references such as 上图, 参考图, 图1, 图2, screenshot, attached image, or the image above. If the attachment chip shows a filename, dimensions, or path fragment, pass that visible text as attachment_hint. Call this with no image args only when no path or chip text is visible; use attachment_index for 图2/image 2. If the host model can natively inspect the image attachment, answer directly instead of calling this MCP tool.",
      inputSchema: {
        type: "object",
        properties: {
          ...IMAGE_INPUT_PROPERTIES,
          task: { type: "string", description: "The user's request about the image, e.g. '参考图帮我改 UI' or 'What error is shown in image 2?'." },
          reference: { type: "string", description: "Optional short image reference phrase, e.g. 上图, 参考图, 图1, 图2, attached image." },
          max_tokens: { type: "number", description: "Maximum output tokens." },
          register: { type: "boolean", description: "Also register this image and include image_id in the result." },
        },
      },
    },
    {
      name: "vision_analyze_screenshot",
      description: "Analyze a browser, IDE, terminal, or app screenshot captured during automated testing. Use this immediately after Playwright/webapp-testing saves a screenshot for visual verification, UI review, or screenshot comparison. Pass image_path when the screenshot file path is known.",
      inputSchema: {
        type: "object",
        properties: {
          ...IMAGE_INPUT_PROPERTIES,
          task: { type: "string", description: "What to check in the screenshot, such as visual regressions, layout problems, UI polish, error messages, or comparison notes." },
          expected: { type: "string", description: "Optional expected visual state or baseline description." },
          max_tokens: { type: "number", description: "Maximum output tokens." },
          register: { type: "boolean", description: "Also register this screenshot and include image_id in the result." },
        },
      },
    },
    {
      name: "vision_list_recent_images",
      description: "List recent local image attachments discovered in temp directories. Use this when the user pasted/uploaded an image but did not provide an absolute path, especially if multiple images may match references like 图1/图2 or attached image.",
      inputSchema: {
        type: "object",
        properties: {
          attachment_name: IMAGE_INPUT_PROPERTIES.attachment_name,
          attachment_hint: IMAGE_INPUT_PROPERTIES.attachment_hint,
          max_results: { type: "number", description: "Maximum candidates to return." },
        },
      },
    },
    {
      name: "vision_probe",
      description: "Test the configured vision provider with a tiny built-in image and report whether image input works.",
      inputSchema: {
        type: "object",
        properties: {
          max_tokens: { type: "number", description: "Maximum output tokens." },
        },
      },
    },
    {
      name: "vision_register_image",
      description: "Register an image in the local cache and return an image_id for repeated multi-turn vision calls. If no image input is provided, it can auto-discover the newest recent local attachment image, including pasted/uploaded images referenced as 上图, 参考图, 图1, or attached image.",
      inputSchema: {
        type: "object",
        properties: {
          ...IMAGE_INPUT_PROPERTIES,
        },
      },
    },
    {
      name: "vision_describe_image",
      description: "Describe an image faithfully with visible-only details, OCR text, layout, and uncertainties. If the user refers to an uploaded/pasted attachment with 上图, 参考图, 图1, 图2, screenshot, or attached image and no path is available, prefer vision_analyze_attachment or call this with attachment_hint/no image input.",
      inputSchema: {
        type: "object",
        properties: {
          ...IMAGE_INPUT_PROPERTIES,
          prompt: { type: "string", description: "Optional custom instruction." },
          max_tokens: { type: "number", description: "Maximum output tokens." },
          register: { type: "boolean", description: "Also register this image and include image_id in the result." },
        },
      },
    },
    {
      name: "vision_ask_image",
      description: "Ask a specific question about an image. Supports image_path, image_url, image_base64, image_id, or auto-discovered recent local attachments referenced as 上图, 参考图, 图1, 图2, screenshot, or attached image.",
      inputSchema: {
        type: "object",
        properties: {
          ...IMAGE_INPUT_PROPERTIES,
          question: { type: "string", description: "Question to answer from the image." },
          max_tokens: { type: "number" },
        },
        required: ["question"],
      },
    },
    {
      name: "vision_ocr_image",
      description: "Extract visible text from an image while preserving reading order and layout when possible. Supports auto-discovery of recent local pasted/uploaded attachments when no path is supplied, including common references such as 上图, 参考图, 图1, 图2, screenshot, or attached image.",
      inputSchema: {
        type: "object",
        properties: {
          ...IMAGE_INPUT_PROPERTIES,
          max_tokens: { type: "number" },
        },
      },
    },
    {
      name: "vision_image_to_markdown",
      description: "Convert an image, screenshot, document page, chart, or table into a Markdown fact sheet for text-only models. Supports auto-discovery of recent local pasted/uploaded attachments when no path is supplied, including 上图, 参考图, 图1, 图2, screenshot, or attached image.",
      inputSchema: {
        type: "object",
        properties: {
          ...IMAGE_INPUT_PROPERTIES,
          max_tokens: { type: "number" },
        },
      },
    },
    {
      name: "vision_analyze_region",
      description: "Analyze a rectangular region. The current dependency-free implementation sends the full image with bbox focus instructions.",
      inputSchema: {
        type: "object",
        properties: {
          ...IMAGE_INPUT_PROPERTIES,
          bbox: {
            type: "array",
            items: { type: "number" },
            minItems: 4,
            maxItems: 4,
            description: "[x, y, width, height] in source image pixels.",
          },
          question: { type: "string", description: "Question about the region." },
          max_tokens: { type: "number" },
        },
        required: ["bbox"],
      },
    },
  ];
}

export async function callTool(name, args, config) {
  switch (name) {
    case "vision_list_profiles":
      return listProfilesTool(config);
    case "vision_switch_profile":
      return switchProfileTool(args, config);
    case "vision_analyze_attachment":
      return analyzeAttachmentTool(args, config);
    case "vision_analyze_screenshot":
      return analyzeScreenshotTool(args, config);
    case "vision_list_recent_images":
      return listRecentImagesTool(args, config);
    case "vision_probe":
      return probeTool(args, config);
    case "vision_register_image":
      return registerTool(args, config);
    case "vision_describe_image":
      return describeTool(args, config);
    case "vision_ask_image":
      return askTool(args, config);
    case "vision_ocr_image":
      return ocrTool(args, config);
    case "vision_image_to_markdown":
      return markdownTool(args, config);
    case "vision_analyze_region":
      return regionTool(args, config);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function listProfilesTool(config) {
  return JSON.stringify({
    activeProfile: config.activeProfile || "default",
    profiles: listProfiles(config),
  }, null, 2);
}

function switchProfileTool(args, config) {
  const profile = String(args.profile || "").trim();
  if (!profile) throw new Error("profile is required.");

  const next = switchActiveProfile(config, profile);
  replaceObject(config, next);
  const configPath = saveConfig(config);

  appendAuditLog(config, {
    event: "profile_switch",
    success: true,
    provider: providerSummary(config),
    result: {
      activeProfile: config.activeProfile,
      configPath,
    },
  });

  return JSON.stringify({
    activeProfile: config.activeProfile,
    provider: providerSummary(config),
    configPath,
  }, null, 2);
}

async function listRecentImagesTool(args, config) {
  const images = await listRecentAttachmentImages(args, config);
  const maxResults = Math.max(1, Math.min(50, Number(args.max_results || 10)));
  return JSON.stringify({
    count: images.length,
    returned: Math.min(images.length, maxResults),
    images: images.slice(0, maxResults).map((image, index) => ({
      attachment_index: index + 1,
      path: image.path,
      fileName: image.fileName,
      mime: image.mime,
      bytes: image.bytes,
      width: image.width,
      height: image.height,
      mtime: image.mtime,
      ageSeconds: image.ageSeconds,
      score: image.score,
      hintMatchScore: image.hintMatchScore,
      autoSelectable: image.autoSelectable,
      autoSelectReason: image.autoSelectReason,
    })),
  }, null, 2);
}

function replaceObject(target, source) {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, source);
}

async function probeTool(args, config) {
  const image = {
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64"),
    mime: "image/png",
    source: { builtin: "1x1_png_probe" },
  };
  const prompt = "Reply with OK if you can receive this image input. Keep the answer under 10 words.";
  return runVisionCall({ config, toolName: "vision_probe", image, prompt, maxTokens: args.max_tokens || 32 });
}

async function registerTool(args, config) {
  const image = await readImageInput(args, config, { allowDirectUrl: false });
  const record = registerImage(image, config, image.source);
  appendAuditLog(config, {
    event: "register_image",
    success: true,
    provider: providerSummary(config),
    image: summarizeImage(image),
    result: {
      image_id: record.id,
      bytes: record.bytes,
      mime: record.mime,
      sha256: record.sha256,
    },
  });
  return JSON.stringify(record, null, 2);
}

async function analyzeAttachmentTool(args, config) {
  const input = normalizeAttachmentReference(args);
  const image = await readImageInput(input, config);
  const record = args.register ? registerImage(image, config, image.source) : null;
  const prompt = buildAttachmentPrompt(args);
  const text = await runVisionCall({ config, toolName: "vision_analyze_attachment", image, prompt, maxTokens: args.max_tokens });
  return record ? `image_id: ${record.id}\n\n${text}` : text;
}

async function analyzeScreenshotTool(args, config) {
  const image = await readImageInput(args, config);
  const record = args.register ? registerImage(image, config, image.source) : null;
  const prompt = buildScreenshotPrompt(args);
  const text = await runVisionCall({ config, toolName: "vision_analyze_screenshot", image, prompt, maxTokens: args.max_tokens });
  return record ? `image_id: ${record.id}\n\n${text}` : text;
}

async function describeTool(args, config) {
  const image = await readImageInput(args, config);
  const record = args.register ? registerImage(image, config, image.source) : null;
  const prompt = args.prompt || [
    "Describe this image in Chinese.",
    "Only state visible facts.",
    "Include scene/page layout, objects, OCR text, tables, relationships, and uncertainty.",
    "Do not invent details that are not visible.",
  ].join(" ");
  const text = await runVisionCall({ config, toolName: "vision_describe_image", image, prompt, maxTokens: args.max_tokens });
  return record ? `image_id: ${record.id}\n\n${text}` : text;
}

async function askTool(args, config) {
  const image = await readImageInput(args, config);
  const prompt = [
    "Answer the user's question from the image.",
    "If the answer is not visible, say that it cannot be determined from the image.",
    `Question: ${args.question}`,
  ].join("\n");
  return runVisionCall({ config, toolName: "vision_ask_image", image, prompt, maxTokens: args.max_tokens });
}

async function ocrTool(args, config) {
  const image = await readImageInput(args, config);
  const prompt = [
    "Extract all visible text from this image.",
    "Preserve reading order, line breaks, headings, labels, tables, and button text when possible.",
    "If a text fragment is unclear, mark it as [unclear].",
    "Return Markdown.",
  ].join(" ");
  return runVisionCall({ config, toolName: "vision_ocr_image", image, prompt, maxTokens: args.max_tokens });
}

async function markdownTool(args, config) {
  const image = await readImageInput(args, config);
  const prompt = [
    "Convert this image into a Markdown fact sheet for a text-only language model.",
    "Only include visible information.",
    "Use sections: Overview, Layout, Objects, Text/OCR, Tables or Charts, Relationships, Uncertainties, Downstream Summary.",
    "Preserve factual detail and avoid speculation.",
  ].join(" ");
  return runVisionCall({ config, toolName: "vision_image_to_markdown", image, prompt, maxTokens: args.max_tokens });
}

async function regionTool(args, config) {
  const image = await readImageInput(args, config);
  const question = args.question || "Describe the specified region.";
  const prompt = [
    `Focus on the image region with bbox [x, y, width, height] = [${args.bbox.join(", ")}].`,
    "Use the full image only as context.",
    "If the specified region is too small or unclear, say so.",
    `Question: ${question}`,
  ].join("\n");
  return runVisionCall({ config, toolName: "vision_analyze_region", image, prompt, maxTokens: args.max_tokens });
}

function normalizeAttachmentReference(args = {}) {
  const input = { ...args };
  if (!input.attachment_index) {
    const inferred = inferAttachmentIndex([
      input.task,
      input.reference,
      input.prompt,
      input.question,
      input.attachment_name,
      input.attachment_hint,
    ].filter(Boolean).join(" "));
    if (inferred) input.attachment_index = inferred;
  }
  return input;
}

function inferAttachmentIndex(text) {
  const value = String(text || "").toLowerCase();
  if (!value) return null;

  const numbered = value.match(/(?:图|圖片|图片|image|img|picture|photo|screenshot|fig(?:ure)?\.?)\s*#?\s*([1-9])/i);
  if (numbered) return Number(numbered[1]);

  const chineseNumbered = value.match(/(?:图|圖片|图片)\s*([一二三四五六七八九])/);
  if (chineseNumbered) return normalizeIndexToken(chineseNumbered[1]);

  const ordinal = value.match(/(?:第|no\.?\s*|number\s*)([1-9一二三四五六七八九])\s*(?:张|張|幅|个|個|image|img|picture|photo|screenshot|fig(?:ure)?\.?)/i);
  if (ordinal) return normalizeIndexToken(ordinal[1]);

  const words = [
    [/第二|二号|二號|second\s+(?:image|img|picture|photo|screenshot|one)/i, 2],
    [/第三|三号|三號|third\s+(?:image|img|picture|photo|screenshot|one)/i, 3],
    [/第四|四号|四號|fourth\s+(?:image|img|picture|photo|screenshot|one)/i, 4],
    [/第五|五号|五號|fifth\s+(?:image|img|picture|photo|screenshot|one)/i, 5],
    [/第六|六号|六號|sixth\s+(?:image|img|picture|photo|screenshot|one)/i, 6],
    [/第七|七号|七號|seventh\s+(?:image|img|picture|photo|screenshot|one)/i, 7],
    [/第八|八号|八號|eighth\s+(?:image|img|picture|photo|screenshot|one)/i, 8],
    [/第九|九号|九號|ninth\s+(?:image|img|picture|photo|screenshot|one)/i, 9],
  ];
  for (const [pattern, index] of words) {
    if (pattern.test(value)) return index;
  }

  return null;
}

function normalizeIndexToken(token) {
  const map = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  return map[token] || Number(token) || null;
}

function buildAttachmentPrompt(args = {}) {
  const task = String(args.task || args.question || args.prompt || "").trim();
  return [
    "Analyze the referenced uploaded or pasted image for a text-only language model.",
    "Follow the user's task if provided; otherwise describe the image faithfully in Chinese.",
    "Only state visible facts. If something is unclear or not visible, say so.",
    "Include OCR text, UI labels, layout, objects, relationships, tables/charts, and uncertainties when relevant.",
    task ? `User task: ${task}` : "User task: Describe the referenced image.",
  ].join("\n");
}

function buildScreenshotPrompt(args = {}) {
  const task = String(args.task || args.question || args.prompt || "").trim();
  const expected = String(args.expected || "").trim();
  return [
    "Analyze this browser, IDE, terminal, or app screenshot for a text-only coding agent.",
    "Focus on visible UI state, layout, clipping, overlap, alignment, text, error messages, empty/blank regions, and obvious visual regressions.",
    "Only state visible facts. If a problem cannot be determined from the screenshot, say so.",
    expected ? `Expected visual state or baseline: ${expected}` : "",
    task ? `User task: ${task}` : "User task: Review the screenshot and report actionable visual findings.",
  ].filter(Boolean).join("\n");
}

async function runVisionCall({ config, toolName, image, prompt, maxTokens }) {
  const started = Date.now();
  const sentImage = await prepareImageForVision(image, config);
  try {
    const result = await callVisionModel({ config, image: sentImage, prompt, maxTokens });
    appendAuditLog(config, {
      event: "vision_call",
      tool: toolName,
      success: true,
      durationMs: Date.now() - started,
      provider: providerSummary(config),
      originalImage: summarizeImage(image),
      image: summarizeImage(sentImage),
      prompt,
      result,
    });
    return result;
  } catch (err) {
    appendAuditLog(config, {
      event: "vision_call",
      tool: toolName,
      success: false,
      durationMs: Date.now() - started,
      provider: providerSummary(config),
      originalImage: summarizeImage(image),
      image: summarizeImage(sentImage),
      prompt,
      error: err.message,
    });
    throw err;
  }
}
