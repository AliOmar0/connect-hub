# 📞 Inbound & Outbound Calls with Vapi

The voice channel runs on **[Vapi](https://vapi.ai)**. Vapi owns the realtime
voice pipeline — telephony, speech-to-text, and text-to-speech — while this
project remains the authoritative "brain" for every bank conversation.

## ✅ Current Architecture

1.  **Incoming/Outgoing Call** -> Vapi (telephony + STT + TTS)
2.  **Each turn** -> Vapi calls our custom-LLM endpoint
    `POST <PUBLIC_URL>/vapi/chat/completions` (OpenAI-compatible)
3.  **AI Response** -> the endpoint delegates to the Python policy backend
    (`POST /api/v1/assistant/reply` via `AI_BACKEND_URL`) -> validated text
4.  **Speech** -> Vapi synthesizes the reply with the assistant's configured voice
5.  **Dashboard** -> Vapi posts call events to `POST <PUBLIC_URL>/vapi/webhook`
    so calls appear live in Active Sessions / Sessions / Analytics

The same `processMessage()` logic powers WhatsApp, web chat, and voice, so all
channels share one central decision.

## 🔧 One-time Vapi setup

1.  Create a Vapi account and grab your **Public** and **Private** API keys
    (Dashboard → API Keys).
2.  Create an **Assistant** and set its model to a **Custom LLM**:
    - URL: `<PUBLIC_URL>/vapi` (Vapi appends `/chat/completions`)
    - Configure the transcriber (e.g. Arabic) and a voice under the assistant.
3.  Under the assistant's **Server / Advanced** settings, set the server URL to
    `<PUBLIC_URL>/vapi/webhook` and set a **secret** — use the same value as
    `VAPI_SERVER_SECRET`.
4.  Import/buy a **Phone Number** in Vapi and attach the assistant to it for
    inbound calls.
5.  Fill in `.env` (see `.env.example`):
    - `VAPI_API_KEY`, `VAPI_PUBLIC_KEY`, `VAPI_ASSISTANT_ID`,
      `VAPI_PHONE_NUMBER_ID`, `VAPI_SERVER_SECRET`
6.  Verify with: `node check_vapi_env.js`

`<PUBLIC_URL>` is your `NGROK_URL` (local dev) or your deployed host.

## 🚀 How to Run

```bash
npm run channel:voice
```

This starts the Node API (Vapi endpoints, port 3001), the Python policy backend
(port 8000), and an ngrok tunnel to your `VOICE_NGROK_URL`. Point the Vapi
assistant's custom-LLM URL and server URL at that public domain.

## 🧪 Testing

- **Browser call**: open Settings → the voice tab → **Start Call** to talk to the
  assistant directly in the browser (uses the Vapi web SDK + `VAPI_PUBLIC_KEY`).
- **Outbound call**: enter a number and **Dial Now** (calls `POST /api/make-call`,
  which places the call via Vapi).
- **Inbound call**: dial your Vapi phone number.
- **No-telephony simulation**: the Backend Tester page hits `/api/test/voice`,
  which runs the same AI logic without placing a real call.

## 🛠️ Troubleshooting

- **401 on `/vapi/*`**: `VAPI_SERVER_SECRET` doesn't match the secret set on the
  Vapi assistant's server config.
- **"technical difficulty" replies**: the Python policy backend isn't reachable
  at `AI_BACKEND_URL`. `npm run channel:voice` starts it on port 8000.
- **Calls not in dashboard**: check `SUPABASE_SERVICE_ROLE_KEY` and that Vapi is
  posting events to `<PUBLIC_URL>/vapi/webhook`.
