import "dotenv/config";
import express from "express";
import { createServer } from "http";
import cors from "cors";
import helmet from "helmet";
import axios from "axios";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";

import { logger, correlationMiddleware } from "./lib/logger.js";
import { requireAuth, requireRole } from "./lib/auth.js";
import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  RateLimitError,
  ExternalServiceError,
  DatabaseError,
  ErrorCodes,
  formatErrorResponse,
  asyncHandler,
} from "./lib/errors.js";
import { Schemas, validateBody } from "./lib/validation.js";
import { responseFormatterMiddleware } from "./lib/response.js";
import {
  buildCorsOptions,
  ipRateLimiter,
  sessionRateLimiter,
  verifyVapiSignature,
  verifyWhatsAppSignature,
} from "./lib/security.js";
import {
  metricsMiddleware,
  registerObservabilityRoutes,
  escalationsTotal,
} from "./lib/metrics.js";
import {
  getSession,
  saveSession,
  deleteSession,
  appendTurn,
  isDuplicate,
  isRedisHealthy,
} from "./lib/redis.js";
import { synthesize, getTtsProvider } from "./lib/tts.js";
import {
  signExistingPath,
  isMediaConfigured,
} from "./lib/media.js";
import {
  startCall,
  recordCallTurn,
  endCall,
  isCallSessionConfigured,
} from "./lib/callSessions.js";

const app = express();
app.set("trust proxy", 1); // accurate req.ip behind reverse proxy / load balancer
const httpServer = createServer(app);

// Prefer dedicated env var to avoid conflicts with generic PORT in some environments
const port = Number(
  process.env.VOICE_SERVER_PORT ||
    process.env.TWILIO_SERVER_PORT ||
    process.env.PORT ||
    3001,
);

import { validateStartup } from "./lib/startup.js";

// Validate critical configuration at startup
const startupResult = validateStartup();
if (!startupResult.valid) {
  logger.error("Critical configuration missing. Server may not function correctly.");
  // Log detailed errors for debugging
  for (const error of startupResult.errors) {
    logger.error(error.message);
  }
}

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
if (!OPENROUTER_KEY) {
  logger.warn(
    "OPENROUTER_API_KEY is not set. AI responses will fail until it is configured in the environment.",
  );
}
// Capable, free, Arabic-strong models on OpenRouter. We send up to 3 as a
// `models` array so OpenRouter automatically fails over when one is rate-limited
// (the old single model `arcee-ai/trinity-large-preview:free` was discontinued -> 404).
const PRIMARY_MODEL =
  process.env.OPENROUTER_MODEL || "google/gemma-4-31b-it:free";
const FALLBACK_MODELS = (
  process.env.OPENROUTER_FALLBACK_MODELS ||
  "meta-llama/llama-3.3-70b-instruct:free,qwen/qwen3-next-80b-a3b-instruct:free"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const MODEL_LIST = [PRIMARY_MODEL, ...FALLBACK_MODELS].slice(0, 3); // OpenRouter caps at 3
const MODEL_NAME = PRIMARY_MODEL; // for display/diagnostics

// NOTE: The bank system prompt and policy live ONLY in the FastAPI backend
// (app/core/llm.py + app/core/decision_engine.py). The voice channel calls
// /api/v1/assistant/reply, so no duplicated bank facts/policy exist here.

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
);

// Memory store removed: session/dedup state now lives in Redis (server/lib/redis.js)

// --- Security & observability middleware ---
app.use(helmet());
app.use(cors(buildCorsOptions()));

// Capture the raw body so webhook signatures can be verified before parsing.
const rawBodySaver = (req, res, buf) => {
  if (buf && buf.length) req.rawBody = buf;
};
app.use(express.json({ limit: "1mb", verify: rawBodySaver }));
app.use(
  express.urlencoded({ extended: true, limit: "1mb", verify: rawBodySaver }),
);

app.use(correlationMiddleware);
app.use(metricsMiddleware);
app.use(responseFormatterMiddleware);

// Global IP rate limit (G14). Health/metrics are exempted below by ordering.
registerObservabilityRoutes(app);
app.use(ipRateLimiter);

// --- Vapi (voice provider) -------------------------------------------------
// Vapi owns the realtime voice pipeline: telephony (inbound + outbound), speech
// recognition, and text-to-speech. This server is Vapi's "brain": Vapi calls our
// OpenAI-compatible custom-LLM endpoint (POST /vapi/chat/completions) for every
// turn, and posts call-lifecycle events to POST /vapi/webhook so calls appear in
// the dashboard. Outbound calls are placed via Vapi's REST API below.
const VAPI_API_KEY = process.env.VAPI_API_KEY; // private/server key
const VAPI_ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID;
const VAPI_PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID;
const VAPI_PUBLIC_KEY = process.env.VAPI_PUBLIC_KEY; // browser (web) calls
const VAPI_API_BASE = process.env.VAPI_API_BASE || "https://api.vapi.ai";

if (!VAPI_API_KEY) {
  logger.warn(
    "VAPI_API_KEY is not set. Outbound voice calls will fail until it is configured.",
  );
}

// Place an outbound phone call through Vapi. Returns the created call object.
async function createVapiCall({ to, assistantId, phoneNumberId }) {
  const { data } = await axios.post(
    `${VAPI_API_BASE}/call`,
    {
      assistantId: assistantId || VAPI_ASSISTANT_ID,
      phoneNumberId: phoneNumberId || VAPI_PHONE_NUMBER_ID,
      customer: { number: to },
    },
    {
      headers: {
        Authorization: `Bearer ${VAPI_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    },
  );
  return data;
}

// Mint a short-lived service token for the trusted Node -> FastAPI call. The
// policy backend protects /api/v1/* with verify_jwt (HS256 over the shared
// SUPABASE_JWT_SECRET, requiring an authorized role_name). This is a
// server-to-server call with no end-user token, so we sign our own with the
// same shared secret. It is NOT a Supabase user token — just the internal
// shared-secret handshake both services already agree on.
function mintServiceToken() {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) return null;
  return jwt.sign(
    {
      sub: "voice-service",
      email: "voice@connect-hub.local",
      role_name: "agent",
    },
    secret,
    { algorithm: "HS256", expiresIn: "5m" },
  );
}

async function getAIResponse(userMessage, history = [], meta = {}) {
  // The Palestinian Islamic Bank AI/policy layer is authoritative and lives in
  // the FastAPI backend. The voice channel does NOT hold bank facts or policy
  // prompts; it delegates to /api/v1/assistant/reply so WhatsApp, web chat and
  // voice all receive the SAME central decision and a validated, masked reply.
  const backendUrl = process.env.AI_BACKEND_URL || "http://127.0.0.1:3001";
  try {
    const serviceToken = mintServiceToken();
    const headers = { "Content-Type": "application/json" };
    if (serviceToken) headers.Authorization = `Bearer ${serviceToken}`;
    const response = await axios.post(
      `${backendUrl}/api/v1/assistant/reply`,
      { text: userMessage, channel: "voice", history },
      { headers, timeout: 25000 },
    );
    // Surface the central decision so callers (e.g. the voice flow) can reflect
    // an agent handover in the dashboard. `meta` is an optional out-parameter.
    meta.escalate = !!response.data?.escalate;
    meta.intent = response.data?.intent || null;
    meta.decision = response.data?.decision || null;
    const message = response.data?.message;
    if (!message) {
      logger.warn(
        { data: response.data },
        "[LLM] Empty reply from policy backend",
      );
      return "عذراً، لم أتمكن من معالجة طلبك حالياً. يرجى المحاولة بعد قليل.";
    }
    if (response.data?.escalate) {
      logger.info(
        { reason: response.data?.escalation_summary },
        "[Policy] Voice turn escalated",
      );
    }
    return message;
  } catch (error) {
    const status = error.response?.status;
    const detail = error.response?.data || error.message;
    logger.error({ status, detail }, "[LLM] Policy backend request failed");
    return "عذراً، أواجه صعوبة تقنية مؤقتة. يرجى المحاولة مرة أخرى.";
  }
}

// Bank Logic Helpers
async function getBankAccount(phone) {
  const { data } = await supabase
    .from("bank_accounts")
    .select("*")
    .eq("owner_phone", phone)
    .single();
  return data;
}

async function sendOTP(phone) {
  // Use a CSPRNG (not Math.random) for verification codes (A02: weak PRNG).
  const otp = crypto.randomInt(1000, 10000).toString();

  // 1. Create In-App Notification (For free testing in Dashboard)
  // SECURITY: never put the OTP value in the notification body. The dashboard
  // is visible to agents; embedding the code would let any agent read it and
  // defeat the verification step. Only record that a code was sent.
  try {
    await supabase.from("notifications").insert({
      title: "🔑 PIB Verification OTP",
      message: `A verification code was sent to ${phone}.`,
      type: "info",
      is_read: false,
    });
    console.log(`[Supabase] In-app OTP notification recorded for ${phone}`);
  } catch (e) {
    console.error("[Supabase Notification Error]:", e.message);
  }

  // 2. SMS OTP delivery is disabled (no SMS provider). OTPs are delivered via
  //    the in-app notification above and WhatsApp below.

  // 3. Try WhatsApp OTP (Using Security Number)
  if (
    process.env.SECURITY_WHATSAPP_PHONE_NUMBER_ID &&
    process.env.SECURITY_WHATSAPP_ACCESS_TOKEN
  ) {
    try {
      const wa_url = `https://graph.facebook.com/v24.0/${process.env.SECURITY_WHATSAPP_PHONE_NUMBER_ID}/messages`;
      const wa_response = await fetch(wa_url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.SECURITY_WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: phone,
          type: "text",
          text: {
            body: `الرمز الخاص بك للتحقق من بيانات الحساب في البنك الإسلامي الفلسطيني هو: ${otp}. يرجى عدم مشاركته مع أحد.`,
          },
        }),
      });
      const wa_data = await wa_response.json();
      if (wa_response.ok) {
        console.log(`[WhatsApp OTP] Successfully sent OTP to ${phone}`);
      } else {
        console.error(`[WhatsApp OTP Error]:`, wa_data);
      }
    } catch (e) {
      console.error(`[WhatsApp OTP Exception]:`, e.message);
    }
  } else {
    console.log(
      `[OTP] WhatsApp Security Credentials missing in .env. Skipping WhatsApp delivery.`,
    );
  }

  return otp;
}

// Modified Message Handler with Verification State (Redis-backed)
async function processMessage(
  userMessage,
  sessionId,
  phone = null,
  history = [],
  meta = {},
) {
  const session = (await getSession(sessionId)) || {};
  const state = session.otpState;

  // Case 1: Waiting for OTP
  if (state && state.type === "WAITING_OTP") {
    // Expire codes after 5 minutes (A07: limit the validity window).
    const OTP_TTL_MS = 5 * 60 * 1000;
    if (!state.timestamp || Date.now() - state.timestamp > OTP_TTL_MS) {
      await deleteSession(sessionId);
      return "انتهت صلاحية رمز التحقق. يرجى طلب البيانات مرة أخرى للحصول على رمز جديد.";
    }

    // Allow the user to cancel at any point.
    if (userMessage.includes("الغاء") || userMessage.includes("cancel")) {
      await deleteSession(sessionId);
      return "تم إلغاء طلب التحقق. كيف يمكنني مساعدتك بشكل عام؟";
    }

    const digits = userMessage.replace(/\D/g, "");
    // Constant-time compare to avoid leaking match progress via timing.
    const otpBuf = Buffer.from(String(state.otp));
    const inputBuf = Buffer.from(digits);
    const isMatch =
      otpBuf.length === inputBuf.length &&
      crypto.timingSafeEqual(otpBuf, inputBuf);

    if (isMatch) {
      const account = await getBankAccount(state.phone);
      await deleteSession(sessionId);
      if (account) {
        return `تم التحقق بنجاح! سيد ${account.owner_name}، رصيد حسابك هو ${account.balance} ${account.currency}. رقم حسابك: ${account.account_number}. هل هناك شيء آخر؟`;
      }
      return "تم التحقق، ولكن لم نجد بيانات الحساب.";
    }

    // Wrong code: enforce a max attempt limit (A07: brute-force protection).
    const MAX_OTP_ATTEMPTS = 5;
    const attempts = (state.attempts || 0) + 1;
    if (attempts >= MAX_OTP_ATTEMPTS) {
      await deleteSession(sessionId);
      return "لقد تجاوزت عدد المحاولات المسموح بها. تم إلغاء طلب التحقق لأسباب أمنية. يرجى المحاولة لاحقاً.";
    }
    await saveSession(sessionId, {
      ...session,
      otpState: { ...state, attempts },
    });
    return "رمز التحقق غير صحيح. يرجى المحاولة مرة أخرى أو قول 'إلغاء'.";
  }

  // Case 2: Regular LLM with Trigger Check
  const aiResponse = await getAIResponse(userMessage, history, meta);

  // Check if user is asking for account details
  const accountKeywords = [
    "رصيدي",
    "حسابي",
    "balance",
    "account",
    "my data",
    "بياناتي",
  ];
  const isAskingAccount = accountKeywords.some((k) =>
    userMessage.toLowerCase().includes(k),
  );

  if (isAskingAccount) {
    if (!phone) {
      return "للأسف، لا يمكنني التحقق من هويتك عبر هذا الشات المباشر دون رقم هاتف. يرجى الاتصال بنا هاتفياً أو تزويدي برقمك المسجل.";
    }

    const account = await getBankAccount(phone);
    if (account) {
      const otp = await sendOTP(phone);
      if (otp) {
        await saveSession(sessionId, {
          ...session,
          otpState: { type: "WAITING_OTP", otp, phone, timestamp: Date.now() },
        });
        return "لقد قمت بإرسال رمز تحقق (OTP) إلى هاتفك المسجل لدينا. يرجى تزويدي بالرمز لنتمكن من عرض بيانات حسابك بأمان.";
      } else {
        return "عذراً، واجهت مشكلة في إرسال رمز التحقق. يرجى المحاولة لاحقاً.";
      }
    } else {
      return "عذراً، لم أجد حساباً مرتبطاً برقم الهاتف هذا في قاعدة بياناتنا.";
    }
  }

  return aiResponse;
}

// Log Call to Supabase
async function saveCallLog(callSid, userText, aiText, audioPath, ttsProvider) {
  try {
    await supabase.from("call_logs").insert({
      call_sid: callSid,
      user_text: userText,
      ai_text: aiText,
      // Store the PRIVATE storage path (not a public URL). Access via signed URL.
      ai_audio_url: audioPath || `tts://${ttsProvider}`,
    });
  } catch (e) {
    console.error("Supabase Log Error:", e.message);
  }
}

// --- Routes ---

app.get("/", (req, res) => res.send("Bank AI (Vapi Voice)"));
app.get("/voice", (req, res) => res.send("Voice channel: Vapi"));

// --- Vapi custom-LLM endpoint (the "brain" of every voice turn) ------------
// Vapi runs speech-to-text and text-to-speech itself, then calls this
// OpenAI-compatible endpoint for the assistant's reply. Configure the Vapi
// assistant's model as: provider "custom-llm", url "<PUBLIC_URL>/vapi",
// which makes Vapi POST to `<url>/chat/completions`.
//
// We ignore the raw model prompt and instead delegate to the authoritative
// bank policy layer via processMessage(), exactly like WhatsApp and web chat,
// so all channels share ONE central decision. The reply is streamed back as
// Server-Sent Events because Vapi requests streaming completions.
app.post(
  "/vapi/chat/completions",
  verifyVapiSignature,
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const messages = Array.isArray(body.messages) ? body.messages : [];

    // Vapi passes the live call so we can key the dashboard session on it.
    const call = body.call || {};
    const callId = call.id || body.metadata?.callId || `vapi-${Date.now()}`;
    const phone =
      call.customer?.number ||
      call.phoneNumber?.number ||
      body.phoneNumber ||
      null;

    // The latest user turn is sent as `text`; everything before it becomes the
    // history for the policy backend (so the current turn is not duplicated).
    let lastUserIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        lastUserIdx = i;
        break;
      }
    }
    const userText =
      lastUserIdx >= 0
        ? messages[lastUserIdx].content?.toString().trim() || ""
        : "";
    const history = messages
      .slice(0, lastUserIdx >= 0 ? lastUserIdx : messages.length)
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content }));

    const meta = {};
    const aiText = userText
      ? await processMessage(userText, callId, phone, history, meta)
      : "أهلاً بك في البنك الإسلامي الفلسطيني، كيف بقدر أساعدك؟";

    // Mirror the turn into the dashboard (caller speech + AI reply) and reflect
    // an agent handover as an "escalated" session. Non-blocking.
    recordCallTurn({
      callSid: callId,
      phone,
      userText,
      aiText,
      escalated: !!meta.escalate,
    }).catch(() => {});
    saveCallLog(callId, userText, aiText, null, getTtsProvider());

    const created = Math.floor(Date.now() / 1000);
    const id = `chatcmpl-${crypto.randomUUID()}`;
    const model = body.model || "connect-hub-policy";

    // Non-streaming clients may set stream:false; honour both.
    if (body.stream === false) {
      return res.json({
        id,
        object: "chat.completion",
        created,
        model,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: aiText },
            finish_reason: "stop",
          },
        ],
      });
    }

    // Stream a single content chunk followed by the completion sentinel.
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    const chunk = (delta, finish = null) => ({
      id,
      object: "chat.completion.chunk",
      created,
      model,
      choices: [{ index: 0, delta, finish_reason: finish }],
    });
    res.write(`data: ${JSON.stringify(chunk({ role: "assistant" }))}\n\n`);
    res.write(`data: ${JSON.stringify(chunk({ content: aiText }))}\n\n`);
    res.write(`data: ${JSON.stringify(chunk({}, "stop"))}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  }),
);

// --- Vapi server webhook (call lifecycle events) ---------------------------
// Vapi posts every server event here as { message: { type, ... } }. We use it
// to surface calls in the dashboard: create the session when a call starts and
// close it when the call ends. Turn-by-turn content is captured in the
// custom-LLM endpoint above. Always ack with 200 so Vapi does not retry.
app.post(
  "/vapi/webhook",
  verifyVapiSignature,
  asyncHandler(async (req, res) => {
    const message = req.body?.message || {};
    const type = message.type;
    const call = message.call || {};
    const callId = call.id;
    const phone =
      call.customer?.number || call.phoneNumber?.number || null;

    switch (type) {
      case "status-update": {
        // "in-progress" => call answered; anything terminal => call ended.
        if (message.status === "in-progress" && callId) {
          startCall({ callSid: callId, phone }).catch(() => {});
        } else if (
          ["ended", "forwarding", "busy", "no-answer"].includes(
            message.status,
          ) &&
          callId
        ) {
          endCall({ callSid: callId }).catch(() => {});
        }
        break;
      }
      case "end-of-call-report": {
        if (callId) endCall({ callSid: callId }).catch(() => {});
        break;
      }
      case "assistant-request": {
        // Tell Vapi which assistant should handle this inbound call.
        if (VAPI_ASSISTANT_ID) {
          return res.json({ assistantId: VAPI_ASSISTANT_ID });
        }
        break;
      }
      default:
        break;
    }
    return res.json({ received: true });
  }),
);

// Public Vapi config for the browser voice widget. The PUBLIC key is safe to
// expose to the client (that is its purpose); the private VAPI_API_KEY never
// leaves the server. Gated behind agent auth to match the old /api/token.
app.get(
  "/api/vapi/config",
  requireAuth,
  requireRole("agent"),
  (req, res, next) => {
    if (!VAPI_PUBLIC_KEY || !VAPI_ASSISTANT_ID) {
      const missing = [];
      if (!VAPI_PUBLIC_KEY) missing.push("VAPI_PUBLIC_KEY");
      if (!VAPI_ASSISTANT_ID) missing.push("VAPI_ASSISTANT_ID");
      return next(
        new ExternalServiceError(
          "Vapi",
          `Missing configuration: ${missing.join(", ")}`,
        ),
      );
    }
    res.success({
      publicKey: VAPI_PUBLIC_KEY,
      assistantId: VAPI_ASSISTANT_ID,
    });
  },
);

// Outbound AI call via Vapi's REST API.
app.post(
  "/api/make-call",
  requireAuth,
  requireRole("agent"),
  validateBody(Schemas.makeCall),
  asyncHandler(async (req, res) => {
    const { to } = req.body;

    if (!VAPI_API_KEY || !VAPI_PHONE_NUMBER_ID || !VAPI_ASSISTANT_ID) {
      const missing = [];
      if (!VAPI_API_KEY) missing.push("VAPI_API_KEY");
      if (!VAPI_PHONE_NUMBER_ID) missing.push("VAPI_PHONE_NUMBER_ID");
      if (!VAPI_ASSISTANT_ID) missing.push("VAPI_ASSISTANT_ID");
      throw new ExternalServiceError(
        "Vapi",
        `Missing configuration: ${missing.join(", ")}`,
      );
    }

    logger.info({ to: to.slice(-4) }, "Initiating outbound AI call (Vapi)");
    try {
      const call = await createVapiCall({ to });
      res.success({ success: true, sid: call.id });
    } catch (error) {
      const detail = error.response?.data || error.message;
      req.log?.error({ err: detail }, "Vapi outbound call failed");
      throw new ExternalServiceError("Vapi", "Failed to place outbound call");
    }
  }),
);

app.post("/api/chat", sessionRateLimiter, validateBody(Schemas.chatMessage), asyncHandler(async (req, res) => {
  const { message, history, sessionId, phone } = req.body;
  const sessionKey = sessionId || "web-chat-default";

  await appendTurn(sessionKey, "user", message);
  const response = await processMessage(
    message,
    sessionKey,
    phone,
    history || [],
  );
  await appendTurn(sessionKey, "assistant", response);
  
  res.success({ content: response });
}));

// --- Dev-only diagnostics & test endpoints --------------------------------
// These bypass Twilio signature checks and auth so the frontend "Backend Tester"
// page (and scripts/simulate-call.mjs) can exercise the chat / voice / TTS paths
// WITHOUT placing real Twilio calls (zero credits). Enabled automatically in
// non-production; to expose them on a deployed/production backend (e.g. so the
// Vercel frontend can reach them), set ENABLE_TEST_ENDPOINTS=true.
const TEST_ENDPOINTS_ENABLED =
  process.env.NODE_ENV !== "production" ||
  process.env.ENABLE_TEST_ENDPOINTS === "true";
if (TEST_ENDPOINTS_ENABLED) {
  if (process.env.NODE_ENV === "production") {
    logger.warn(
      "ENABLE_TEST_ENDPOINTS=true in production: /api/test/* are reachable without auth. Disable when not demoing.",
    );
  }
  // Config snapshot (no secret values, just whether each is configured).
  app.get("/api/test/status", async (req, res) => {
    // The actual answering model lives in the Python AI backend (this Node
    // server only delegates to it). Ask it for the live model/provider so the
    // tester shows the truth (e.g. deepseek-v4-pro) instead of the local
    // OpenRouter fallback display value.
    const aiBackendUrl = process.env.AI_BACKEND_URL || "http://127.0.0.1:3001";
    let aiBackend = {
      reachable: false,
      url: aiBackendUrl,
      model: null,
      provider: null,
    };
    try {
      const r = await axios.get(`${aiBackendUrl}/health`, { timeout: 3000 });
      aiBackend = {
        reachable: true,
        url: aiBackendUrl,
        model: r.data?.ai_model || null,
        provider: r.data?.ai_provider || null,
      };
    } catch {
      // AI backend unreachable -> fall back to local display values below.
    }
    res.json({
      ok: true,
      env: process.env.NODE_ENV || "development",
      model: aiBackend.model || MODEL_NAME,
      models: MODEL_LIST,
      aiBackend,
      ttsProvider: getTtsProvider(),
      redisHealthy: isRedisHealthy(),
      mediaConfigured: isMediaConfigured(),
      vapiSignatureValidation: Boolean(process.env.VAPI_SERVER_SECRET),
      providers: {
        openrouter: Boolean(OPENROUTER_KEY),
        supabase: Boolean(process.env.VITE_SUPABASE_URL),
        vapi: Boolean(VAPI_API_KEY && VAPI_ASSISTANT_ID),
        whatsappOtp: Boolean(
          process.env.SECURITY_WHATSAPP_PHONE_NUMBER_ID &&
          process.env.SECURITY_WHATSAPP_ACCESS_TOKEN,
        ),
        azureTts: Boolean(
          process.env.AZURE_TTS_KEY && process.env.AZURE_TTS_REGION,
        ),
        elevenlabs: Boolean(
          process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID,
        ),
        edgeTts: Boolean(process.env.EDGE_TTS_URL),
      },
    });
  });

  // Simulate one voice turn the way Twilio would (speech -> AI reply), but over
  // JSON and with NO signature requirement. Optionally returns synthesized audio.
  app.post("/api/test/voice", async (req, res) => {
    const { message, sessionId, phone, speak } = req.body || {};
    if (!message)
      return res.status(400).json({ error: "Missing 'message' field" });
    const sessionKey = sessionId || `test-voice-${Date.now()}`;
    try {
      const aiText = await processMessage(message, sessionKey, phone || null);
      let audio = null;
      if (speak) {
        const out = await synthesize(aiText, { lang: "ar" });
        if (out?.buffer) {
          audio = {
            contentType: out.contentType,
            provider: out.provider,
            base64: out.buffer.toString("base64"),
          };
        }
      }
      res.json({
        userText: message,
        aiText,
        ttsProvider: getTtsProvider(),
        audio,
      });
    } catch (err) {
      req.log?.error({ err: err.message }, "test/voice error");
      res.status(500).json({ error: err.message });
    }
  });

  // Synthesize arbitrary text and stream back the audio bytes (tests TTS only).
  app.post("/api/test/tts", async (req, res) => {
    const { text } = req.body || {};
    if (!text) return res.status(400).json({ error: "Missing 'text' field" });
    try {
      const out = await synthesize(text, { lang: "ar" });
      if (!out?.buffer) {
        return res.status(503).json({
          error: `TTS provider "${getTtsProvider()}" returned no audio. For free local audio set TTS_PROVIDER=edge and run the edge-tts server (npm run backend).`,
        });
      }
      res.type(out.contentType).send(out.buffer);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  logger.info(
    "Dev test endpoints enabled: /api/test/status, /api/test/voice, /api/test/tts",
  );
}

app.post("/api/sms", requireAuth, requireRole("agent"), asyncHandler(async (req, res) => {
  const { to, message } = req.body;
  if (!to || !message) {
    return res.badRequest("Missing 'to' or 'message' field.");
  }

  logger.info({ to: to.slice(-4) }, "Manual SMS requested (disabled for credit safety)");
  
  res.success({
    success: true,
    sid: "SMS_DISABLED_CREDIT_SAFETY",
    note: "Use the Notification Bell for OTPs",
  });
}));

// --- Private media access via short-lived signed URLs (G27) ---
// Role check happens BEFORE signing, so only authorized agents can read media.
app.get(
  "/api/media/sign",
  requireAuth,
  requireRole("agent"),
  asyncHandler(async (req, res) => {
    const path = req.query.path;
    if (!path || typeof path !== "string") {
      return res.badRequest("Missing 'path' query parameter.");
    }
    if (!isMediaConfigured()) {
      return res.serviceUnavailable("Media storage");
    }
    const signedUrl = await signExistingPath(path);
    if (!signedUrl) {
      return res.notFound("Requested media object");
    }
    return res.success({ url: signedUrl });
  }),
);

// --- WhatsApp Cloud API webhook (G23) ---
// GET: Meta verification handshake.
app.get("/webhook/whatsapp", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (
    mode === "subscribe" &&
    token &&
    token === process.env.WHATSAPP_VERIFY_TOKEN
  ) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// POST: signature is verified against the raw body BEFORE any processing.
app.post("/webhook/whatsapp", verifyWhatsAppSignature, async (req, res) => {
  // Respond 200 quickly so Meta does not retry; process asynchronously.
  res.sendStatus(200);
  try {
    const entry = req.body?.entry?.[0]?.changes?.[0]?.value;
    const msg = entry?.messages?.[0];
    if (!msg || msg.type !== "text") return;

    // Deduplicate by WhatsApp message id (state lives in Redis, not memory).
    if (await isDuplicate("whatsapp", msg.id)) {
      req.log?.info(
        { messageId: msg.id },
        "Duplicate WhatsApp message ignored",
      );
      return;
    }

    const from = msg.from;
    const text = msg.text?.body || "";
    await appendTurn(from, "user", text);
    const reply = await processMessage(text, from, from);
    await appendTurn(from, "assistant", reply);

    if (
      process.env.SECURITY_WHATSAPP_PHONE_NUMBER_ID &&
      process.env.SECURITY_WHATSAPP_ACCESS_TOKEN
    ) {
      const url = `https://graph.facebook.com/v24.0/${process.env.SECURITY_WHATSAPP_PHONE_NUMBER_ID}/messages`;
      await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.SECURITY_WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: from,
          type: "text",
          text: { body: reply },
        }),
      });
    }
  } catch (err) {
    req.log?.error({ err: err.message }, "WhatsApp webhook processing error");
  }
});

// NOTE: The realtime streaming voice path (barge-in, media streams) is now
// handled entirely by Vapi. Vapi runs STT/TTS and the low-latency audio loop,
// calling POST /vapi/chat/completions for each turn, so no in-process
// WebSocket bridge is needed here anymore.

// --- Global Error Handler -------------------------------------------------
// Must be registered AFTER all routes so it catches errors from any handler

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // Log the error with context
  req.log?.error(
    {
      err: {
        message: err.message,
        code: err.code,
        statusCode: err.statusCode,
        stack: err.isOperational ? undefined : err.stack,
      },
    },
    "Request error"
  );

  // Handle known operational errors
  if (err instanceof AppError) {
    const response = formatErrorResponse(err, req.correlationId);
    if (err instanceof RateLimitError && err.retryAfter) {
      res.set("Retry-After", err.retryAfter);
    }
    return res.status(err.statusCode).json(response);
  }

  // Handle upstream rate-limit errors (e.g. voice/AI providers)
  if (err.code === 20429 || err.status === 429) {
    return res.status(429).json(
      formatErrorResponse(
        new RateLimitError(60),
        req.correlationId
      )
    );
  }

  // Handle JSON parsing errors
  if (err.type === "entity.parse.failed") {
    return res.status(400).json(
      formatErrorResponse(
        new ValidationError("Invalid JSON in request body"),
        req.correlationId
      )
    );
  }

  // Handle payload too large
  if (err.type === "entity.too.large") {
    return res.status(413).json(
      formatErrorResponse(
        new ValidationError("Request payload too large. Maximum is 1MB."),
        req.correlationId
      )
    );
  }

  // Unknown error - return generic message without leaking details
  logger.error({ err: err.stack }, "Unhandled error");
  return res.status(500).json(
    formatErrorResponse(
      new AppError("An unexpected error occurred. Please try again.", 500, ErrorCodes.INTERNAL_ERROR),
      req.correlationId
    )
  );
});

// --- 404 Handler for unmatched routes --------------------------------------
app.use((req, res) => {
  res.status(404).json(
    formatErrorResponse(
      new NotFoundError("Endpoint"),
      req.correlationId
    )
  );
});

httpServer.listen(port, "0.0.0.0", () =>
  logger.info({ port, tts: getTtsProvider() }, "Node voice/API server started"),
);
