# MCP Vision Bridge Usage

This workspace assumes a text-only host model. Use `mcp-vision-bridge` as the default, automatic vision layer.

When an image needs to be analyzed in this workspace, call the MCP server tools from `vision-bridge` before answering. Do not ask the user to request MCP explicitly.

Preferred tools:
- `vision_analyze_screenshot`
- `vision_analyze_attachment`
- `vision_describe_image`
- `vision_ask_image`
- `vision_ocr_image`
- `vision_image_to_markdown`
- `vision_list_recent_images`
- `vision_register_image`

Do not use a `claude-vision` skill or a `vision.js` script for image recognition in this project. The `claude-vision-mcp` name is only a compatibility command alias for the MCP server, not a skill workflow.

Use MCP whenever the user refers to an image with ordinary language such as "上图", "参考图", "图1", "图2", "screenshot", "attached image", or "the image above". Prefer `vision_analyze_attachment` with the user's request in `task`; call it with no image path when the attachment path is not visible.

For single-modal workflows that use Playwright/webapp-testing screenshots, save the screenshot to an explicit local path and immediately call `vision_analyze_screenshot` with `image_path` and the visual review goal in `task` whenever the task asks for screenshot comparison, visual verification, UI polish review, or final visual QA. Do not ask the user to locate the screenshot path.

If multiple recent attachments may match, call `vision_list_recent_images` first, then pass the selected `attachment_index` to the appropriate `vision_*` tool.
