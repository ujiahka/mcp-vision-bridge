import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CLIPBOARD_FILE = "clipboard-latest.png";

export function getClipboardImageCandidate(config) {
  if (process.platform !== "win32") return null;
  if (!config?.dataDir) return null;

  const filePath = path.join(config.dataDir, "clipboard", CLIPBOARD_FILE);
  const result = saveWindowsClipboardImage(filePath);
  if (!result.ok) return null;

  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return null;
  }
  if (stat.size <= 0 || stat.size > (config.limits?.maxImageBytes || Infinity)) return null;

  return {
    path: filePath,
    fileName: CLIPBOARD_FILE,
    mime: "image/png",
    bytes: stat.size,
    mtime: stat.mtime.toISOString(),
    mtimeMs: stat.mtimeMs,
    sourceKind: "clipboard",
    clipboard: true,
    clipboardDimensions: result.dimensions,
  };
}

function saveWindowsClipboardImage(filePath) {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "Add-Type -AssemblyName System.Windows.Forms",
    "Add-Type -AssemblyName System.Drawing",
    "$out = $env:VISION_MCP_CLIPBOARD_OUTPUT",
    "$img = [System.Windows.Forms.Clipboard]::GetImage()",
    "if ($null -eq $img) { exit 2 }",
    "try {",
    "  [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($out)) | Out-Null",
    "  $img.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)",
    "  Write-Output (\"{0}x{1}\" -f $img.Width, $img.Height)",
    "} finally {",
    "  if ($null -ne $img) { $img.Dispose() }",
    "}",
  ].join("; ");

  const result = spawnSync("powershell.exe", [
    "-NoProfile",
    "-STA",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    script,
  ], {
    encoding: "utf8",
    timeout: 5000,
    windowsHide: true,
    env: {
      ...process.env,
      VISION_MCP_CLIPBOARD_OUTPUT: filePath,
    },
  });

  if (result.status !== 0) {
    return { ok: false, error: result.stderr || result.error?.message || `exit ${result.status}` };
  }

  return {
    ok: true,
    dimensions: String(result.stdout || "").trim(),
  };
}
