# MCP Vision Bridge

`mcp-vision-bridge` is a privacy-first MCP server that adds image understanding to text-only AI coding agents. It can call a local vision model or a user-configured remote vision API, then return structured visual context to clients such as Claude Code, Trae, Codex, and other MCP-compatible tools.

`mcp-vision-bridge` 是一个隐私优先的 MCP 识图桥接服务器，用于给单模态编程模型补充图片理解能力。它可以调用本地视觉模型，也可以调用用户自行配置的远程视觉 API，并把图片理解结果返回给 Claude Code、Trae、Codex 等支持 MCP 的终端或插件客户端。

## Languages

- [中文文档](#中文文档)
- [English Documentation](#english-documentation)

---

# 中文文档

## 1. 项目定位

`mcp-vision-bridge` 解决的是一个很具体的问题：当你的主力模型是 DeepSeek、GLM、Kimi、Claude Code 插件里的文本模型，或者其他无法直接看图的单模态模型时，它可以通过 MCP 工具调用视觉模型，把图片内容转换成文本上下文，再交给主模型继续推理、写代码、排查 UI、读取截图或生成文档。

它不是一个云服务，也不绑定某一家模型供应商。用户可以选择：

- 本地或局域网视觉模型，例如 LM Studio / llama.cpp / vLLM / Ollama 网关里的 OpenAI-compatible VL 模型。
- 远程 API 订阅，例如阿里云百炼、小米 MiMo、火山引擎、OpenCode Go 或其他兼容 OpenAI / Anthropic 格式的服务。
- 多个模型配置档，并在额度不足或模型效果不合适时随时切换。

兼容命令名：

```text
主命令:      mcp-vision-bridge
兼容别名:    claude-vision-mcp
管理面板:    mvb
```

## 2. 核心特性

- 支持 OpenAI-compatible 和 Anthropic-compatible 两种接口格式。
- 支持本地模型、局域网模型和远程 API。
- 安装向导支持中文和英文；选择中文后，后续交互默认中文。
- 支持推荐 API Plan，也支持用户自定义 URL、模型 ID 和 Key。
- 配置、缓存、日志都保存在本机。
- 无遥测、无隐藏上传、无内置云端中转。
- 只有在 MCP 识图工具被调用时，图片才会发送给你配置的视觉模型 endpoint。
- 支持 Claude Code CLI / Claude Code VSCode 插件的本地 session 图片恢复。
- 支持 Windows 剪贴板图片兜底读取。
- 支持图片路径、图片 URL、Base64、附件自动发现和多轮图片注册。
- 支持全局识图开关，方便在多模态模型和单模态模型之间切换。
- 支持终端管理页 `mvb`，可查看当前模型、模型列表、识图开关和常用命令。

## 3. 隐私与数据边界

本项目默认坚持本地优先：

- 不启用遥测。
- 不提供或绑定任何内置云服务。
- 不会把数据发送到作者服务器。
- API Key 只保存在本地配置文件中。
- 注册过的图片只保存在本地数据目录。
- 识别日志只写入本地日志目录。
- 日志不会记录 API Key，也不会写入原始 Base64 图片数据。
- 远程 endpoint 必须在初始化时显式确认。
- image URL 抓取默认需要用户在初始化时允许。

图片什么时候会离开本机：

- 当你选择远程 API，并且模型或客户端调用了 `vision_*` 工具时，图片会发送到你配置的 provider。
- 如果你选择本地或局域网模型，例如 `http://127.0.0.1:1234/v1` 或 `http://192.168.1.10:1234/v1`，图片只会发送到该本地或局域网 endpoint。

附件自动发现的扫描范围有限：

- Claude Code 本地 session JSONL 文件。
- 系统临时目录和常见 readonly 附件目录。
- 用户配置的附件目录。
- 当前工作目录下的 `temp` / `tmp`。
- Windows 剪贴板图片兜底。

它不会扫描整块硬盘。

## 4. 环境要求

必需：

- Node.js `>= 20`
- npm
- 至少一个可用的视觉模型或视觉 API

可选：

- `sharp`：用于图片预处理。它是 optional dependency，安装失败时 MCP 仍可运行，但本地图片压缩和尺寸控制能力会降低。
- Claude Code CLI：如果需要自动注册到 Claude Code。

确认环境：

```bash
node -v
npm -v
```

## 5. 安装方式

### 5.1 从 npm 安装

发布到 npm 后，推荐普通用户使用：

```bash
npm install -g mcp-vision-bridge
mcp-vision-bridge-init
```

安装后可直接打开管理页：

```bash
mvb
```

### 5.2 从 GitHub 源码安装

```bash
git clone https://github.com/ujiahka/mcp-vision-bridge.git
cd mcp-vision-bridge
npm install
npm install -g .
mcp-vision-bridge-init
```

### 5.3 从 Gitee 源码安装

```bash
git clone https://gitee.com/pythonmengxin/mcp-vision-bridge.git
cd mcp-vision-bridge
npm install
npm install -g .
mcp-vision-bridge-init
```

### 5.4 本地开发运行

```bash
npm install
npm run init
npm run doctor
npm start
```

### 5.5 更新

源码安装的更新流程：

```bash
git pull
npm install
npm install -g .
mcp-vision-bridge-doctor
```

如果是 npm 安装：

```bash
npm install -g mcp-vision-bridge@latest
mcp-vision-bridge-doctor
```

## 6. 初始化配置

首次安装后运行：

```bash
mcp-vision-bridge-init
```

初始化向导会询问：

1. 安装语言：中文或 English。
2. 视觉模型来源：API 订阅或本地 / 局域网模型 URL。
3. 推荐 API Plan 或自定义 API。
4. 接口格式：OpenAI-compatible 或 Anthropic-compatible。
5. 模型 ID。
6. Base URL。
7. API Key。本地模型可留空或使用 `local`。
8. 是否继续添加其他模型配置档。
9. 是否允许远程 endpoint。
10. 是否允许 MCP 抓取 image URL。
11. 本地数据目录。
12. 是否开启本地识别日志。
13. 是否自动注册到 Claude Code 用户级 MCP。

向导支持返回上一步：

```text
b
back
返回
```

## 7. 推荐 Provider 默认值

初始化向导内置了常见推荐项。用户可以选择后再覆盖 URL、模型或 Key。

| Provider | Plan | Format | Base URL | Default model |
| --- | --- | --- | --- | --- |
| 阿里云百炼 | Bailian | OpenAI-compatible | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen3.5-omni-plus` |
| 小米 MiMo | Token Plan | OpenAI-compatible | `https://token-plan-cn.xiaomimimo.com/v1` | `mimo-v2.5` |
| 小米 MiMo | Token Plan | Anthropic-compatible | `https://token-plan-cn.xiaomimimo.com/anthropic` | `mimo-v2.5` |
| 火山引擎 | Agent Plan | OpenAI-compatible | `https://ark.cn-beijing.volces.com/api/plan/v3` | `mimo-v2.5` |
| 火山引擎 | Agent Plan | Anthropic-compatible | `https://ark.cn-beijing.volces.com/api/plan` | `mimo-v2.5` |
| 火山引擎 | Coding Plan | OpenAI-compatible | `https://ark.cn-beijing.volces.com/api/coding/v3` | `mimo-v2.5` |
| 火山引擎 | Coding Plan | Anthropic-compatible | `https://ark.cn-beijing.volces.com/api/coding` | `mimo-v2.5` |
| OpenCode Go | Go | OpenAI-compatible | `https://opencode.ai/zen/go` | `mimo-v2.5` |

本地模型示例：

```text
model: qwen/qwen3-vl-8b
base_url: http://192.168.1.10:1234/v1
api_key: local
format: openai-compatible
```

## 8. MCP 客户端接入

### 8.1 Claude Code 自动注册

初始化向导会询问是否自动注册到 Claude Code。选择确认后，重启 Claude Code 或运行：

```text
/mcp
```

应该能看到：

```text
vision-bridge  Connected
```

### 8.2 Claude Code 手动注册

```bash
claude mcp add --scope user vision-bridge -- mcp-vision-bridge
```

Windows 下如果命令解析失败，可使用 npm shim：

```powershell
claude mcp add --scope user vision-bridge -- "$env:APPDATA\npm\mcp-vision-bridge.cmd"
```

查看注册状态：

```bash
claude mcp list
```

### 8.3 通用 MCP JSON

不同 IDE 或插件的配置文件位置不同，但 MCP server 配置通常类似：

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

如果客户端不识别命令，可改成 npm shim 的绝对路径，例如：

```json
{
  "mcpServers": {
    "vision-bridge": {
      "command": "C:\\Users\\YOUR_NAME\\AppData\\Roaming\\npm\\mcp-vision-bridge.cmd",
      "args": []
    }
  }
}
```

### 8.4 Reasonix 当前版本配置

Reasonix 当前版本的全局配置文件通常位于：

```text
%APPDATA%\reasonix\config.toml
```

在文件末尾添加或更新：

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

Windows 如果无法解析全局 npm 命令，可把 `command` 改为 npm shim 绝对路径：

```toml
command = "C:\\Users\\YOUR_NAME\\AppData\\Roaming\\npm\\mcp-vision-bridge.cmd"
```

更完整的 Reasonix 自动识图规则见：

```text
rules/reasonix-autovision.md
```

## 9. 终端管理页

安装后可以直接运行：

```bash
mvb
```

管理页会显示：

- 当前识图开关。
- 当前模型和当前配置档。
- Provider、Plan、接口格式和 endpoint。
- 模型列表。
- 快捷操作。
- 所有命令分组。

常用命令：

```bash
mvb 1          # 显示管理面板
mvb 2          # 开启 MCP 识图，适合单模态模型
mvb 3          # 关闭 MCP 识图，适合多模态模型
mvb 4          # 查看模型列表
mvb 5 2        # 切换到第 2 个模型配置档
mvb 5 <id>     # 按配置 ID 切换
mvb 6          # 运行 doctor 诊断
mvb 7          # 重新运行安装向导
mvb 8          # 查看配置、数据和日志路径
mvb 10         # 打印 MCP 客户端配置片段
```

长命令别名：

```bash
mcp-vision-bridge-ui
```

## 10. 单模态和多模态模型切换

如果宿主模型本身不能看图，请开启 MCP 识图：

```bash
mvb 2
```

或：

```bash
mcp-vision-bridge-vision on
```

如果宿主模型本身已经是多模态模型，请关闭 MCP 识图，让模型使用自身图片能力：

```bash
mvb 3
```

或：

```bash
mcp-vision-bridge-vision off
```

查看状态：

```bash
mcp-vision-bridge-vision status
```

当识图开关关闭时，MCP 图片工具会返回 `status: "vision_disabled"`，不会扫描附件，也不会调用视觉 provider。MCP 工具内部不能在关闭后重新开启识图，这是为了防止宿主模型覆盖用户的手动选择。重新开启必须由用户在终端运行 `mvb 2` 或 `mcp-vision-bridge-vision on`。

## 11. 让单模态模型无感调用识图

MCP server 不能强制宿主模型调用工具。要接近“无感识图”，需要在客户端或项目规则中加入自动识图指令。

项目提供完整规则：

```text
rules/single-modal-autovision.md
rules/reasonix-autovision.md
```

最小规则示例：

```text
当前宿主模型是单模态模型时，遇到上传图片、粘贴图片、图片 URL、本地图片路径、OCR、截图对比、UI 视觉检查或文档图片理解任务，先调用 mcp-vision-bridge 的 MCP 工具，再基于识图结果回答。附件没有路径时优先调用 vision_analyze_attachment；Playwright 或 webapp-testing 生成截图后立即调用 vision_analyze_screenshot。不要要求用户显式说“调用 MCP”。
```

常见用户提示词：

```text
参考图帮我改页面
上图报错是什么
图2里的按钮文字是什么
把这张截图转成 Markdown 文档
```

## 12. MCP 工具列表

主要工具：

- `vision_status`：查看 MCP 识图开关状态。
- `vision_set_enabled`：从 MCP 内关闭识图；关闭后不能从 MCP 内重新开启。
- `vision_list_profiles`：列出模型 / Plan 配置档。
- `vision_switch_profile`：切换当前模型 / Plan。
- `vision_analyze_attachment`：分析上传或粘贴的图片附件。
- `vision_analyze_screenshot`：分析自动化测试、浏览器、IDE 或终端截图。
- `vision_list_recent_images`：列出近期可发现的本地图片附件候选。
- `vision_probe`：测试当前 provider 是否支持图片输入。
- `vision_register_image`：注册图片并返回 `image_id`，用于多轮追问。
- `vision_describe_image`：忠实描述图片。
- `vision_ask_image`：针对图片提问。
- `vision_ocr_image`：提取可见文字。
- `vision_image_to_markdown`：把截图、图表、文档页转成 Markdown fact sheet。
- `vision_analyze_region`：聚焦图片区域进行分析。

图片输入支持：

- `image_path`
- `image_url`
- `image_base64`
- `image_id`
- `attachment_name`
- `attachment_hint`
- `attachment_index`
- `use_clipboard`

## 13. 附件自动发现

一些 IDE 会显示图片附件，但不会把绝对路径暴露给模型。此时可以使用：

```json
{
  "task": "请描述上图",
  "reference": "上图"
}
```

如果附件 chip 显示了文件名、尺寸或路径片段，应把这些信息传给 `attachment_hint`：

```json
{
  "attachment_hint": "image.png 2911x1440 \\temp\\readonly\\mcp_vision...",
  "task": "分析这张截图里的错误"
}
```

多个附件时先列出候选：

```json
{
  "max_results": 5
}
```

然后用返回的 `attachment_index` 分析指定图片。

## 14. 日志和排查文件

开启日志后，每次识图会追加一行 JSONL：

```text
<dataDir>/logs/vision-YYYY-MM-DD.jsonl
```

日志包含：

- 工具名。
- provider 摘要。
- 图片 MIME、大小、SHA-256。
- 图片来源。
- prompt。
- 耗时。
- 结果或错误。

日志不包含：

- API Key。
- 原始 Base64 图片。

查看路径：

```bash
mvb 8
```

或：

```bash
mcp-vision-bridge-doctor
```

## 15. 环境变量

环境变量会覆盖本地配置文件：

```bash
VISION_MCP_CONFIG=C:/path/config.json
VISION_PROVIDER_CATALOG=C:/path/provider-catalog.json
VISION_MCP_DATA_DIR=C:/path/data
VISION_MCP_LOG_DIR=C:/path/logs
VISION_MCP_LOGGING=true
VISION_MCP_ENABLED=true
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
VISION_ATTACHMENT_MAX_AUTO_SELECT_AGE_SECONDS=180
VISION_ATTACHMENT_CLAUDE_CODE_FALLBACK=true
VISION_ATTACHMENT_CLAUDE_CODE_DIRS=C:/Users/me/.claude/projects
VISION_ATTACHMENT_MAX_CLAUDE_CODE_AUTO_SELECT_AGE_SECONDS=600
VISION_ATTACHMENT_CLIPBOARD_FALLBACK=true
```

## 16. 常见问题处理

### 16.1 运行 `/mcp` 看不到 `vision-bridge`

处理步骤：

1. 确认命令存在：

```bash
where mcp-vision-bridge
where mvb
```

macOS / Linux：

```bash
command -v mcp-vision-bridge
command -v mvb
```

2. 重新注册 Claude Code：

```bash
claude mcp add --scope user vision-bridge -- mcp-vision-bridge
```

3. Windows 下使用 shim 绝对路径：

```powershell
claude mcp add --scope user vision-bridge -- "$env:APPDATA\npm\mcp-vision-bridge.cmd"
```

4. 重启 Claude Code 或 IDE 插件。

5. 运行诊断：

```bash
mcp-vision-bridge-doctor
```

### 16.2 ccswitch 或客户端显示旧名称

`claude-vision-mcp` 是兼容命令别名。推荐 MCP server 名称统一使用：

```text
vision-bridge
```

如果客户端缓存了旧配置，删除旧 MCP 条目后重新添加：

```bash
claude mcp add --scope user vision-bridge -- mcp-vision-bridge
```

### 16.3 图片调用报 400

常见原因：

- 选错接口格式，例如 OpenAI-compatible 和 Anthropic-compatible 不匹配。
- Base URL 填错。
- 模型 ID 填错。
- API Key 无效。
- 当前 provider 不接受图片输入。
- Anthropic-compatible provider 需要正确的 messages endpoint。

处理步骤：

1. 运行：

```bash
mcp-vision-bridge-doctor
```

2. 检查当前配置：

```bash
mvb
```

3. 切换接口格式或重新运行向导：

```bash
mvb 7
```

4. 使用 `vision_probe` 测试 provider 是否接受图片输入。

5. 查看最新日志：

```text
<dataDir>/logs/vision-YYYY-MM-DD.jsonl
```

如果在 Reasonix 或其他文本模型客户端中看到类似错误：

```text
unknown variant image_url, expected text
```

通常表示客户端把图片块直接发给了文本模型，而不是先通过 MCP 识图。处理方式：

1. 确认 Reasonix 的 `%APPDATA%\reasonix\config.toml` 使用 `[[plugins]]` 注册了 `vision-bridge`。
2. 把 `vision_analyze_attachment`、`vision_analyze_screenshot`、`vision_describe_image`、`vision_ask_image`、`vision_ocr_image`、`vision_image_to_markdown` 加入 `trusted_read_only_tools`。
3. 在 Reasonix 全局规则或项目规则中加入 `rules/reasonix-autovision.md` 的自动识图指令。
4. 对单模态模型，尽量让模型先调用 `mcp__vision-bridge__vision_analyze_attachment`，不要把图片块直接发送给主模型。
5. 如果客户端仍先把附件发给文本模型，请改用剪贴板、本地绝对路径或图片 URL 触发 MCP 识图。

### 16.4 一直转圈，进度不变

本地模型常见原因：

- 图片太大。
- 显存不足。
- LM Studio / llama.cpp 的当前 job 卡住。
- 上下文或图片 token 过多。

处理步骤：

1. 停止当前推理或重启本地模型服务。
2. 保持图片预处理开启。
3. 降低最大尺寸：

```bash
VISION_IMAGE_MAX_DIMENSION=768
```

或编辑配置里的：

```json
{
  "image": {
    "maxDimension": 768
  }
}
```

4. 必要时提高超时：

```bash
VISION_REQUEST_TIMEOUT_MS=180000
```

5. 对 8GB 显存显卡，建议先使用 `1024` 或 `768` 的图片长边限制。

### 16.5 一直识别到旧图片

常见原因：

- 客户端没有把新附件路径暴露给 MCP。
- 剪贴板里还是旧图。
- 自动发现候选里旧图分数更高。
- 用户没有传 `attachment_hint`。

处理步骤：

1. 先列候选：

```json
{
  "max_results": 10
}
```

2. 查看返回的 `ageSeconds`、`path`、`sourceKind`、`autoSelectReason`。
3. 使用正确的 `attachment_index` 再分析。
4. 上传图片后尽快调用，避免超过自动选择时间窗口。
5. 传入附件 chip 上可见的文件名、尺寸或路径片段。
6. 清空剪贴板或重新复制最新图片。
7. 必要时直接提供 `image_path`。

### 16.6 VSCode Claude Code 插件上传了附件但 MCP 找不到

处理步骤：

1. 确认 `attachments.claudeCodeFallback` 为开启状态。
2. 重启 VSCode 插件或 Claude Code session。
3. 上传图片后立即让模型分析，不要等待太久。
4. 如果附件 chip 显示尺寸或文件名，把它作为 `attachment_hint`。
5. Windows 可尝试 `use_clipboard: true`。
6. 仍失败时，提供本地图片绝对路径。

### 16.7 多模态模型也被 MCP 接管

关闭 MCP 识图：

```bash
mvb 3
```

或：

```bash
mcp-vision-bridge-vision off
```

切回单模态模型时重新开启：

```bash
mvb 2
```

### 16.8 API 额度用完或限流

先查看配置档：

```bash
mvb 4
```

切换到备用配置：

```bash
mvb 5 2
```

也可以让主模型调用：

```json
{}
```

使用 `vision_list_profiles`，再调用 `vision_switch_profile`。

### 16.9 命令找不到

处理步骤：

1. 确认全局安装：

```bash
npm install -g mcp-vision-bridge
```

或源码目录：

```bash
npm install -g .
```

2. 查看 npm 全局路径：

```bash
npm root -g
```

3. Windows 下确认：

```powershell
where mvb
where mcp-vision-bridge
```

4. 关闭并重新打开终端。

## 17. 卸载

卸载全局命令：

```bash
npm uninstall -g mcp-vision-bridge
```

如果同时安装过旧名称，也可以执行：

```bash
npm uninstall -g local-vision-mcp
```

删除 Claude Code MCP 注册项时，请使用 Claude Code 自身的 MCP 管理命令或手动删除对应配置项。

可选：删除本地配置和数据。

Windows 默认位置：

```text
%APPDATA%\mcp-vision-bridge
```

macOS 默认位置：

```text
~/Library/Application Support/mcp-vision-bridge
```

Linux 默认位置：

```text
~/.config/mcp-vision-bridge
```

删除配置会移除 API Key、日志、缓存和已注册图片。执行前请确认不再需要这些数据。

## 18. 开源协议

本项目使用 MIT License。详见 [LICENSE](LICENSE)。

---

# English Documentation

## 1. Purpose

`mcp-vision-bridge` gives text-only coding agents access to image understanding through MCP. It calls a configured vision model, converts image content into textual context, and returns that context to the host model for coding, UI debugging, OCR, screenshot review, chart/table extraction, or document-image understanding.

The project is provider-neutral. You can use:

- A local or LAN vision model exposed through an OpenAI-compatible endpoint.
- A remote API subscription that supports OpenAI-compatible or Anthropic-compatible image input.
- Multiple provider profiles, with quick switching when quota runs out or another model is better for the task.

Command names:

```text
Primary command:       mcp-vision-bridge
Compatibility alias:   claude-vision-mcp
Management console:    mvb
```

## 2. Features

- OpenAI-compatible and Anthropic-compatible provider support.
- Local, LAN, and remote API provider support.
- Chinese and English setup wizard.
- Recommended provider plans and fully custom endpoints.
- Local-only config, cache, and logs.
- No telemetry and no hidden upload path.
- Images are sent only to the configured vision endpoint when a vision tool is called.
- Claude Code CLI and Claude Code VSCode extension local session image recovery.
- Windows clipboard image fallback.
- Image path, image URL, Base64, attachment discovery, and multi-turn image registration.
- Manual global vision switch for text-only versus native multimodal host models.
- `mvb` terminal management console for status, model list, switching, diagnostics, and client snippets.

## 3. Privacy And Data Boundary

By default:

- No telemetry is enabled.
- No bundled cloud service is used.
- No data is sent to the project author.
- API keys are stored only in the local config file.
- Registered images are stored only in the local data directory.
- Recognition logs are written only to the local log directory.
- Logs never include API keys or raw Base64 image data.
- Public internet endpoints require explicit confirmation during setup.
- Image URL fetching requires explicit permission during setup.

Images leave your machine only when:

- You configure a remote provider and a `vision_*` tool is called.
- The configured endpoint itself is remote.

For strict local operation, use a local or LAN endpoint such as:

```text
http://127.0.0.1:1234/v1
http://192.168.1.10:1234/v1
```

Attachment discovery is limited to local Claude Code session files, temp attachment directories, user-configured attachment directories, `temp` / `tmp` under the current working directory, and Windows clipboard fallback. It does not scan the whole disk.

## 4. Requirements

Required:

- Node.js `>= 20`
- npm
- One usable vision model or vision API

Optional:

- `sharp` for local image preprocessing.
- Claude Code CLI for automatic Claude Code registration.

Check your environment:

```bash
node -v
npm -v
```

## 5. Installation

### 5.1 Install From npm

After the package is published:

```bash
npm install -g mcp-vision-bridge
mcp-vision-bridge-init
```

Open the management console:

```bash
mvb
```

### 5.2 Install From GitHub Source

```bash
git clone https://github.com/ujiahka/mcp-vision-bridge.git
cd mcp-vision-bridge
npm install
npm install -g .
mcp-vision-bridge-init
```

### 5.3 Install From Gitee Source

```bash
git clone https://gitee.com/pythonmengxin/mcp-vision-bridge.git
cd mcp-vision-bridge
npm install
npm install -g .
mcp-vision-bridge-init
```

### 5.4 Local Development

```bash
npm install
npm run init
npm run doctor
npm start
```

### 5.5 Update

Source install:

```bash
git pull
npm install
npm install -g .
mcp-vision-bridge-doctor
```

npm install:

```bash
npm install -g mcp-vision-bridge@latest
mcp-vision-bridge-doctor
```

## 6. Setup Wizard

Run:

```bash
mcp-vision-bridge-init
```

The wizard asks for:

1. Setup language.
2. Vision source: API subscription or local/LAN model URL.
3. Recommended API plan or custom API.
4. Compatibility format: OpenAI-compatible or Anthropic-compatible.
5. Model id.
6. Base URL.
7. API key. Local models can use `local` or leave it blank when accepted by the provider.
8. Optional additional model profiles.
9. Explicit remote endpoint permission.
10. Image URL fetch permission.
11. Local data directory.
12. Local recognition log settings.
13. Optional Claude Code user-level MCP registration.

Go back during setup with:

```text
b
back
返回
```

## 7. Provider Defaults

| Provider | Plan | Format | Base URL | Default model |
| --- | --- | --- | --- | --- |
| Alibaba Cloud Bailian | Bailian | OpenAI-compatible | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen3.5-omni-plus` |
| Xiaomi MiMo | Token Plan | OpenAI-compatible | `https://token-plan-cn.xiaomimimo.com/v1` | `mimo-v2.5` |
| Xiaomi MiMo | Token Plan | Anthropic-compatible | `https://token-plan-cn.xiaomimimo.com/anthropic` | `mimo-v2.5` |
| Volcengine | Agent Plan | OpenAI-compatible | `https://ark.cn-beijing.volces.com/api/plan/v3` | `mimo-v2.5` |
| Volcengine | Agent Plan | Anthropic-compatible | `https://ark.cn-beijing.volces.com/api/plan` | `mimo-v2.5` |
| Volcengine | Coding Plan | OpenAI-compatible | `https://ark.cn-beijing.volces.com/api/coding/v3` | `mimo-v2.5` |
| Volcengine | Coding Plan | Anthropic-compatible | `https://ark.cn-beijing.volces.com/api/coding` | `mimo-v2.5` |
| OpenCode Go | Go | OpenAI-compatible | `https://opencode.ai/zen/go` | `mimo-v2.5` |

Local model example:

```text
model: qwen/qwen3-vl-8b
base_url: http://192.168.1.10:1234/v1
api_key: local
format: openai-compatible
```

## 8. MCP Client Configuration

### 8.1 Claude Code Automatic Registration

The setup wizard can register this server into Claude Code. After accepting registration, restart Claude Code or run:

```text
/mcp
```

Expected result:

```text
vision-bridge  Connected
```

### 8.2 Claude Code Manual Registration

```bash
claude mcp add --scope user vision-bridge -- mcp-vision-bridge
```

Windows npm shim:

```powershell
claude mcp add --scope user vision-bridge -- "$env:APPDATA\npm\mcp-vision-bridge.cmd"
```

Check registration:

```bash
claude mcp list
```

### 8.3 Generic MCP JSON

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

If command resolution fails on Windows, use the absolute npm shim path:

```json
{
  "mcpServers": {
    "vision-bridge": {
      "command": "C:\\Users\\YOUR_NAME\\AppData\\Roaming\\npm\\mcp-vision-bridge.cmd",
      "args": []
    }
  }
}
```

### 8.4 Current Reasonix Configuration

Current Reasonix builds usually read the global configuration from:

```text
%APPDATA%\reasonix\config.toml
```

Add or update this block:

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

If Windows cannot resolve the global npm command, use the absolute npm shim path:

```toml
command = "C:\\Users\\YOUR_NAME\\AppData\\Roaming\\npm\\mcp-vision-bridge.cmd"
```

The Reasonix-specific automatic routing rule is:

```text
rules/reasonix-autovision.md
```

## 9. Terminal Management Console

Run:

```bash
mvb
```

Common commands:

```bash
mvb 1          # Show dashboard
mvb 2          # Enable MCP vision for text-only host models
mvb 3          # Disable MCP vision for native multimodal host models
mvb 4          # List model profiles
mvb 5 2        # Switch to profile #2
mvb 5 <id>     # Switch by profile id
mvb 6          # Run doctor
mvb 7          # Run setup wizard again
mvb 8          # Show config/data/log paths
mvb 10         # Print MCP client snippets
```

Long alias:

```bash
mcp-vision-bridge-ui
```

## 10. Text-only Versus Multimodal Host Models

Enable MCP vision for text-only host models:

```bash
mvb 2
```

or:

```bash
mcp-vision-bridge-vision on
```

Disable MCP vision for native multimodal host models:

```bash
mvb 3
```

or:

```bash
mcp-vision-bridge-vision off
```

Check status:

```bash
mcp-vision-bridge-vision status
```

When disabled, image tools return `status: "vision_disabled"` and do not scan attachments or call the provider. Re-enabling is intentionally reserved for the user terminal command.

## 11. Automatic Vision Rule For Text-only Models

MCP servers cannot force host models to call tools. To make image use feel seamless, add the rule from:

```text
rules/single-modal-autovision.md
rules/reasonix-autovision.md
```

Minimal rule:

```text
When the host model is text-only, call mcp-vision-bridge automatically for uploaded/pasted images, image URLs, local image paths, OCR requests, screenshot comparison, UI visual review, and document-image understanding. Use vision_analyze_attachment for attachments without paths and vision_analyze_screenshot after automated screenshots. Answer from the vision result without asking the user to call MCP explicitly.
```

## 12. Tool Reference

- `vision_status`: show whether MCP image recognition is enabled.
- `vision_set_enabled`: disable MCP image recognition from inside MCP.
- `vision_list_profiles`: list configured provider profiles.
- `vision_switch_profile`: switch the active provider profile.
- `vision_analyze_attachment`: analyze uploaded or pasted image attachments.
- `vision_analyze_screenshot`: analyze screenshots saved by automation or testing.
- `vision_list_recent_images`: list recent local image candidates.
- `vision_probe`: test image input support.
- `vision_register_image`: register an image and return `image_id`.
- `vision_describe_image`: describe visible image content.
- `vision_ask_image`: ask a specific image question.
- `vision_ocr_image`: extract visible text.
- `vision_image_to_markdown`: convert an image to a Markdown fact sheet.
- `vision_analyze_region`: analyze a focused region.

Supported image inputs include `image_path`, `image_url`, `image_base64`, `image_id`, `attachment_name`, `attachment_hint`, `attachment_index`, and `use_clipboard`.

## 13. Logs

When enabled, each recognition call appends one JSON line to:

```text
<dataDir>/logs/vision-YYYY-MM-DD.jsonl
```

The log records tool name, provider metadata, image MIME/size/SHA-256, image source, prompt, duration, result, or error. It never records API keys or raw Base64 image data.

## 14. Environment Overrides

```bash
VISION_MCP_CONFIG=C:/path/config.json
VISION_PROVIDER_CATALOG=C:/path/provider-catalog.json
VISION_MCP_DATA_DIR=C:/path/data
VISION_MCP_LOG_DIR=C:/path/logs
VISION_MCP_LOGGING=true
VISION_MCP_ENABLED=true
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
VISION_ATTACHMENT_MAX_AUTO_SELECT_AGE_SECONDS=180
VISION_ATTACHMENT_CLAUDE_CODE_FALLBACK=true
VISION_ATTACHMENT_CLAUDE_CODE_DIRS=C:/Users/me/.claude/projects
VISION_ATTACHMENT_MAX_CLAUDE_CODE_AUTO_SELECT_AGE_SECONDS=600
VISION_ATTACHMENT_CLIPBOARD_FALLBACK=true
```

## 15. Troubleshooting

### 15.1 `/mcp` Does Not Show `vision-bridge`

1. Confirm commands exist:

```bash
where mcp-vision-bridge
where mvb
```

macOS / Linux:

```bash
command -v mcp-vision-bridge
command -v mvb
```

2. Register manually:

```bash
claude mcp add --scope user vision-bridge -- mcp-vision-bridge
```

3. On Windows, use the npm shim path:

```powershell
claude mcp add --scope user vision-bridge -- "$env:APPDATA\npm\mcp-vision-bridge.cmd"
```

4. Restart the client.
5. Run:

```bash
mcp-vision-bridge-doctor
```

### 15.2 HTTP 400 From Provider

Common causes:

- Wrong compatibility format.
- Wrong Base URL.
- Wrong model id.
- Invalid API key.
- Provider does not accept image input.

Check current config:

```bash
mvb
```

Run diagnostics:

```bash
mcp-vision-bridge-doctor
```

Re-run setup if needed:

```bash
mvb 7
```

Use `vision_probe` to verify image support.

If Reasonix or another text-only client returns an error like:

```text
unknown variant image_url, expected text
```

the client likely sent image blocks directly to a text-only host model instead of routing the image through MCP first. To fix it:

1. Confirm `%APPDATA%\reasonix\config.toml` registers `vision-bridge` with `[[plugins]]`.
2. Add `vision_analyze_attachment`, `vision_analyze_screenshot`, `vision_describe_image`, `vision_ask_image`, `vision_ocr_image`, and `vision_image_to_markdown` to `trusted_read_only_tools`.
3. Add the routing rule from `rules/reasonix-autovision.md` to Reasonix global or project instructions.
4. For text-only models, route image requests through `mcp__vision-bridge__vision_analyze_attachment` before answering.
5. If the client still sends attachments directly to the text-only model first, use clipboard fallback, an explicit local path, or an image URL for MCP vision.

### 15.3 Request Hangs Or Progress Does Not Move

For local models:

- Restart or stop the stuck local model job.
- Keep preprocessing enabled.
- Lower `VISION_IMAGE_MAX_DIMENSION` to `1024` or `768`.
- Increase `VISION_REQUEST_TIMEOUT_MS` if the provider is slow.
- For 8GB GPUs, start with a smaller image long-side limit.

### 15.4 Wrong Or Old Image Is Selected

1. Call `vision_list_recent_images`.
2. Inspect `ageSeconds`, `path`, `sourceKind`, and `autoSelectReason`.
3. Pass the correct `attachment_index`.
4. Add `attachment_hint` from visible filename, size, or path fragments.
5. Clear or update the clipboard.
6. Provide an explicit `image_path` if automatic discovery cannot identify the image.

### 15.5 VSCode Claude Code Attachment Is Not Found

1. Confirm Claude Code fallback is enabled.
2. Restart the VSCode extension or Claude Code session.
3. Analyze soon after uploading the image.
4. Pass visible attachment chip text as `attachment_hint`.
5. On Windows, try `use_clipboard: true`.
6. Provide an explicit local path if needed.

### 15.6 Multimodal Host Model Is Being Routed Through MCP

Disable MCP vision:

```bash
mvb 3
```

Enable it again for text-only models:

```bash
mvb 2
```

### 15.7 API Quota Or Rate Limit

List profiles:

```bash
mvb 4
```

Switch profile:

```bash
mvb 5 2
```

The MCP tool equivalents are `vision_list_profiles` and `vision_switch_profile`.

### 15.8 Command Not Found

Reinstall globally:

```bash
npm install -g mcp-vision-bridge
```

or from source:

```bash
npm install -g .
```

Then reopen the terminal and check:

```bash
where mvb
where mcp-vision-bridge
```

## 16. Uninstall

```bash
npm uninstall -g mcp-vision-bridge
```

If an old package name was installed:

```bash
npm uninstall -g local-vision-mcp
```

Optional local config/data removal:

Windows:

```text
%APPDATA%\mcp-vision-bridge
```

macOS:

```text
~/Library/Application Support/mcp-vision-bridge
```

Linux:

```text
~/.config/mcp-vision-bridge
```

Removing this directory deletes local API keys, logs, cache, and registered images. Do this only when you no longer need them.

## 17. License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
