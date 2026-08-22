# PIB Connect

PIB Connect (Connect-Hub) is an AI-powered, omnichannel customer support platform built for **Palestine Islamic Bank**. It lets customers reach the bank over **phone calls, WhatsApp, and web chat**, answers common banking questions with an Arabic-capable AI assistant, handles OTP-based identity verification, and escalates to human agents through a real-time operations dashboard.

The system is multilingual (Arabic and English, with full RTL support) and is designed so that most of it can be exercised locally with little or no Twilio/paid-API cost.

---

## Features

- **Omnichannel support** — inbound/outbound voice calls (Twilio), WhatsApp Cloud API messaging, and web chat all routed through the same AI logic.
- **Arabic-first AI assistant** — answers customer questions via OpenRouter LLMs with automatic model fail-over; tuned for Palestinian dialects and banking topics.
- **Speech pipeline** — speech-to-text (Deepgram) and pluggable text-to-speech with multiple providers: Azure Neural TTS, ElevenLabs, Amazon Polly, a free local `edge-tts` server, and Voicebox.
- **OTP identity verification** — one-time passcodes delivered over WhatsApp (no paid SMS) plus in-app notifications.
- **Agent operations dashboard** — sessions, live queue, employees, analytics, knowledge base, notifications, and settings, with role-based access (agent, supervisor, manager, admin).
- **Escalation & SLA tracking** — configurable SLA windows for business hours vs. out-of-hours, with live escalation listening.
- **Internationalization** — Arabic and English UI with RTL/LTR layout switching.
- **Private media handling** — short-lived signed URLs for call/recording media, gated by role.
- **Observability & security** — Prometheus metrics, structured logging (Pino), Helmet, CORS allow-listing, and IP/session rate limiting (Redis-backed, with in-memory fallback).
- **Backend Tester page** — exercise AI chat, a simulated voice turn, TTS, and health checks without placing real calls.

---

## Architecture

PIB Connect is a monorepo of several cooperating services:

| Component            | Path                        | Stack                                               | Responsibility                                                                          |
| -------------------- | --------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Web dashboard**    | `src/`                      | React 18 + TypeScript + Vite + shadcn/ui + Tailwind | Agent/supervisor UI, auth, analytics                                                    |
| **Node API**         | `server/`                   | Express 5                                           | Twilio voice, web chat, OTP, TTS orchestration, WhatsApp webhook, signed media          |
| **WhatsApp backend** | `whatsapp-support-backend/` | Python / FastAPI                                    | Full WhatsApp channel: Whisper STT, RAG, classification, session management, escalation |
| **Edge TTS**         | `edge_tts_server.py`        | Python                                              | Free local Arabic text-to-speech server                                                 |
| **Data / Auth**      | `supabase/`                 | Supabase (Postgres, Auth, Storage)                  | Users, sessions, messages, roles, migrations                                            |
| **State**            | Redis                       | ioredis                                             | Session state, deduplication, distributed rate limiting                                 |

Infrastructure: Docker Compose for the full stack, Nginx config in `deploy/`, a Kubernetes manifest in `k8s/`, Prometheus + Grafana in `monitoring/`, and GitHub Actions workflows in `.github/workflows/`.

---

## Tech Stack

**Frontend**

- React 18, TypeScript, Vite
- shadcn/ui (Radix UI), Tailwind CSS
- React Router, TanStack Query
- react-i18next (Arabic + English, RTL)
- Recharts, Supabase JS client, Twilio Voice SDK

**Node API**

- Express 5, Helmet, CORS, express-rate-limit (+ rate-limit-redis)
- Twilio SDK, Deepgram SDK, ElevenLabs, OpenAI/OpenRouter client
- ioredis, jsonwebtoken, Pino, prom-client, Zod

**Python services**

- FastAPI + Uvicorn
- Whisper (speech-to-text), RAG / vector search
- Supabase / PostgreSQL, WhatsApp Cloud API

**Tooling & Infra**

- Vitest + Testing Library, ESLint, Prettier, Husky, lint-staged
- Docker / Docker Compose, Nginx, Kubernetes
- Prometheus, Grafana, GitHub Actions

---

## Prerequisites

- **Node.js 18+** and npm
- **Python 3.11+** (for the OTP service, edge-tts server, and WhatsApp backend)
- **Redis** (optional — the Node API falls back to an in-memory store if unavailable)
- **Docker Desktop** (optional — for the containerized full stack)
- Accounts/keys as needed: **Supabase**, **Twilio**, **OpenRouter**, **Deepgram**, a **TTS provider**, and **Meta WhatsApp Cloud API**

---

## Getting Started

### 1. Clone and install

```sh
git clone <YOUR_GIT_URL>
cd connect-hub
npm install
```

### 2. Configure environment

Copy the template and fill in your values. See [Environment Variables](#environment-variables) below.

```sh
cp .env.example .env
```

### 3. Run the frontend

```sh
npm run dev
```

The Vite dev server runs on **http://localhost:8080**.

### 4. Run the backend

One-time backend setup (creates a Python venv and installs service deps):

```sh
npm run setup:backend
```

Start the free backend stack (Node API + free edge-tts) in a single terminal:

```sh
npm run backend
```

Other backend script options:

```sh
npm run backend:node    # Node API only
npm run backend:otp     # Node API + edge-tts + OTP service
npm run backend:all     # everything, including the heavy WhatsApp/Whisper backend
```

Run the frontend and backend together:

```sh
# Windows
./start.ps1
# macOS / Linux
./start.sh
```

For full details, see [`docs/RUNNING_BACKEND.md`](docs/RUNNING_BACKEND.md).

### 5. Run with Docker (optional)

```sh
# Core stack: redis + node-api + edge-tts + web
docker compose up --build

# Add Prometheus + Grafana
docker compose --profile monitoring up --build
```

- Frontend: http://localhost:8080
- Node API health: http://localhost:3001/health
- Edge TTS: http://localhost:5070

In Docker, `TTS_PROVIDER` defaults to the free `edge-tts` service, so no paid TTS credits are used.

---

## Usage

### Dashboard

Open **http://localhost:8080** and sign in. Routes are role-gated:

| Route                                   | Roles                             | Purpose                   |
| --------------------------------------- | --------------------------------- | ------------------------- |
| `/auth`                                 | public                            | Sign in                   |
| `/dashboard`                            | supervisor, manager, admin        | Overview & metrics        |
| `/sessions`, `/sessions/:id`            | all authenticated                 | Conversation sessions     |
| `/queue`                                | agent, supervisor, manager, admin | Live queue                |
| `/knowledge`                            | admin, supervisor, manager        | Knowledge base            |
| `/employees`, `/analytics`, `/settings` | supervisor, manager, admin        | Team & config             |
| `/notifications`, `/shortcuts`          | all authenticated                 | Alerts & shortcuts        |
| `/backend-test`                         | admin, supervisor, manager        | Backend Tester (dev/demo) |

### Test the AI without placing a call

```sh
# Chat with the AI over text (no Twilio cost)
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"السلام عليكم","sessionId":"test-1"}'

# Simulate one voice turn (speech -> AI reply), no call placed
npm run simulate:call "بدي اعرف رصيدي"
```

Or open the **Backend Tester** at `http://localhost:8080/backend-test` to try chat, a simulated voice turn, TTS, and a health/config snapshot.

### Key Node API endpoints

- `POST /voice`, `POST /handle-speech` — Twilio inbound voice (TwiML)
- `POST /api/voice-sdk`, `POST /api/make-call`, `GET /api/token` — outbound / browser SDK calling
- `POST /api/chat` — web chat with the AI assistant
- `POST /api/sms` — agent-initiated SMS
- `GET /api/media/sign` — short-lived signed media URLs
- `GET|POST /webhook/whatsapp` — Meta WhatsApp Cloud API webhook
- `GET /health`, `GET /api/test/status` — health & configuration snapshot

### WhatsApp

Point your Meta WhatsApp webhook at `https://<your-host>/webhook/whatsapp` (verify with `WHATSAPP_VERIFY_TOKEN`) and subscribe to the `messages` field. There are two implementations — the lightweight Node webhook (AI replies) and the full Python `whatsapp-support-backend` (session management, classification, escalation). Point Meta at one of them. See [`docs/RUNNING_BACKEND.md`](docs/RUNNING_BACKEND.md) and [`WHATSAPP_CONFIG.md`](WHATSAPP_CONFIG.md).

---

## Environment Variables

All variables live in the root `.env` (copy from [`.env.example`](.env.example)). Never commit a real `.env`. Key groups:

### Supabase

| Variable                        | Description                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------- |
| `VITE_SUPABASE_PROJECT_ID`      | Supabase project ID (frontend)                                                  |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon/publishable key (frontend)                                        |
| `VITE_SUPABASE_URL`             | Supabase project URL (frontend)                                                 |
| `SUPABASE_JWT_SECRET`           | JWT secret to verify access tokens server-side                                  |
| `SUPABASE_SERVICE_ROLE_KEY`     | Service-role key for privileged server operations (never expose to the browser) |

### Twilio (voice / SMS)

| Variable                                  | Description                                            |
| ----------------------------------------- | ------------------------------------------------------ |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | Twilio account credentials                             |
| `TWILIO_API_KEY`, `TWILIO_API_SECRET`     | API key/secret for token generation                    |
| `TWIML_APP_SID`                           | TwiML app SID for the Voice SDK                        |
| `TWILIO_PHONE_NUMBER`                     | Your Twilio voice-enabled number                       |
| `NGROK_URL`                               | Public base URL Twilio uses to reach the server        |
| `TWILIO_VALIDATE_SIGNATURE`               | `true` to reject unsigned Twilio webhooks (production) |

### AI / Speech

| Variable                               | Description                     |
| -------------------------------------- | ------------------------------- |
| `OPENROUTER_API_KEY`                   | OpenRouter API key for the LLM  |
| `OPENROUTER_MODEL`                     | Primary model id                |
| `OPENROUTER_FALLBACK_MODELS`           | Comma-separated fallback models |
| `DEEPGRAM_API_KEY`                     | Speech-to-text                  |
| `ELEVENLABS_API_KEY`, `MUNSIT_API_KEY` | Optional speech providers       |

### Text-to-Speech

| Variable                                               | Description                                               |
| ------------------------------------------------------ | --------------------------------------------------------- |
| `TTS_PROVIDER`                                         | One of `azure`, `elevenlabs`, `polly`, `edge`, `voicebox` |
| `AZURE_TTS_KEY`, `AZURE_TTS_REGION`, `AZURE_TTS_VOICE` | Azure Neural TTS                                          |
| `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL`              | ElevenLabs voice/model                                    |
| `EDGE_TTS_URL`                                         | Local free edge-tts server URL                            |
| `VOICEBOX_URL`, `VOICEBOX_PROFILE_ID`                  | Local Voicebox GPU app                                    |

### WhatsApp (Meta Cloud API)

| Variable                            | Description                                   |
| ----------------------------------- | --------------------------------------------- |
| `SECURITY_WHATSAPP_PHONE_NUMBER_ID` | WhatsApp phone number ID                      |
| `WhatsApp_Business_Account_ID`      | Business account ID                           |
| `SECURITY_WHATSAPP_ACCESS_TOKEN`    | Access token                                  |
| `WHATSAPP_APP_SECRET`               | App secret for webhook signature verification |
| `WHATSAPP_VERIFY_TOKEN`             | Token for the webhook verification handshake  |

### Redis & sessions

| Variable              | Description                        |
| --------------------- | ---------------------------------- |
| `REDIS_URL`           | Redis connection string (optional) |
| `SESSION_TTL_SECONDS` | Session TTL (default 1800)         |

### Frontend / runtime

| Variable                                                     | Description                                                             |
| ------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `PORT`, `TWILIO_SERVER_PORT`                                 | Node API port (default 3001)                                            |
| `VITE_BACKEND_URL`, `VITE_NODE_API_URL`                      | Frontend → Node API URL                                                 |
| `VITE_KB_API_URL`                                            | Frontend → knowledge-base admin API                                     |
| `VITE_SLA_BUSINESS_SECONDS`, `VITE_SLA_OUT_OF_HOURS_SECONDS` | Escalation SLA windows                                                  |
| `CORS_ALLOWED_ORIGINS`                                       | Comma-separated allowed browser origins                                 |
| `RATE_LIMIT_IP_PER_MIN`, `RATE_LIMIT_SESSION_PER_MIN`        | Rate limits                                                             |
| `MEDIA_BUCKET`, `SIGNED_URL_TTL_SECONDS`                     | Private media storage                                                   |
| `NODE_ENV`, `LOG_LEVEL`                                      | Runtime mode and log level                                              |
| `ENABLE_TEST_ENDPOINTS`                                      | Expose `/api/test/*` on a deployed backend (keep `false` in production) |

> `whatsapp-support-backend` (which includes WhatsApp OTP delivery -- there is
> no separate `otp-service`) uses some non-`VITE_` variable names — see its
> `.env.example`.

---

## Scripts

| Command                          | Description                                 |
| -------------------------------- | ------------------------------------------- |
| `npm run dev`                    | Start the Vite dev server (port 8080)       |
| `npm run build`                  | Production build                            |
| `npm run preview`                | Preview the production build                |
| `npm run lint`                   | Run ESLint                                  |
| `npm run test`                   | Run the Vitest test suite                   |
| `npm run test:coverage`          | Run tests with coverage                     |
| `npm run start`                  | Start the Node API                          |
| `npm run server`                 | Start the Node API with nodemon             |
| `npm run dev:all`                | Run web + API together                      |
| `npm run setup:backend`          | One-time backend (Python venv + deps) setup |
| `npm run backend`                | Node API + free edge-tts                    |
| `npm run backend:all`            | All services incl. WhatsApp backend         |
| `npm run simulate:call "<text>"` | Simulate a voice turn with no Twilio cost   |

---

## Testing

The project uses **Vitest** and **Testing Library**, with coverage thresholds enforced in CI and Git hooks (Husky) running lint and tests before commit/push.

```sh
npm run test          # watch mode
npm run test:run      # single run
npm run test:coverage # with coverage report
```

See [`docs/TESTING.md`](docs/TESTING.md) for guidelines and [`docs/CI_CD.md`](docs/CI_CD.md) for the CI/CD pipeline.

---

## Documentation

- [`docs/RUNNING_BACKEND.md`](docs/RUNNING_BACKEND.md) — running backend services locally and testing without Twilio cost
- [`docs/DEPLOYMENT_AND_SECRETS.md`](docs/DEPLOYMENT_AND_SECRETS.md) — deployment and secret management
- [`docs/TESTING.md`](docs/TESTING.md) — testing guide
- [`docs/CI_CD.md`](docs/CI_CD.md) — CI/CD workflows
- [`EMAIL_SETUP.md`](EMAIL_SETUP.md), [`WHATSAPP_CONFIG.md`](WHATSAPP_CONFIG.md), [`INBOUND_CALLS_SETUP.md`](INBOUND_CALLS_SETUP.md) — channel setup guides

---

## Branch Protection

This repository uses branch protection on `main`. Pull requests must pass tests, linting, and the build, follow conventional-commit formatting, and receive the required approvals. See [`.github/BRANCH_PROTECTION_SETUP.md`](.github/BRANCH_PROTECTION_SETUP.md) and [`.github/BRANCH_PROTECTION.md`](.github/BRANCH_PROTECTION.md).
