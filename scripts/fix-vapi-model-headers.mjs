/**
 * One-off fix: remove the invalid `model.headers` field from the Vapi assistant.
 *
 * Why: `x-vapi-secret` was placed on `model.headers`. That field is only valid
 * when the model provider is `custom-llm`. This assistant uses provider `groq`,
 * so Vapi rejects every update with "headers shouldn't exist", blocking any
 * model/voice change in the dashboard. This script removes only that field and
 * leaves everything else untouched.
 *
 * Run:  node scripts/fix-vapi-model-headers.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Minimal .env parser (avoids adding a dependency).
function loadEnv() {
  const envPath = join(__dirname, "..", ".env");
  const out = {};
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[m[1]] = val;
  }
  return out;
}

const env = loadEnv();
const API_KEY = env.VAPI_API_KEY;
const ASSISTANT_ID = env.VAPI_ASSISTANT_ID;
const API_BASE = env.VAPI_API_BASE || "https://api.vapi.ai";

if (!API_KEY || !ASSISTANT_ID) {
  console.error("Missing VAPI_API_KEY or VAPI_ASSISTANT_ID in .env");
  process.exit(1);
}

const authHeaders = {
  Authorization: `Bearer ${API_KEY}`,
  "Content-Type": "application/json",
};

async function main() {
  // 1. Fetch current assistant.
  const getRes = await fetch(`${API_BASE}/assistant/${ASSISTANT_ID}`, {
    headers: authHeaders,
  });
  if (!getRes.ok) {
    console.error(`GET failed: ${getRes.status} ${await getRes.text()}`);
    process.exit(1);
  }
  const assistant = await getRes.json();

  if (!assistant.model || !("headers" in assistant.model)) {
    console.log("Nothing to do: model.headers is not present.");
    return;
  }

  // 2. Build a model object without the invalid `headers` field.
  const { headers, ...cleanModel } = assistant.model;
  console.log(
    "Removing model.headers with keys:",
    Object.keys(headers || {}).join(", ") || "(empty)",
  );

  // 3. PATCH only the model back (replaces the model object).
  const patchRes = await fetch(`${API_BASE}/assistant/${ASSISTANT_ID}`, {
    method: "PATCH",
    headers: authHeaders,
    body: JSON.stringify({ model: cleanModel }),
  });

  if (!patchRes.ok) {
    console.error(`PATCH failed: ${patchRes.status} ${await patchRes.text()}`);
    process.exit(1);
  }

  const updated = await patchRes.json();
  console.log(
    "Success. model.headers present after update:",
    "headers" in (updated.model || {}),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
