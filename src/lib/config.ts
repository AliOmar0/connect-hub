// Centralized runtime config for frontend API targets.
// Override via Vite env vars (VITE_*) at build time.

// Person 1's FastAPI backend (sessions, messages, escalation actions).
export const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

// Node voice/API server (signed media URLs, voice, etc.).
export const NODE_API_URL =
  import.meta.env.VITE_NODE_API_URL || "http://localhost:5000";

// Knowledge-base admin API base. Person 1 owns the backend; this is the agreed
// contract path. Falls back to the FastAPI backend.
export const KB_API_URL =
  import.meta.env.VITE_KB_API_URL || `${BACKEND_URL}/api/v1/kb`;

// Scraper admin API base (bank website crawler). Same backend, own prefix.
export const SCRAPER_API_URL =
  import.meta.env.VITE_SCRAPER_API_URL || `${BACKEND_URL}/api/v1/scraper`;

// Knowledge-base document/session-type sync API base (FastAPI backend's
// /api/v1/knowledge-base/* routes - distinct from KB_API_URL's /api/v1/kb/*
// frontend-contract aliases above). Same backend, own prefix.
export const KNOWLEDGE_BASE_API_URL =
  import.meta.env.VITE_KNOWLEDGE_BASE_API_URL ||
  `${BACKEND_URL}/api/v1/knowledge-base`;

// SLA windows (seconds) for the escalation queue (G28). Business vs out-of-hours.
export const SLA_BUSINESS_HOURS_SECONDS = Number(
  import.meta.env.VITE_SLA_BUSINESS_SECONDS || 120,
);
export const SLA_OUT_OF_HOURS_SECONDS = Number(
  import.meta.env.VITE_SLA_OUT_OF_HOURS_SECONDS || 600,
);

// Below this many seconds remaining, a waiting session is "due soon": still
// inside its SLA, but close enough that it needs an owner now. Presentation
// only -- nothing is escalated or timed out on this threshold.
export const SLA_DUE_SOON_SECONDS = Number(
  import.meta.env.VITE_SLA_DUE_SOON_SECONDS || 30,
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
