# Single-modal Auto Vision Rule

Use this rule when the active chat model is text-only and image understanding must be handled by `mcp-vision-bridge`.

## Default Behavior

Do not ask the user to call the vision MCP server. Do not ask for an image path unless automatic discovery fails. Whenever the conversation contains an image-related input or task, call the `vision-bridge` MCP tools first, then answer normally from the vision result.

Image-related inputs include:

- uploaded or pasted image attachments
- phrases such as "上图", "参考图", "图1", "图2", "screenshot", "attached image", "the image above"
- local image paths
- image URLs
- screenshots produced by Playwright, webapp-testing, browser automation, IDE automation, or terminal capture
- UI visual review, screenshot comparison, final visual QA, OCR, chart/table extraction, page-to-Markdown, or document-image understanding tasks

## Tool Routing

- Uploaded/pasted image with no visible path: call `vision_analyze_attachment` with the user request in `task`.
- If the attachment chip shows visible metadata such as `image.png`, `2911x1440`, `2911×1440`, or a path fragment like `\temp\readonly\mcp_vision...`, copy all visible chip text into `attachment_hint`. Do this even when the path is truncated.
- Explicit image path or URL: pass `image_path` or `image_url` to the most relevant `vision_*` tool.
- Screenshot saved by Playwright/webapp-testing: call `vision_analyze_screenshot` immediately with `image_path` and the visual review goal in `task`.
- OCR request: call `vision_ocr_image`.
- Document, table, chart, UI screenshot, or image-to-context task: call `vision_image_to_markdown`.
- Specific question about an image: call `vision_ask_image`.
- Repeated multi-turn analysis of the same image: call `vision_register_image` once, then reuse `image_id`.
- Multiple possible attachments: call `vision_list_recent_images`, choose the best candidate, then call the relevant analysis tool with `attachment_index`.

## Response Style

After the MCP tool returns, answer naturally. Do not expose tool plumbing unless it helps debugging. If the vision result is uncertain, say what is uncertain and what can be confirmed from the image.
