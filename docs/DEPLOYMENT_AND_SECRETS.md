# Deployment, Secrets & Operations Runbook

This is the step-by-step operational guide for connect-hub.

---

## 1. Rotate every committed credential (do this first)

All keys that were ever committed to git are compromised and must be regenerated.
Rotating means: create a NEW key in the provider, update your local `.env`, then
disable/delete the OLD key.

| Service                        | Where to rotate                                                                  | Old value to disable                                                                |
| ------------------------------ | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **OpenRouter**                 | openrouter.ai → Keys → create new, delete old                                    | `OPENROUTER_API_KEY` (was hardcoded in server)                                      |
| **Supabase anon + JWT secret** | Supabase → Project Settings → API → "Reset" JWT secret; rotate anon/service keys | `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` |
| **Twilio**                     | Twilio Console → Account → API keys & Auth Token → rotate                        | `TWILIO_AUTH_TOKEN`, `TWILIO_API_KEY`, `TWILIO_API_SECRET`                          |
| **Deepgram**                   | console.deepgram.com → API Keys → create new, revoke old                         | `DEEPGRAM_API_KEY`                                                                  |
| **ElevenLabs**                 | elevenlabs.io → Profile → API Keys → regenerate                                  | `ELEVENLABS_API_KEY`                                                                |
| **Munsit**                     | provider dashboard → regenerate                                                  | `MUNSIT_API_KEY`                                                                    |
| **Meta WhatsApp**              | developers.facebook.com → your app → WhatsApp → API Setup → generate new token   | `SECURITY_WHATSAPP_ACCESS_TOKEN`                                                    |

Steps for each:

1. Log into the provider and generate a new key/secret.
2. Paste the new value into your local `.env` (never commit it).
3. Update the deployment secret store (Vercel env vars / k8s Secret / host env).
4. Revoke or delete the old key in the provider.
5. Redeploy and verify the service still works.

After rotation, also revoke the **Supabase JWT secret** last — it invalidates all
existing user sessions, so users will need to log in again.

---

## 2. Scrub secrets from git history

Untracking (`git rm --cached`) only stops future commits — the keys are still in
old commits. Remove them from history with **git filter-repo** (recommended).

```bash
# 1. Install git-filter-repo (one of):
pip install git-filter-repo
#   or: brew install git-filter-repo  (macOS)

# 2. From a FRESH clone of the repo (filter-repo rewrites history):
git clone https://github.com/AliOmar0/connect-hub.git connect-hub-clean
cd connect-hub-clean

# 3. Remove the sensitive files from ALL history:
git filter-repo --invert-paths --path .env --path whatsapp-support-backend/.env

# 4. (Optional) Also scrub specific leaked strings that appeared elsewhere:
#    Create replacements.txt with lines like:  sk-or-v1-OLDKEY==>REMOVED
git filter-repo --replace-text replacements.txt

# 5. Re-add the remote (filter-repo drops it) and force-push:
git remote add origin https://github.com/AliOmar0/connect-hub.git
git push --force --all
git push --force --tags
```

> ⚠️ Force-pushing rewrites history for everyone. Coordinate with your teammate
> (Person 1): they must re-clone afterward, not `git pull`. This is destructive —
> make a backup of the repo first.

After scrubbing, confirm with a secret scan:

```bash
# Gitleaks (config already in repo as .gitleaks.toml)
docker run -v "$(pwd):/repo" zricethezav/gitleaks:latest detect --source=/repo
```

The GitHub Actions `security.yml` workflow also runs Gitleaks on every push/PR.

---

## 3. Run the full stack locally with Docker

```bash
# 1. Create your local secrets file from the template and fill in REAL values.
cp .env.example .env
#    (edit .env: Supabase, Twilio, OpenRouter, Azure TTS, etc.)

# 2. Create the private media bucket in Supabase (one-time):
#    Run server/private_media_setup.sql in the Supabase SQL editor.

# 3. Build and start everything (web, node-api, otp-service, redis, prometheus, grafana):
docker compose up --build

# 4. Open:
#    - Frontend:    http://localhost:8080
#    - Node API:    http://localhost:3001/health
#    - Metrics:     http://localhost:3001/metrics
#    - Prometheus:  http://localhost:9090
#    - Grafana:     http://localhost:3000  (admin / GRAFANA_ADMIN_PASSWORD)
```

To stop: `docker compose down` (add `-v` to also drop Redis/Grafana volumes).

---

## 4. Hosting: Vercel (frontend) + container host (backends)

**Recommendation:** put the **frontend on Vercel**, and the **backends on a
container host** (Railway, Render, Fly.io, a VPS, or the included k8s manifests).

Why not the backends on Vercel: the Node server needs persistent WebSocket
connections (Twilio Media Streams for streaming voice), long-lived Redis
connections, and background processing; the Python service loads a multi-GB
Whisper model. Vercel's stateless serverless functions don't support persistent
WebSockets or long-running/GPU processes.

### Frontend on Vercel

1. Import the GitHub repo at vercel.com → New Project.
2. Vercel auto-detects Vite; `vercel.json` is already configured
   (build `npm run build`, output `dist`, SPA rewrites).
3. Add Environment Variables (Production + Preview):
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`
   - `VITE_BACKEND_URL` → public URL of your FastAPI host
   - `VITE_NODE_API_URL` → public URL of your Node API host
   - `VITE_KB_API_URL` → `<FastAPI URL>/api/v1/kb`
4. Deploy. Vercel rebuilds on every push to the production branch.

### Backends on a container host

- Use the provided `Dockerfile.server`, `otp-service/Dockerfile`, and
  `docker-compose.yml`, or the `k8s/` manifests.
- Set the same secrets as in `.env` via the host's secret manager.
- Point Twilio's voice webhook and the WhatsApp webhook at the Node host's public URL.

---

## 5. Text-to-Speech configuration

The TTS provider is pluggable via `TTS_PROVIDER` (default `azure`).

| Provider          | Env vars                                                        | Best for                                                                  |
| ----------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `azure` (default) | `AZURE_TTS_KEY`, `AZURE_TTS_REGION`, `AZURE_TTS_VOICE`          | Arabic/Levantine + banking compliance; supports μ-law for streaming voice |
| `elevenlabs`      | `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL` | Most natural Arabic                                                       |
| `polly`           | (none)                                                          | Zero-setup fallback via Twilio `<Say>`                                    |
| `edge`            | `EDGE_TTS_URL`                                                  | Local dev (edge_tts_server.py)                                            |
| `voicebox`        | `VOICEBOX_URL`, `VOICEBOX_PROFILE_ID`                           | Local GPU (voicebox.sh desktop app)                                       |

- Call-flow audio is synthesized, stored in the **private** `call-media` bucket,
  and played to Twilio via a short-lived signed URL.
- The streaming voice path (`/voice/stream`) uses Azure's `raw-8khz-8bit-mono-mulaw`
  output to feed Twilio Media Streams directly without transcoding.
- For the live phone path, prefer low-latency models (Azure streaming, or
  ElevenLabs Flash v2.5).
