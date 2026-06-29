# Reasonix Auto Vision Rule

Use this rule in Reasonix when the active model is text-only and image understanding should be handled by `mcp-vision-bridge`.

## Current Reasonix Config Location

Reasonix currently reads the global MCP plugin list from:

```text
%APPDATA%\reasonix\config.toml
```

The relevant section should use `[[plugins]]`:

```toml
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
```

If Windows cannot resolve the npm command, use the npm shim path:

```toml
[[plugins]]
name = "vision-bridge"
type = "stdio"
command = "C:\\Users\\YOUR_NAME\\AppData\\Roaming\\npm\\mcp-vision-bridge.cmd"
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
```

## Automatic Routing

When the active host model is text-only and the user uploads, pastes, or mentions an image, call the MCP tool before answering. Do not wait for the user to say "call MCP".

Image references include:

- `上图`
- `参考图`
- `图1`
- `图2`
- `截图`
- `附件图片`
- `图片`
- `screenshot`
- `attached image`
- `the image above`
- local image paths
- image URLs

For uploaded or pasted images with no visible path, call:

```text
mcp__vision-bridge__vision_analyze_attachment
```

Put the user's original image request in `task`.

If the attachment chip shows any visible file name, dimensions, or path fragment, pass all visible chip text as `attachment_hint`. If the user says `图2` or `image 2`, pass `attachment_index: 2`.

If the first attachment call cannot locate the image, retry once with `use_clipboard: true` on Windows. If multiple candidates are possible, call:

```text
mcp__vision-bridge__vision_list_recent_images
```

Then call `mcp__vision-bridge__vision_analyze_attachment` with the chosen `attachment_index`.

For screenshots created by browser automation, Playwright, webapp-testing, terminal capture, or Reasonix tooling, save the screenshot to a known local path and immediately call:

```text
mcp__vision-bridge__vision_analyze_screenshot
```

Pass the screenshot path as `image_path` and the visual review goal in `task`.

## Provider 400 Avoidance

If the active Reasonix model is text-only, do not send image blocks directly to that model. Some text-only OpenAI-compatible providers return errors such as:

```text
unknown variant image_url, expected text
```

In that situation, route the image through `mcp-vision-bridge` instead, using attachment discovery, clipboard fallback, a local path, or an image URL.

Also make sure text-only host models are not listed in Reasonix provider `vision_models`. For example, do not mark DeepSeek, GLM text-only, Kimi text-only, or other non-vision coding models as `vision_models`; otherwise Reasonix may send uploaded images directly to the host model before MCP tools can run. Keep `vision_models` only for models that natively accept image input, such as a confirmed vision-capable MiMo/Qwen/GLM-VL endpoint.

## Multimodal Host Models

If the active Reasonix model can natively see uploaded images, disable MCP vision before the image task:

```bash
mvb 3
```

or:

```bash
mcp-vision-bridge-vision off
```

If any MCP vision tool returns `status: "vision_disabled"`, stop calling MCP vision tools for that image and use the host model's native vision ability. Do not re-enable MCP from inside the conversation.

When switching back to a text-only model, the user can run:

```bash
mvb 2
```
