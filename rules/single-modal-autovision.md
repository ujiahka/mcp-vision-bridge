# Single-modal Auto Vision Rule

Use this rule when the active chat model is text-only and image understanding must be handled by `mcp-vision-bridge`.

## Default Behavior

Do not ask the user to call the vision MCP server. Do not ask for an image path unless automatic discovery fails. Whenever the conversation contains an image-related input or task, call the `vision-bridge` MCP tools first, then answer normally from the vision result.

Use `mcp-vision-bridge` directly for image recognition. `claude-vision-mcp` is only a compatibility command alias for this MCP server.

If the current host model can natively see uploaded image attachments, disable this bridge with `mcp-vision-bridge-vision off` or `vision_set_enabled` with `enabled: false`, then answer from the host model's native multimodal ability. Do not call `vision_set_enabled` with `enabled: true`. Only the user should re-enable MCP vision by running `mcp-vision-bridge-vision on` in a terminal when switching back to a text-only host model.

Image-related inputs include:

- uploaded or pasted image attachments
- phrases such as "上图", "参考图", "图1", "图2", "screenshot", "attached image", "the image above"
- local image paths
- image URLs
- screenshots produced by Playwright, webapp-testing, browser automation, IDE automation, or terminal capture
- UI visual review, screenshot comparison, final visual QA, OCR, chart/table extraction, page-to-Markdown, or document-image understanding tasks

## Tool Routing

- Uploaded/pasted image with no visible path: call `vision_analyze_attachment` with the user request in `task`.
- If `vision_status` or any vision tool returns `status: "vision_disabled"`, stop calling MCP vision tools for that image and use the host model's native multimodal image ability if available. Do not try to re-enable MCP vision from inside the conversation.
- If the attachment chip shows visible metadata such as `image.png`, `2911x1440`, `2911×1440`, or a path fragment like `\temp\readonly\mcp_vision...`, copy all visible chip text into `attachment_hint`. Do this even when the path is truncated.
- In Claude Code CLI or the Claude Code VSCode extension, `vision_analyze_attachment` can recover recent local image blocks from Claude Code session files even when no absolute path is visible.
- On Windows pasted-image workflows, if attachment discovery returns zero file candidates, call `vision_analyze_attachment` again with `use_clipboard: true`; the server may use the current local clipboard image as a fallback.
- Explicit image path or URL: pass `image_path` or `image_url` to the most relevant `vision_*` tool.
- Screenshot saved by Playwright/webapp-testing: call `vision_analyze_screenshot` immediately with `image_path` and the visual review goal in `task`.
- OCR request: call `vision_ocr_image`.
- Document, table, chart, UI screenshot, or image-to-context task: call `vision_image_to_markdown`.
- Specific question about an image: call `vision_ask_image`.
- Repeated multi-turn analysis of the same image: call `vision_register_image` once, then reuse `image_id`.
- Multiple possible attachments: call `vision_list_recent_images`, choose the best candidate, then call the relevant analysis tool with `attachment_index`.
- If `vision_list_recent_images` returns `status: "ready_for_analysis"` or any candidate with `autoSelectable: true`, immediately call `vision_analyze_attachment` with that `attachment_index` and the user's original image task. The list result is only discovery metadata; it is not an image description.

## Response Style

After the MCP tool returns, answer naturally. Do not expose tool plumbing unless it helps debugging. If the vision result is uncertain, say what is uncertain and what can be confirmed from the image.
