import { dataUrlFromImage } from "./image-store.js";
import { assertEndpointAllowed } from "./privacy.js";

export async function callVisionModel({ config, image, prompt, maxTokens }) {
  assertEndpointAllowed(config);
  if (config.provider.type === "anthropic-compatible") {
    return callAnthropicCompatible({ config, image, prompt, maxTokens });
  }
  return callOpenAICompatible({ config, image, prompt, maxTokens });
}

async function callOpenAICompatible({ config, image, prompt, maxTokens }) {
  const url = chatCompletionsUrl(config.provider.baseUrl);
  const body = JSON.stringify({
    model: config.provider.model,
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: image.url || dataUrlFromImage(image) } },
          { type: "text", text: prompt },
        ],
      },
    ],
    stream: false,
    max_tokens: maxTokens || config.limits.maxTokens,
  });

  const headers = {
    "Content-Type": "application/json",
  };
  if (config.provider.apiKey) headers.Authorization = `Bearer ${config.provider.apiKey}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.limits.requestTimeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw providerHttpError(response.status, text, config);
    }
    try {
      const json = JSON.parse(text);
      return json?.choices?.[0]?.message?.content ?? text;
    } catch {
      return text;
    }
  } catch (err) {
    throw normalizeVisionError(err, config);
  } finally {
    clearTimeout(timer);
  }
}

async function callAnthropicCompatible({ config, image, prompt, maxTokens }) {
  const url = messagesUrl(config.provider.baseUrl);
  const body = JSON.stringify({
    model: config.provider.model,
    max_tokens: maxTokens || config.limits.maxTokens,
    messages: [
      {
        role: "user",
        content: [
          anthropicImageBlock(image),
          { type: "text", text: prompt },
        ],
      },
    ],
  });

  const headers = {
    "Content-Type": "application/json",
    "anthropic-version": config.provider.anthropicVersion || "2023-06-01",
  };
  if (config.provider.apiKey) headers["x-api-key"] = config.provider.apiKey;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.limits.requestTimeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw providerHttpError(response.status, text, config);
    }
    try {
      const json = JSON.parse(text);
      if (Array.isArray(json?.content)) {
        const textBlocks = json.content
          .filter((block) => block?.type === "text" && typeof block.text === "string")
          .map((block) => block.text);
        if (textBlocks.length) return textBlocks.join("\n");
      }
      return json?.completion ?? text;
    } catch {
      return text;
    }
  } catch (err) {
    throw normalizeVisionError(err, config);
  } finally {
    clearTimeout(timer);
  }
}

function anthropicImageBlock(image) {
  if (image.url) {
    return {
      type: "image",
      source: {
        type: "url",
        url: image.url,
      },
    };
  }
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: image.mime,
      data: image.buffer.toString("base64"),
    },
  };
}

function normalizeVisionError(err, config) {
  if (err?.name === "AbortError") {
    const seconds = Math.round((config.limits.requestTimeoutMs || 0) / 1000);
    return new Error([
      `Vision provider timed out after ${seconds}s.`,
      "The request reached the provider, but the model did not return in time.",
      "For local VL models, reduce image size, enable image preprocessing, lower max_tokens, or restart/stop the stuck LM Studio job.",
    ].join(" "));
  }
  return err;
}

function providerHttpError(status, text, config) {
  const snippet = text.slice(0, 800);
  const activeProfile = config.activeProfile || "default";
  const quotaHint = isQuotaLikeError(status, text)
    ? ` Active profile "${activeProfile}" may be out of quota or rate limited. Use vision_list_profiles, then vision_switch_profile to switch to another plan/model.`
    : "";
  return new Error(`Vision provider HTTP ${status}: ${snippet}${quotaHint}`);
}

function isQuotaLikeError(status, text) {
  return (
    status === 429 ||
    /quota|rate.?limit|insufficient|balance|billing|exceeded|tokens/i.test(text)
  );
}

function chatCompletionsUrl(baseUrl) {
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) return trimmed;
  return `${trimmed}/chat/completions`;
}

function messagesUrl(baseUrl) {
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (trimmed.endsWith("/v1/messages")) return trimmed;
  if (trimmed.endsWith("/messages")) return trimmed;
  if (trimmed.endsWith("/v1")) return `${trimmed}/messages`;
  return `${trimmed}/v1/messages`;
}
