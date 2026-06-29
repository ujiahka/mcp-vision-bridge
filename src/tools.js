import { readImageInput, registerImage } from "./image-store.js";
import { prepareImageForVision } from "./image-preprocess.js";
import { callVisionModel } from "./vision-client.js";
import { appendAuditLog, providerSummary, summarizeImage } from "./audit-log.js";
import { listRecentAttachmentImages } from "./attachment-discovery.js";
import { isVisionEnabled, listProfiles, saveConfig, setVisionEnabled, switchActiveProfile } from "./config.js";

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
  use_clipboard: { type: "boolean", description: "Windows fallback: read the current local clipboard image if the client did not expose an attachment file. Default is automatic." },
};

const CONTROL_TOOL_NAMES = new Set([
  "vision_status",
  "vision_set_enabled",
  "vision_list_profiles",
  "vision_switch_profile",
]);

const LOCAL_READ_ONLY_ANNOTATION = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const VISION_READ_ANNOTATION = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

const LOCAL_MUTATION_ANNOTATION = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};

const TOOL_ANNOTATIONS = {
  vision_status: LOCAL_READ_ONLY_ANNOTATION,
  vision_list_profiles: LOCAL_READ_ONLY_ANNOTATION,
  vision_list_recent_images: LOCAL_READ_ONLY_ANNOTATION,
  vision_set_enabled: LOCAL_MUTATION_ANNOTATION,
  vision_switch_profile: LOCAL_MUTATION_ANNOTATION,
  vision_register_image: LOCAL_MUTATION_ANNOTATION,
  vision_probe: VISION_READ_ANNOTATION,
  vision_analyze_attachment: VISION_READ_ANNOTATION,
  vision_analyze_screenshot: VISION_READ_ANNOTATION,
  vision_describe_image: VISION_READ_ANNOTATION,
  vision_ask_image: VISION_READ_ANNOTATION,
  vision_ocr_image: VISION_READ_ANNOTATION,
  vision_image_to_markdown: VISION_READ_ANNOTATION,
  vision_analyze_region: VISION_READ_ANNOTATION,
};

export function listTools() {
  return [
    {
      name: "vision_status",
      description: "Show whether mcp-vision-bridge image recognition is enabled. If disabled, use the host model's native multimodal image ability instead of MCP vision tools.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "vision_set_enabled",
      description: "Disable mcp-vision-bridge image recognition from inside MCP. This tool may set enabled=false when using a native multimodal host model. It cannot re-enable vision once disabled; the user must run mcp-vision-bridge-vision on from a terminal when switching back to a text-only host model.",
      inputSchema: {
        type: "object",
        properties: {
          enabled: { type: "boolean", description: "false disables MCP image recognition and lets native multimodal models handle images directly. true is rejected when MCP vision is currently disabled; use mcp-vision-bridge-vision on instead." },
        },
        required: ["enabled"],
      },
    },
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
      description: "One-shot image analysis for uploaded/pasted attachments when the user says common references such as 上图, 参考图, 图1, 图2, screenshot, attached image, or the image above. If the attachment chip shows a filename, dimensions, or path fragment, pass that visible text as attachment_hint. It can read Claude Code's local session image blocks, recent temp files, and Windows clipboard fallback. Use attachment_index for 图2/image 2. If the host model can natively inspect the image attachment, answer directly instead of calling this MCP tool.",
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
      description: "List recent local image attachments discovered from Claude Code local sessions, temp directories, and Windows clipboard fallback. This tool only lists candidates; it does not analyze image content. Use it when the user pasted/uploaded an image but did not provide an absolute path, especially if multiple images may match references like 图1/图2 or attached image. If the result contains an autoSelectable image, immediately call vision_analyze_attachment or the relevant vision tool with that attachment_index and the user's original image task.",
      inputSchema: {
        type: "object",
        properties: {
          attachment_name: IMAGE_INPUT_PROPERTIES.attachment_name,
          attachment_hint: IMAGE_INPUT_PROPERTIES.attachment_hint,
          use_clipboard: IMAGE_INPUT_PROPERTIES.use_clipboard,
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
  ].map(withAnnotations);
}

function withAnnotations(tool) {
  const annotations = TOOL_ANNOTATIONS[tool.name];
  return annotations ? { ...tool, annotations } : tool;
}

export async function callTool(name, args, config) {
  if (!CONTROL_TOOL_NAMES.has(name) && !isVisionEnabled(config)) {
    return disabledVisionTool(name, config);
  }

  switch (name) {
    case "vision_status":
      return statusTool(config);
    case "vision_set_enabled":
      return setEnabledTool(args, config);
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

function statusTool(config) {
  const envOverride = process.env.VISION_MCP_ENABLED;
  return JSON.stringify({
    status: isVisionEnabled(config) ? "vision_enabled" : "vision_disabled",
    enabled: isVisionEnabled(config),
    activeProfile: config.activeProfile || "default",
    provider: providerSummary(config),
    envOverride: envOverride === undefined ? null : {
      name: "VISION_MCP_ENABLED",
      value: envOverride,
    },
    commands: {
      enable: "mcp-vision-bridge-vision on",
      disable: "mcp-vision-bridge-vision off",
      status: "mcp-vision-bridge-vision status",
    },
    guidance: isVisionEnabled(config)
      ? "MCP vision is enabled. Use it for text-only host models."
      : "MCP vision is disabled. Use the host model's native multimodal image ability. Enable it again for text-only host models.",
  }, null, 2);
}

function setEnabledTool(args, config) {
  if (!("enabled" in (args || {}))) throw new Error("enabled is required.");

  const requested = parseEnabled(args.enabled);
  if (requested && !isVisionEnabled(config)) {
    return JSON.stringify({
      status: "vision_disabled",
      enabled: false,
      changed: false,
      requestedEnabled: true,
      message: "MCP vision is currently disabled and cannot be re-enabled by an MCP tool call. This prevents host models from overriding the user's manual multimodal/text-only switch. Run mcp-vision-bridge-vision on in a terminal to enable MCP vision again.",
      commands: {
        enable: "mcp-vision-bridge-vision on",
        status: "mcp-vision-bridge-vision status",
      },
    }, null, 2);
  }

  const next = setVisionEnabled(config, requested);
  replaceObject(config, next);
  const configPath = saveConfig(config);

  appendAuditLog(config, {
    event: "vision_enabled_switch",
    success: true,
    provider: providerSummary(config),
    result: {
      enabled: isVisionEnabled(config),
      configPath,
    },
  });

  return JSON.stringify({
    status: isVisionEnabled(config) ? "vision_enabled" : "vision_disabled",
    enabled: isVisionEnabled(config),
    changed: true,
    configPath,
    guidance: isVisionEnabled(config)
      ? "MCP vision is enabled for text-only host models."
      : "MCP vision is disabled. Use native multimodal image understanding in the host model.",
  }, null, 2);
}

function disabledVisionTool(toolName, config) {
  return JSON.stringify({
    status: "vision_disabled",
    enabled: false,
    tool: toolName,
    activeProfile: config.activeProfile || "default",
    provider: providerSummary(config),
    message: "mcp-vision-bridge image recognition is disabled. Do not use MCP vision for this image; use the host model's native multimodal ability. When switching back to a text-only model, the user must run mcp-vision-bridge-vision on in a terminal.",
    commands: {
      enable: "mcp-vision-bridge-vision on",
      status: "mcp-vision-bridge-vision status",
    },
  }, null, 2);
}

function parseEnabled(value) {
  if (typeof value === "boolean") return value;
  const normalized = String(value || "").trim().toLowerCase();
  if (["1", "true", "yes", "y", "on", "enable", "enabled"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off", "disable", "disabled"].includes(normalized)) return false;
  throw new Error("enabled must be a boolean or one of on/off/true/false.");
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
  const returnedImages = images.slice(0, maxResults).map((image, index) => ({
    attachment_index: index + 1,
    path: image.path,
    fileName: image.fileName,
    mime: image.mime,
    sourceKind: image.sourceKind,
    bytes: image.bytes,
    width: image.width,
    height: image.height,
    mtime: image.mtime,
    ageSeconds: image.ageSeconds,
    score: image.score,
    hintMatchScore: image.hintMatchScore,
    autoSelectable: image.autoSelectable,
    autoSelectReason: image.autoSelectReason,
  }));
  return JSON.stringify({
    count: images.length,
    returned: Math.min(images.length, maxResults),
    images: returnedImages,
    ...buildRecentImagesNextStep(returnedImages, args),
  }, null, 2);
}

function buildRecentImagesNextStep(images, args = {}) {
  if (!images.length) {
    return {
      status: "no_recent_images_found",
      nextAction: "No recent image candidates were found. If the user just pasted an image on Windows, retry vision_analyze_attachment with use_clipboard=true. Otherwise ask the user for a local path or image URL.",
    };
  }

  const selected = images.find((image) => image.autoSelectable) || null;
  if (!selected) {
    return {
      status: "needs_selection",
      nextAction: "This list result is only attachment discovery, not image analysis. Choose the candidate that matches the user's reference, then call vision_analyze_attachment with attachment_index and the user's original image task. Ask the user only if the candidates cannot be matched.",
    };
  }

  const recommendedArguments = {
    attachment_index: selected.attachment_index,
    task: "<copy the user's current image-analysis request here>",
  };
  if (args.attachment_hint) recommendedArguments.attachment_hint = args.attachment_hint;
  if (args.attachment_name) recommendedArguments.attachment_name = args.attachment_name;

  return {
    status: "ready_for_analysis",
    nextAction: `This list result is only attachment discovery, not image analysis. Immediately call vision_analyze_attachment with attachment_index=${selected.attachment_index} and the user's original image task.`,
    recommendedCall: {
      tool: "vision_analyze_attachment",
      arguments: recommendedArguments,
    },
  };
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
