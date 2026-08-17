#!/usr/bin/env node

if (!process.env.VERCEL) process.exit(0);

function publicHttpsUrl(value) {
  try {
    const url = value ? new URL(value.trim()) : null;
    return url?.protocol === "https:" &&
      !["localhost", "127.0.0.1", "::1"].includes(url.hostname)
      ? url
      : null;
  } catch {
    return null;
  }
}

const backendUrl = publicHttpsUrl(process.env.VITE_BACKEND_URL);
const nodeGatewayUrl = publicHttpsUrl(process.env.VITE_NODE_API_URL);
const gatewayUrl = backendUrl || nodeGatewayUrl;

if (!gatewayUrl) {
  console.error(
    [
      "Invalid Vercel API configuration.",
      "Set VITE_BACKEND_URL to a public HTTPS FastAPI origin, or VITE_NODE_API_URL to the public Node gateway origin.",
      "Do not use localhost: a deployed browser cannot reach the build machine or a visitor's computer.",
      `VITE_BACKEND_URL: ${process.env.VITE_BACKEND_URL || "<missing>"}`,
      `VITE_NODE_API_URL: ${process.env.VITE_NODE_API_URL || "<missing>"}`,
    ].join("\n"),
  );
  process.exit(1);
}

const legacyVariables = [
  "VITE_KB_API_URL",
  "VITE_SCRAPER_API_URL",
  "VITE_KNOWLEDGE_BASE_API_URL",
].filter((name) => process.env[name]);

if (legacyVariables.length) {
  console.warn(
    `Ignoring deprecated per-service variables: ${legacyVariables.join(", ")}. Remove them from Vercel.`,
  );
}

console.log(`Validated public API gateway: ${gatewayUrl.origin}`);
