#!/usr/bin/env node
import fs from "node:fs";
import { attachmentDiscoveryStatus } from "./attachment-discovery.js";
import { defaultConfigPath, loadConfig } from "./config.js";
import { imagePreprocessStatus } from "./image-preprocess.js";
import { isRemoteEndpoint } from "./privacy.js";

console.log("mcp-vision-bridge doctor");
console.log(`Node.js: ${process.version}`);
console.log(`Config path: ${defaultConfigPath()}`);

try {
  const config = loadConfig();
  const remote = isRemoteEndpoint(config.provider.baseUrl);
  console.log("Config: ok");
  console.log(`Language: ${config.language || "en"}`);
  console.log(`Active profile: ${config.activeProfile || "default"}`);
  console.log(`Profiles: ${Object.keys(config.profiles || {}).length || 1}`);
  console.log(`Provider: ${config.provider.name}`);
  console.log(`Format: ${config.provider.type}`);
  console.log(`Plan: ${config.provider.plan || "custom"}`);
  console.log(`Model: ${config.provider.model}`);
  console.log(`Endpoint: ${config.provider.baseUrl}`);
  console.log(`Endpoint is remote: ${remote}`);
  console.log(`Remote endpoint allowed: ${config.privacy.allowRemoteEndpoint}`);
  console.log(`URL fetch allowed: ${config.privacy.allowUrlFetch}`);
  console.log(`Telemetry: ${config.privacy.telemetry ? "enabled" : "disabled"}`);
  console.log(`Data dir: ${config.dataDir}`);
  console.log(`Data dir exists: ${fs.existsSync(config.dataDir)}`);
  console.log(`Recognition logs: ${config.logging.enabled ? "enabled" : "disabled"}`);
  console.log(`Log dir: ${config.logging.dir}`);
  console.log(`Log dir exists: ${fs.existsSync(config.logging.dir)}`);
  const imageStatus = await imagePreprocessStatus(config);
  console.log(`Image preprocessing: ${imageStatus.preprocess ? "enabled" : "disabled"}`);
  console.log(`Image preprocessing mode: ${imageStatus.preprocessMode}`);
  console.log(`Image preprocessing active for provider: ${imageStatus.activeForProvider}`);
  console.log(`Image URL transport: ${config.image?.urlTransport || "remote-direct"}`);
  console.log(`Image max dimension: ${imageStatus.maxDimension}`);
  console.log(`JPEG quality: ${imageStatus.jpegQuality}`);
  console.log(`sharp available: ${imageStatus.sharpAvailable}`);
  const attachmentStatus = attachmentDiscoveryStatus(config);
  console.log(`Attachment auto-discovery: ${attachmentStatus.autoDiscover ? "enabled" : "disabled"}`);
  console.log(`Attachment max age minutes: ${attachmentStatus.maxAgeMinutes}`);
  console.log(`Attachment max auto-select age seconds: ${attachmentStatus.maxAutoSelectAgeSeconds}`);
  console.log(`Attachment magic-byte scan: ${attachmentStatus.includeMagicByteScan ? "enabled" : "disabled"}`);
  console.log(`Attachment search dirs: ${attachmentStatus.searchDirs.join("; ")}`);
} catch (err) {
  console.error(`Config: failed - ${err.message}`);
  process.exitCode = 1;
}
