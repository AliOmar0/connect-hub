# Running the Backend Locally

The frontend runs on Vercel. This guide is about running the **backend services**
on your machine without juggling a separate terminal per service, and about
**testing everything (TTS, OTP, voice) while spending as little Twilio credit as
possible.**

---

## TL;DR

```bash
# 1. One-time setup (creates a Python venv + installs deps, checks .env)
npm run setup:backend

# 2. Start the free backend stack (Node API + free edge TTS) in ONE terminal
npm run backend

# 3. Test the AI + OTP + account flow with ZERO Twilio cost
npm run simulate:call "بدي اعرف رصيدي"
```

That's it for day-to-day work. Details below.

---

## The services

| Service              | Port | What it does                                   | Needed for                     |
| -------------------- | ---- | ---------------------------------------------- | ------------------------------ |
| **Node API**         | 3001 | Twilio voice, web chat, OTP, TTS orchestration | Everything (core)              |
| **Edge TTS** (free)  | 5070 | Arabic text-to-speech, no API key, no cost     | Hearing voice replies for free |
| **OTP service**      | 5001 | WhatsApp OTP microservice (FastAPI)            | Testing the standalone OTP API |
| **WhatsApp backend** | 5000 | WhatsApp channel + Whisper STT (heavy, ~GBs)   | The WhatsApp support channel   |
| **Redis**            | 6379 | Session/dedup/rate-limit state (optional)      | Multi-instance; safe to skip   |

Redis is optional: if it's not running, the Node server automatically falls back
to an in-memory store (fine for a single dev instance).

---

## Run ONE public channel at a time (WhatsApp or Voice)

WhatsApp and Twilio voice are separate channels, each needs its own public URL,
and the free ngrok plan allows only one tunnel per account at a time. So run them
**one at a time** — and you can put each on a **separate laptop**.

```bash
npm run channel:whatsapp   # Python backend (port 5000) + ngrok -> Active AI Sessions
npm run channel:voice      # Node API (port 3001) + edge TTS + ngrok -> Twilio voice
```

Each command starts the channel's backend **and** its ngrok tunnel in one
terminal (colored, prefixed output). Stop with `Ctrl+C`.

| Channel            | Backend                           | Port | Meta/Twilio path              | Powers                            |
| ------------------ | --------------------------------- | ---- | ----------------------------- | --------------------------------- |
| `channel:whatsapp` | Python `whatsapp-support-backend` | 5000 | `/webhook`                    | WhatsApp + **Active AI Sessions** |
| `channel:voice`    | Node `server/index.js`            | 3001 | `/voice`, `/webhook/whatsapp` | Twilio phone calls                |

### Per-laptop ngrok config (root `.env`)

ngrok reserved domains belong to a specific ngrok **account**, and the free plan
gives one static domain per account. So each laptop uses **its own** authtoken
and **its own** reserved domain:

```dotenv
NGROK_AUTHTOKEN="<this laptop's ngrok authtoken>"   # dashboard.ngrok.com > Your Authtoken
WHATSAPP_NGROK_URL="<your-whatsapp-domain>.ngrok-free.dev"   # laptop running channel:whatsapp
VOICE_NGROK_URL="<your-voice-domain>.ngrok-free.dev"         # laptop running channel:voice (falls back to NGROK_URL)
```

Only the domain for the channel that laptop runs needs to be valid. To test
without a reserved domain, append `--no-tunnel` and run your own
`ngrok http <port>` separately:

```bash
node scripts/run-channel.mjs whatsapp --no-tunnel
```

### Point Meta at the WhatsApp channel

In developers.facebook.com → your app → WhatsApp → Configuration:

- Callback URL: `https://<WHATSAPP_NGROK_URL>/webhook`
- Verify token: the `WHATSAPP_VERIFY_TOKEN` from `whatsapp-support-backend/.env`
- Subscribe to the **messages** field.

The active WhatsApp number (phone number id + access token) is read from the
`api_configurations` table in Supabase, editable from the in-app **Settings**
page — not from `.env`.

### Voice notes (STT) and reply speed

WhatsApp voice notes are transcribed via **Deepgram** (REST over httpx — no local
model). Set these in `whatsapp-support-backend/.env`:

```dotenv
DEEPGRAM_API_KEY="your_deepgram_api_key"
VOICE_ASR_MODEL="nova-3"   # nova-3 supports Arabic; nova-2 does NOT
VOICE_ASR_LANGUAGE="ar"
```

AI replies are debounced by a short buffer so rapid multi-message bursts become
one request. The wait is intentionally short; lower it further for snappier
replies (the timer resets on each new message):

```dotenv
BUFFER_WAIT_SECONDS=4        # wait after the last message before answering
RAPID_TYPING_WAIT_SECONDS=7  # wait used mid-burst when rapid typing is detected
```

> The old STT path used a local Whisper model (torch/transformers/librosa, multi-GB).
> Those deps are now **optional** in `requirements.txt` — the WhatsApp backend runs
> without them.

---

## Option A — Run with npm scripts (recommended for development)

One-time setup:

```bash
npm run setup:backend          # lightweight stack (Node + edge TTS + OTP deps)
# To also install the heavy WhatsApp/Whisper backend:
#   Windows:  ./scripts/setup-backend.ps1 -IncludeWhatsApp
#   mac/linux: ./scripts/setup-backend.sh --with-whatsapp
```

Then start whichever set of services you need (all in a single terminal, with
colored prefixes):

```bash
npm run backend         # node-api + edge-tts        (free default)
npm run backend:node    # node-api only
npm run backend:otp     # node-api + edge-tts + otp-service
npm run backend:all     # everything incl. WhatsApp backend
```

> `backend:all` includes the heavy WhatsApp/Whisper backend, which needs its
> large deps installed first (`setup-backend` with `-IncludeWhatsApp` /
> `--with-whatsapp`). If those deps are missing, that one service prints an
> install hint and exits — **the other services keep running.**

Stop everything with `Ctrl+C` once.

To run the backend **and** the Vite frontend together (if you're not using
Vercel locally):

```bash
# Windows
./start.ps1
# mac/linux
./start.sh
```

> The launcher uses the shared `.venv-backend` for Python services. If you skip
> setup, it falls back to your system `python` and prints a note.

---

## Option B — Run with Docker

Docker is the closest match to production and the simplest "one command" if you
already have Docker Desktop. The tradeoff: the images are larger and rebuilds are
slower than the npm scripts, so for fast iteration the scripts are usually nicer.

```bash
# Core stack: redis + node-api + edge-tts (free) + otp-service + web
docker compose up --build

# Also start Prometheus + Grafana
docker compose --profile monitoring up --build
```

Open:

- Frontend: http://localhost:8080
- Node API health: http://localhost:3001/health
- Edge TTS: http://localhost:5070

In Docker, `TTS_PROVIDER` defaults to the **free edge-tts** service, so no paid
TTS credits are used. Override it by setting `TTS_PROVIDER=azure` (etc.) in `.env`.

Stop with `docker compose down` (add `-v` to also drop Redis/Grafana volumes).

> The heavy WhatsApp/Whisper backend is **not** in the default compose stack
> (multi-GB image). Run it via `npm run backend:all` if you need it.

---

## Testing without spending Twilio trial credits

Twilio only charges when a **real phone call or SMS** happens. Almost the entire
system can be exercised with no call at all:

### The easiest way: the Backend Tester page

Run the backend and the frontend, then open **http://localhost:8080/backend-test**.

```bash
npm run backend     # backend (node-api + free edge TTS)
npm run dev         # frontend (Vite, port 8080)  - in a second terminal
# or run both at once:  ./start.ps1   (Windows)   /   ./start.sh   (mac/linux)
```

The page gives you, with zero Twilio cost:

- **Backend Health** - shows which providers are configured, the active TTS
  provider, Redis status, and the AI model.
- **Voice** - simulates one phone turn (caller speech → AI reply) and plays the
  synthesized audio. No call is placed.
- **Chat** - talks to the same AI logic over text.
- **TTS** - synthesizes Arabic speech and plays it back.

> The tester talks to dev-only endpoints (`/api/test/*`) that are automatically
> disabled when `NODE_ENV=production`.

### From the command line

**1. SMS is already disabled.** OTPs are delivered via WhatsApp + an in-app
notification (the bell in the dashboard), not paid SMS.

**2. Test the AI + OTP + account flow over text — no Twilio.**

```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"السلام عليكم","sessionId":"test-1"}'
```

**3. Simulate the voice webhook — no call placed.**
This hits the dev-only `/api/test/voice` endpoint, so it works regardless of the
`TWILIO_VALIDATE_SIGNATURE` setting:

```bash
npm run simulate:call "بدي اعرف رصيدي"
node scripts/simulate-call.mjs "مرحبا" --from "+970599000000"
```

**4. Hear voice for free.** With `TTS_PROVIDER=edge` and the edge-tts server
running (`npm run backend`), all synthesized speech uses Microsoft's free online
voices. `azure` also has a generous free monthly tier. Paid usage only starts if
you switch to a paid provider and exceed its free quota.

**5. When you DO need a real call (minimize cost):**

- Trial accounts can only call/receive from **verified** numbers — verify just
  your own number in the Twilio Console.
- Keep test calls short; inbound voice on a trial number is a fraction of a cent
  per minute.
- Only the live telephony path costs money. The tester page, chat, and
  simulate-call paths above cost nothing, so do the bulk of testing there first.

---

## Per-service environment variables

All values live in the root `.env` (copy from `.env.example`). Key ones:

- **Node API**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
  `OPENROUTER_API_KEY`, `TTS_PROVIDER` (use `edge` for free), and Twilio keys
  only when placing real calls.
- **OTP service** (`otp-service`): `SUPABASE_URL`, `SUPABASE_KEY`,
  `SECURITY_WHATSAPP_PHONE_NUMBER_ID`, `SECURITY_WHATSAPP_ACCESS_TOKEN`.
  Note these use non-`VITE_` names; add them to `.env` if you run this service.
- **WhatsApp backend**: see `whatsapp-support-backend/.env.example`.

If an optional service's credentials are missing, the related feature logs a
warning and is skipped rather than crashing the whole stack.

---

## AI model (free + capable)

The old model `arcee-ai/trinity-large-preview:free` was discontinued (every call
returned 404, which is why chat appeared "broken"). The backend now sends a
**`models` array** so OpenRouter automatically fails over when a free model is
busy (HTTP 429). Defaults (override in `.env`):

```dotenv
OPENROUTER_MODEL="google/gemma-4-31b-it:free"
OPENROUTER_FALLBACK_MODELS="meta-llama/llama-3.3-70b-instruct:free,qwen/qwen3-next-80b-a3b-instruct:free"
```

All three are free, strong at Arabic, and good fits for the banking assistant.
You can confirm the active list any time on the Backend Tester health panel or:

```bash
curl http://localhost:3001/api/test/status
```

> Free models share a global rate limit, so occasional 429s still happen. For
> rock-solid reliability, add your own provider key in the OpenRouter dashboard
> (your same `OPENROUTER_API_KEY` then gets higher limits) — still free to set up.

---

## Putting the Backend Tester on the Vercel frontend

The page lives at `/backend-test` and also appears in the dashboard sidebar
("Backend Tester"). To make it work against your **deployed** backend (not just
localhost):

1. **Frontend (Vercel env vars):** set `VITE_NODE_API_URL` to your deployed Node
   API URL (e.g. `https://api.yourhost.com`). The page reads this from
   `src/lib/config.ts`.
2. **Backend:** the `/api/test/*` endpoints are off in production by default.
   To expose them on the deployed backend, set `ENABLE_TEST_ENDPOINTS=true` in
   the backend's environment. (They bypass auth, so turn this off when you're not
   actively demoing.)
3. **CORS:** add your Vercel origin to `CORS_ALLOWED_ORIGINS` on the backend,
   e.g. `https://your-app.vercel.app`.

Locally everything is already wired: run `npm run backend` + `npm run dev` and
open http://localhost:8080/backend-test.

---

## WhatsApp: receive a message and get an AI reply

For a WhatsApp number to reply, three things must be true: (a) the AI works
(fixed above), (b) your webhook is publicly reachable, and (c) Meta is configured
to call it. The Node server already implements the webhook at
`POST /webhook/whatsapp` (verify handshake on `GET`), which runs the same AI
logic and sends the reply back via the WhatsApp Cloud API.

**1. Set the WhatsApp env vars** (root `.env`):

```dotenv
SECURITY_WHATSAPP_PHONE_NUMBER_ID="..."     # from Meta > WhatsApp > API Setup
SECURITY_WHATSAPP_ACCESS_TOKEN="..."        # access token (temp or permanent)
WHATSAPP_APP_SECRET="..."                   # Meta App > Settings > Basic > App Secret
WHATSAPP_VERIFY_TOKEN="any-string-you-choose"
```

**2. Expose the backend publicly.** Locally, use a tunnel:

```bash
npm run backend
npx ngrok http 3001        # gives https://<id>.ngrok-free.app
```

Or use your deployed backend URL.

**3. Configure the webhook in Meta** (developers.facebook.com → your app →
WhatsApp → Configuration):

- Callback URL: `https://<your-host>/webhook/whatsapp`
- Verify token: the same `WHATSAPP_VERIFY_TOKEN` value
- Subscribe to the **messages** field.

**4. Send a WhatsApp message** to your number. The flow is:
message → webhook → AI reply → sent back to you. Watch the backend logs to see
it processing.

> Trial/sandbox WhatsApp numbers can only message **registered test recipients**
> until the number is approved — add your own number as a test recipient in Meta.
>
> There are two WhatsApp implementations: the **Node** webhook above (simple AI
> replies, recommended to start) and the heavier **Python `whatsapp-support-backend`**
> (full session management, classification, and agent escalation). Point Meta at
> whichever one you want to use — not both at the same URL.
