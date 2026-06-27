# MCP Vision Bridge

Add image understanding to text-only coding agents through MCP.

`mcp-vision-bridge` exposes vision tools to clients such as Claude Code, Trae, Codex, and other MCP-compatible terminals or plugins. It can call a local OpenAI-compatible vision model, or a user-configured provider, while keeping configuration and image cache on the user's machine.

Package and command names:

```text
Primary:      mcp-vision-bridge
Claude alias: claude-vision-mcp
```

## Privacy Defaults

- No telemetry.
- No bundled cloud service.
- No hidden third-party upload.
- Images are stored only in the configured local data directory when registered.
- Recognition logs are written only to the configured local log directory when enabled.
- Image bytes are sent only to the configured vision model endpoint when a vision tool is called.
- Public internet model endpoints require explicit opt-in during `mcp-vision-bridge-init`.
- Image URL fetching is disabled unless explicitly enabled during init.

For the strictest setup, choose a local or LAN endpoint such as `http://127.0.0.1:1234/v1` or `http://192.168.1.10:1234/v1`.

## Quick Start

From source:

```bash
npm install
npm run init
npm run doctor
npm start
```

After a global install, use:

```bash
mcp-vision-bridge-init
mcp-vision-bridge-doctor
```

Claude-oriented aliases are also available:

```bash
claude-vision-mcp-init
claude-vision-mcp-doctor
```

The init command asks for:

- setup language: Chinese or English
- every later prompt accepts `b` / `back` / `返回` to return to the previous step
- vision source: API subscription first, or local/LAN model URL
- recommended API plan, including Alibaba Bailian Coding Plan, Xiaomi MiMo Token Plan, Volcengine Agent Plan, and Volcengine Coding Plan
- API compatibility format: OpenAI-compatible or Anthropic-compatible
- model name
- OpenAI-compatible base URL
- API key or local placeholder
- optional additional model/plan profiles for later switching
- whether public endpoints are allowed
- whether image URL fetching is allowed
- local data directory
- whether local recognition logs should be enabled
- whether to register `vision-bridge` into Claude Code user MCP automatically

By default, images are preprocessed locally only when the configured provider is a local/LAN endpoint:

- long side is limited to `1280px`
- non-JPEG images are converted to JPEG at quality `85`
- remote API subscription providers receive the original image unless `VISION_IMAGE_PREPROCESS_MODE=always`
- original image bytes are never logged
- logs include both original image metadata and the actual sent image metadata

This is especially useful for local GPU setups such as RTX 3070, where very large screenshots can appear to hang during the model's prompt-processing stage.

Example local model configuration:

```text
model: qwen/qwen3-vl-8b
base_url: http://192.168.1.10:1234/v1
api_key: local
```

Example API subscription flow:

```text
1) Choose setup language
2) Choose API subscription / cloud provider
3) Pick a recommended plan or custom API
4) Enter provider URL, model id, and API key
5) Confirm remote endpoint usage
```

Recommended plan defaults are included for the common providers above, and you can override them with a local provider catalog.

Copy `provider-catalog.example.json` to your local config directory and fill in URLs:

```text
<configDir>/provider-catalog.json
```

Or point to a catalog file:

```bash
VISION_PROVIDER_CATALOG=C:/path/provider-catalog.json
```

## MCP Client Configuration

For Claude Code, the init command can register the MCP server automatically. After global install:

```bash
mcp-vision-bridge-init
```

Accept the Claude Code registration prompt, then restart Claude Code or run `/mcp`. You should see:

```text
vision-bridge  Connected
```

Manual Claude Code registration:

```bash
claude mcp add --scope user vision-bridge -- mcp-vision-bridge
```

On Windows, if command resolution is unreliable, use the npm shim path:

```powershell
claude mcp add --scope user vision-bridge -- "$env:APPDATA\npm\mcp-vision-bridge.cmd"
```

Use the server over stdio:

```json
{
  "mcpServers": {
    "vision-bridge": {
      "command": "mcp-vision-bridge",
      "args": []
    }
  }
}
```

Exact config file locations differ by client. The server itself is client-agnostic.

## Single-modal Auto Vision

For text-only models, the recommended setup is to install `mcp-vision-bridge` as the default vision layer and add the auto-vision rule to the client or project instructions. Users should not need to say "call MCP"; normal phrases such as `上图`, `参考图`, `图1`, `图2`, `screenshot`, or an image URL should route through the MCP tools before the final answer.

The full rule is provided in:

```text
rules/single-modal-autovision.md
```

Clients that support MCP Prompts can fetch it from:

```text
single-modal-autovision
```

Minimal rule:

```text
When using a text-only model, call mcp-vision-bridge automatically for uploaded/pasted images, image URLs, local image paths, OCR requests, screenshot comparison, and visual QA. Use vision_analyze_attachment for attachments without paths and vision_analyze_screenshot immediately after Playwright/webapp-testing saves a screenshot. Answer from the vision result without asking the user to call MCP.
```

## Tools

- `vision_list_profiles`: list configured model/plan profiles.
- `vision_switch_profile`: switch the active model/plan profile and persist it to local config.
- `vision_analyze_attachment`: one-shot analysis for pasted/uploaded images referenced as `上图`, `参考图`, `图1`, `图2`, `screenshot`, or `attached image`.
- `vision_analyze_screenshot`: analyze a browser, IDE, terminal, or app screenshot saved by Playwright/webapp-testing.
- `vision_list_recent_images`: list recent local image attachments from temp directories when the user pasted/uploaded an image but the client did not provide a path.
- `vision_probe`: test whether the configured provider accepts image input.
- `vision_register_image`: store a local image, URL image, or base64 image in the local cache and return an `image_id`.
- `vision_describe_image`: describe an image faithfully.
- `vision_ask_image`: answer a specific question about an image.
- `vision_ocr_image`: extract visible text and preserve layout where possible.
- `vision_image_to_markdown`: convert a document, screenshot, chart, or photo to a Markdown fact sheet.
- `vision_analyze_region`: ask about a region using `[x, y, width, height]` coordinates.

Each tool accepts `image_id`, `image_path`, `image_url`, or `image_base64` where applicable. Vision tools also accept `attachment_name`, `attachment_hint`, and `attachment_index`; if no explicit image input is provided, the server can auto-discover the newest recent local attachment image from temp directories.

For providers such as MiMo2.5 that support public image URLs and Base64:

- `image_url` is passed directly to remote API providers by default.
- `image_url` is downloaded and converted to Base64 for local/LAN providers.
- `image_path`, `image_base64`, and auto-discovered local attachments are sent as Base64.
- Set `VISION_IMAGE_URL_TRANSPORT=fetch` to force MCP-side download, or `VISION_IMAGE_URL_TRANSPORT=direct` to always pass URLs directly.

## Attachment Auto-discovery

MCP servers cannot force a host model to call a tool by themselves. For near-seamless use, add a project or client rule like this:

```text
If the current model can natively see uploaded image attachments, answer directly and do not call MCP.
If the current model is text-only, or the image is only shown as an attachment chip, call vision_analyze_attachment when the user says 上图, 参考图, 图1, 图2, screenshot, attached image, or the image above.
Call it with no image path if the client did not expose the path; pass attachment_index for 图2/image 2.
```

With that rule, normal user prompts can be short:

```text
参考图帮我改这个页面
上图报错是什么
图2里按钮文字是什么
```

For single-modal webapp testing, add this rule:

```text
When Playwright/webapp-testing saves a screenshot for visual verification, screenshot comparison, UI polish review, or final visual QA, immediately call vision_analyze_screenshot with image_path set to the saved screenshot path and task set to the visual review goal.
Do not ask the user to locate the screenshot path.
```

Example MCP call after a Playwright screenshot:

```json
{
  "image_path": "C:/path/to/project/outputs/final-ui.png",
  "task": "Check whether the page is visually polished, readable, non-blank, and free of obvious layout overlap."
}
```

Some IDEs show an uploaded image in chat but do not pass its absolute path to the model. In that case, ask the MCP tool to discover recent images:

```json
{
  "attachment_hint": "image.png 2911x1440"
}
```

Or list candidates first:

```json
{
  "max_results": 5
}
```

The server only scans local temp directories, configured attachment directories, and `temp/tmp` under the current working directory. It does not scan the whole disk.

## Multi-turn Vision

Register an image once:

```json
{
  "image_path": "C:/Users/me/Desktop/screenshot.png"
}
```

Then ask repeated questions:

```json
{
  "image_id": "img_...",
  "question": "What does the top-right warning say?"
}
```

## Switching Models Or Plans

If an API subscription runs out of quota, ask the agent to call:

```json
{}
```

with `vision_list_profiles`, then switch:

```json
{
  "profile": "backup-local"
}
```

with `vision_switch_profile`. The active profile is saved back to the local config so the next tool call uses the new provider.

## Environment Overrides

These values override the local config file:

```bash
VISION_MCP_CONFIG=C:/path/config.json
VISION_PROVIDER_CATALOG=C:/path/provider-catalog.json
VISION_MCP_DATA_DIR=C:/path/data
VISION_MCP_LOG_DIR=C:/path/logs
VISION_MCP_LOGGING=true
VISION_BASE_URL=http://192.168.1.10:1234/v1
VISION_MODEL=qwen/qwen3-vl-8b
VISION_API_KEY=local
VISION_MAX_TOKENS=2048
VISION_REQUEST_TIMEOUT_MS=120000
VISION_IMAGE_PREPROCESS=true
VISION_IMAGE_PREPROCESS_MODE=local-only
VISION_IMAGE_URL_TRANSPORT=remote-direct
VISION_IMAGE_MAX_DIMENSION=1280
VISION_IMAGE_JPEG_QUALITY=85
VISION_ATTACHMENTS_AUTO_DISCOVER=true
VISION_ATTACHMENT_DIRS=C:/extra/attachment/dir
VISION_ATTACHMENT_MAX_AGE_MINUTES=60
```

## Provider Compatibility

`provider.type` supports:

```text
openai-compatible      POST <baseUrl>/chat/completions
anthropic-compatible   POST <baseUrl>/v1/messages
```

OpenAI-compatible providers receive images as `image_url` data URLs. Anthropic-compatible providers receive images as base64 `source` blocks with `x-api-key` and `anthropic-version` headers.

## Security Notes

If you choose a remote provider, image bytes must be sent to that provider for inference. This project does not send data anywhere else. Keep `allowRemoteEndpoint` disabled if you want strictly local/LAN-only operation.

## Troubleshooting Logs

When enabled, each recognition call appends one JSON line to:

```text
<dataDir>/logs/vision-YYYY-MM-DD.jsonl
```

The log records tool name, provider metadata, image MIME/size/SHA-256, image source, prompt, duration, result, or error. It never records API keys and never stores raw base64 in the log. Full recognition results can be disabled during init or by editing the local config.

If an IDE shows `MCP error -32000: This operation was aborted`, check the newest JSONL log entry:

- `success: false` with `durationMs` close to `requestTimeoutMs` means the provider accepted the request but did not return in time.
- For local LM Studio / llama.cpp VL models, stop the stuck job or restart the model, then retry with a smaller image.
- Lower `VISION_IMAGE_MAX_DIMENSION` to `768` or `1024` on smaller GPUs if large screenshots still stall.
- Use `vision_probe` first to confirm that the configured endpoint supports image input.
- For quota, balance, or rate-limit errors, use `vision_list_profiles` and `vision_switch_profile` to move to another configured plan/model.



