import net from "node:net";

export function parseUrl(value, label = "URL") {
  try {
    return new URL(value);
  } catch {
    throw new Error(`${label} is not a valid URL: ${value}`);
  }
}

export function isPrivateOrLocalHostname(hostname) {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    return true;
  }

  const ipType = net.isIP(host);
  if (ipType === 6) {
    return host === "::1" || host.startsWith("fd") || host.startsWith("fc") || host.startsWith("fe80:");
  }

  if (ipType === 4) {
    const parts = host.split(".").map((part) => Number(part));
    const [a, b] = parts;
    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    );
  }

  return false;
}

export function isRemoteEndpoint(baseUrl) {
  const url = parseUrl(baseUrl, "Model endpoint");
  return !isPrivateOrLocalHostname(url.hostname);
}

export function assertEndpointAllowed(config) {
  const baseUrl = config.provider?.baseUrl;
  if (!baseUrl) throw new Error("Missing provider.baseUrl. Run mcp-vision-bridge-init first.");
  if (isRemoteEndpoint(baseUrl) && !config.privacy?.allowRemoteEndpoint) {
    throw new Error(
      "Configured model endpoint is public, but allowRemoteEndpoint is false. Re-run init and explicitly allow remote providers, or use a local/LAN endpoint.",
    );
  }
}

export function assertUrlFetchAllowed(config) {
  if (!config.privacy?.allowUrlFetch) {
    throw new Error("image_url inputs are disabled by privacy settings. Re-run init and enable URL fetching.");
  }
}
