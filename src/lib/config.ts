// Centralized runtime config for frontend API targets.
// FastAPI services intentionally share one origin so deployment settings cannot drift.

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function isPublicHttpsUrl(value?: string): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !["localhost", "127.0.0.1", "::1"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

const configuredBackendUrl = import.meta.env.VITE_BACKEND_URL;
const configuredNodeUrl = import.meta.env.VITE_NODE_API_URL;

// Node is the public FastAPI gateway in single-tunnel deployments. If a stale
// production VITE_BACKEND_URL still points to localhost, prefer the public Node
// origin; its narrow /api/v1 proxy preserves FastAPI authentication and roles.
const backendOrigin =
  import.meta.env.PROD &&
  !isPublicHttpsUrl(configuredBackendUrl) &&
  isPublicHttpsUrl(configuredNodeUrl)
    ? configuredNodeUrl
    : configuredBackendUrl || "http://localhost:8000";

export const BACKEND_URL = withoutTrailingSlash(backendOrigin);

// Node voice/API server (signed media URLs, voice, FastAPI gateway).
export const NODE_API_URL = withoutTrailingSlash(
  configuredNodeUrl || "http://localhost:3001",
);

// Knowledge-base, scraper, and session-type sync APIs all live on FastAPI.
// Deriving every path from one origin prevents stale per-service Vercel values.
export const KB_API_URL = `${BACKEND_URL}/api/v1/kb`;
export const SCRAPER_API_URL = `${BACKEND_URL}/api/v1/scraper`;
export const KNOWLEDGE_BASE_API_URL = `${BACKEND_URL}/api/v1/knowledge-base`;

// SLA windows (seconds) for the escalation queue (G28). Business vs out-of-hours.
export const SLA_BUSINESS_HOURS_SECONDS = Number(
  import.meta.env.VITE_SLA_BUSINESS_SECONDS || 120,
);
export const SLA_OUT_OF_HOURS_SECONDS = Number(
  import.meta.env.VITE_SLA_OUT_OF_HOURS_SECONDS || 600,
);

// Wrapper around fetch for calls to our own backends. When the target is an
// ngrok tunnel (used for quick demos against a local backend), free ngrok shows
// an HTML interstitial unless this header is present. The header is harmless on
// any other host, so we add it whenever the URL points at an ngrok domain.
export function apiFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const isNgrok = /(^|\.)ngrok[\w-]*\.(app|dev|io)$/.test(
    (() => {
      try {
        return new URL(input).host;
      } catch {
        return "";
      }
    })(),
  );
  if (!isNgrok) return fetch(input, init);
  return fetch(input, {
    ...init,
    headers: { ...(init.headers || {}), "ngrok-skip-browser-warning": "true" },
  });
}
