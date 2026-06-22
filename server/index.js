import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import twilio from 'twilio';
import cors from 'cors';
import helmet from 'helmet';
import axios from 'axios';
import { Buffer } from 'buffer';
import { createClient } from '@supabase/supabase-js';

import { logger, correlationMiddleware } from './lib/logger.js';
import { requireAuth, requireRole } from './lib/auth.js';
import {
    buildCorsOptions,
    ipRateLimiter,
    sessionRateLimiter,
    validateTwilioSignature,
    verifyWhatsAppSignature,
} from './lib/security.js';
import {
    metricsMiddleware,
    registerObservabilityRoutes,
    escalationsTotal,
} from './lib/metrics.js';
import {
    getSession,
    saveSession,
    deleteSession,
    appendTurn,
    isDuplicate,
    isRedisHealthy,
} from './lib/redis.js';
import { synthesize, synthesizeNatural, getTtsProvider } from './lib/tts.js';
import { uploadAndSign, signExistingPath, isMediaConfigured } from './lib/media.js';
import { attachVoiceStream } from './lib/voiceStream.js';

const app = express();
app.set('trust proxy', 1); // accurate req.ip behind reverse proxy / load balancer
const httpServer = createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Prefer dedicated env var to avoid conflicts with generic PORT in some environments
const port = Number(process.env.TWILIO_SERVER_PORT || process.env.PORT || 3001);

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
if (!OPENROUTER_KEY) {
    console.warn("[Config] OPENROUTER_API_KEY is not set. AI responses will fail until it is configured in the environment.");
}
// Capable, free, Arabic-strong models on OpenRouter. We send up to 3 as a
// `models` array so OpenRouter automatically fails over when one is rate-limited
// (the old single model `arcee-ai/trinity-large-preview:free` was discontinued -> 404).
const PRIMARY_MODEL = process.env.OPENROUTER_MODEL || 'google/gemma-4-31b-it:free';
const FALLBACK_MODELS = (
    process.env.OPENROUTER_FALLBACK_MODELS ||
    'meta-llama/llama-3.3-70b-instruct:free,qwen/qwen3-next-80b-a3b-instruct:free'
)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
const MODEL_LIST = [PRIMARY_MODEL, ...FALLBACK_MODELS].slice(0, 3); // OpenRouter caps at 3
const MODEL_NAME = PRIMARY_MODEL; // for display/diagnostics

// NOTE: The bank system prompt and policy live ONLY in the FastAPI backend
// (app/core/llm.py + app/core/decision_engine.py). The voice channel calls
// /api/v1/assistant/reply, so no duplicated bank facts/policy exist here.

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY);

// Memory store removed: session/dedup state now lives in Redis (server/lib/redis.js)

// --- Security & observability middleware ---
app.use(helmet());
app.use(cors(buildCorsOptions()));

// Capture the raw body so webhook signatures can be verified before parsing.
const rawBodySaver = (req, res, buf) => {
    if (buf && buf.length) req.rawBody = buf;
};
app.use(express.json({ limit: '1mb', verify: rawBodySaver }));
app.use(express.urlencoded({ extended: true, limit: '1mb', verify: rawBodySaver }));

app.use(correlationMiddleware);
app.use(metricsMiddleware);

// Global IP rate limit (G14). Health/metrics are exempted below by ordering.
registerObservabilityRoutes(app);
app.use(ipRateLimiter);

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function getAIResponse(userMessage, history = []) {
    // The Palestinian Islamic Bank AI/policy layer is authoritative and lives in
    // the FastAPI backend. The voice channel does NOT hold bank facts or policy
    // prompts; it delegates to /api/v1/assistant/reply so WhatsApp, web chat and
    // voice all receive the SAME central decision and a validated, masked reply.
    const backendUrl = process.env.AI_BACKEND_URL || 'http://127.0.0.1:5000';
    try {
        const response = await axios.post(
            `${backendUrl}/api/v1/assistant/reply`,
            { text: userMessage, channel: 'voice', history },
            { headers: { 'Content-Type': 'application/json' }, timeout: 25000 }
        );
        const message = response.data?.message;
        if (!message) {
            logger.warn({ data: response.data }, '[LLM] Empty reply from policy backend');
            return "عذراً، لم أتمكن من معالجة طلبك حالياً. يرجى المحاولة بعد قليل.";
        }
        if (response.data?.escalate) {
            logger.info({ reason: response.data?.escalation_summary }, '[Policy] Voice turn escalated');
        }
        return message;
    } catch (error) {
        const status = error.response?.status;
        const detail = error.response?.data || error.message;
        logger.error({ status, detail }, '[LLM] Policy backend request failed');
        return "عذراً، أواجه صعوبة تقنية مؤقتة. يرجى المحاولة مرة أخرى.";
    }
}

// Bank Logic Helpers
async function getBankAccount(phone) {
    const { data } = await supabase.from('bank_accounts').select('*').eq('owner_phone', phone).single();
    return data;
}

async function sendOTP(phone) {
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    console.log(`[OTP] Generated ${otp} for ${phone}`);

    // 1. Create In-App Notification (For free testing in Dashboard)
    try {
        await supabase.from('notifications').insert({
            title: "🔑 PIB Verification OTP",
            message: `The OTP for phone ${phone} is: ${otp}`,
            type: "info",
            is_read: false
        });
        console.log(`[Supabase] In-app notification sent for OTP ${otp}`);
    } catch (e) {
        console.error("[Supabase Notification Error]:", e.message);
    }

    // 2. Twilio SMS Disabled to save credits
    /*
    try {
        await client.messages.create({
            body: `رمز التحقق الخاص بك هو: ${otp}. يرجى عدم مشاركته مع أحد.`,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: phone
        });
        return otp;
    } catch (e) {
        console.error("[Twilio SMS Error]:", e.message);
        return otp;
    }
    */
    // 3. New: Try WhatsApp OTP (Using Security Number)
    if (process.env.SECURITY_WHATSAPP_PHONE_NUMBER_ID && process.env.SECURITY_WHATSAPP_ACCESS_TOKEN) {
        try {
            const wa_url = `https://graph.facebook.com/v24.0/${process.env.SECURITY_WHATSAPP_PHONE_NUMBER_ID}/messages`;
            const wa_response = await fetch(wa_url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.SECURITY_WHATSAPP_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messaging_product: "whatsapp",
                    to: phone,
                    type: "text",
                    text: { body: `الرمز الخاص بك للتحقق من بيانات الحساب في البنك الإسلامي الفلسطيني هو: ${otp}. يرجى عدم مشاركته مع أحد.` }
                })
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
        console.log(`[OTP] WhatsApp Security Credentials missing in .env. Skipping WhatsApp delivery.`);
    }

    return otp;
}

// Modified Message Handler with Verification State (Redis-backed)
async function processMessage(userMessage, sessionId, phone = null, history = []) {
    const session = (await getSession(sessionId)) || {};
    const state = session.otpState;

    // Case 1: Waiting for OTP
    if (state && state.type === 'WAITING_OTP') {
        const digits = userMessage.replace(/\D/g, '');
        if (digits === state.otp) {
            const account = await getBankAccount(state.phone);
            await deleteSession(sessionId);
            if (account) {
                return `تم التحقق بنجاح! سيد ${account.owner_name}، رصيد حسابك هو ${account.balance} ${account.currency}. رقم حسابك: ${account.account_number}. هل هناك شيء آخر؟`;
            }
            return "تم التحقق، ولكن لم نجد بيانات الحساب.";
        } else {
            // Check if user wants to cancel
            if (userMessage.includes("الغاء") || userMessage.includes("cancel")) {
                await deleteSession(sessionId);
                return "تم إلغاء طلب التحقق. كيف يمكنني مساعدتك بشكل عام؟";
            }
            return "رمز التحقق غير صحيح. يرجى المحاولة مرة أخرى أو قول 'إلغاء'.";
        }
    }

    // Case 2: Regular LLM with Trigger Check
    const aiResponse = await getAIResponse(userMessage, history);

    // Check if user is asking for account details
    const accountKeywords = ["رصيدي", "حسابي", "balance", "account", "my data", "بياناتي"];
    const isAskingAccount = accountKeywords.some(k => userMessage.toLowerCase().includes(k));

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
                    otpState: { type: 'WAITING_OTP', otp, phone, timestamp: Date.now() },
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

// Speak text into a TwiML node using the configured TTS provider.
// Generates audio -> stores in a PRIVATE bucket -> plays via a short-lived signed
// URL (G27). Falls back to Twilio's built-in Polly.Zeina <Say> if TTS/media is
// unavailable (G4 safe fallback). Returns the stored private path (or null).
async function sayOrPlay(node, text) {
    try {
        const audio = await synthesizeNatural(text, { lang: 'ar' });
        if (audio && isMediaConfigured()) {
            const stored = await uploadAndSign(audio.buffer, audio.contentType, 'tts');
            if (stored?.signedUrl) {
                node.play(stored.signedUrl);
                return stored.path;
            }
        }
    } catch (e) {
        logger.error({ err: e.message }, 'sayOrPlay TTS error; using Polly fallback');
    }
    node.say({ voice: 'Polly.Zeina', language: 'arb' }, text);
    return null;
}

// Log Call to Supabase
async function saveCallLog(callSid, userText, aiText, audioPath, ttsProvider) {
    try {
        await supabase.from('call_logs').insert({
            call_sid: callSid,
            user_text: userText,
            ai_text: aiText,
            // Store the PRIVATE storage path (not a public URL). Access via signed URL.
            ai_audio_url: audioPath || `tts://${ttsProvider}`
        });
    } catch (e) {
        console.error("Supabase Log Error:", e.message);
    }
}


// --- Routes ---

app.get('/', (req, res) => res.send('Bank AI v35 (Polly Only Flow)'));
app.get('/voice', (req, res) => res.send("Active at +19166596816"));

app.post('/voice', validateTwilioSignature, async (req, res) => {
    console.log("[Twilio] Inbound Call Handled");
    const twiml = new twilio.twiml.VoiceResponse();

    // The gathered speech will trigger the handle-speech endpoint
    const gather = twiml.gather({
        input: 'speech',
        language: 'ar-SA', // Fixed locale for robust Arabic recognition
        speechTimeout: 'auto',
        action: '/handle-speech'
    });

    // Natural neural greeting (Azure/edge), with Polly.Zeina as last-resort fallback.
    await sayOrPlay(gather, 'أهلاً بك في البنك الإسلامي الفلسطيني، كيف بقدر أساعدك؟');

    // If they don't say anything, wait and redirect
    twiml.say({ voice: 'Polly.Zeina', language: 'arb' }, 'هل ما زلت هنا؟ يرجى طرح سؤالك.');
    twiml.redirect('/voice');

    res.type('text/xml').send(twiml.toString());
});

app.post('/handle-speech', validateTwilioSignature, async (req, res) => {
    const userSpeech = req.body.SpeechResult;
    const callSid = req.body.CallSid;
    const fromPhone = req.body.From;

    console.log(`[Voice] Captured: "${userSpeech || 'Silence'}" from ${fromPhone}`);
    const twiml = new twilio.twiml.VoiceResponse();

    if (userSpeech) {
        console.log(`[Logic] Processing speech...`);
        const aiText = await processMessage(userSpeech, callSid, fromPhone);
        console.log(`[Logic] Result: ${aiText.substring(0, 100)}...`);

        const gather = twiml.gather({
            input: 'speech',
            language: 'ar-SA',
            speechTimeout: 'auto',
            action: '/handle-speech',
            interruptible: true
        });

        // Use the configured TTS provider (Azure by default); private signed-URL playback.
        const audioPath = await sayOrPlay(gather, aiText);
        saveCallLog(callSid, userSpeech, aiText, audioPath, getTtsProvider());

        twiml.redirect('/voice');
    } else {
        console.log("[Twilio] No speech recognized, redirecing to /voice");
        twiml.redirect('/voice');
    }
    res.type('text/xml').send(twiml.toString());
});

// Outbound / Mobile SDK Handlers
app.post('/api/voice-sdk', validateTwilioSignature, (req, res) => {
    const twiml = new twilio.twiml.VoiceResponse();
    const to = req.body.To;

    // Check if it's an outbound call or we just want to dial out to the AI assistant
    if (!to || to === 'AI' || to === process.env.TWILIO_PHONE_NUMBER) {
        // Redirection must be absolute URL if cross-calling or just path
        twiml.redirect(`/voice`);
    } else {
        const dial = twiml.dial({ callerId: process.env.TWILIO_PHONE_NUMBER });
        dial.number(to);
    }
    res.type('text/xml').send(twiml.toString());
});

app.post('/api/make-call', requireAuth, requireRole('agent'), async (req, res) => {
    const { to } = req.body;
    if (!to) return res.status(400).json({ error: "Missing 'to' phone number" });

    try {
        console.log(`[Twilio] Initiating outbound AI call to: ${to}`);
        const call = await client.calls.create({
            url: `${process.env.NGROK_URL}/voice`,
            to: to,
            from: process.env.TWILIO_PHONE_NUMBER
        });
        res.json({ success: true, sid: call.sid });
    } catch (error) {
        console.error("Outbound Call Error:", error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/token', requireAuth, requireRole('agent'), (req, res) => {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const apiKey = process.env.TWILIO_API_KEY;
    const apiSecret = process.env.TWILIO_API_SECRET;
    const outgoingApplicationSid = process.env.TWIML_APP_SID;

    console.log(`[Token] Generating for account: ${accountSid?.substring(0, 5)}...`);
    if (!apiKey || !apiSecret || !outgoingApplicationSid) {
        const missing = [];
        if (!apiKey) missing.push("TWILIO_API_KEY");
        if (!apiSecret) missing.push("TWILIO_API_SECRET");
        if (!outgoingApplicationSid) missing.push("TWIML_APP_SID");
        console.error(`[Token] Failed: Missing ${missing.join(', ')}`);
        return res.status(500).json({ error: `Missing environment variables: ${missing.join(', ')}` });
    }

    const { AccessToken } = twilio.jwt;
    const { VoiceGrant } = AccessToken;
    const identity = 'pib_agent';

    try {
        const accessToken = new AccessToken(accountSid, apiKey, apiSecret, { identity });
        accessToken.addGrant(new VoiceGrant({ outgoingApplicationSid: outgoingApplicationSid, incomingAllow: true }));
        const jwt = accessToken.toJwt();
        console.log(`[Token] Success for identity: ${identity}`);
        res.json({ token: jwt, identity });
    } catch (error) {
        console.error("[Token] Generation Error:", error);
        res.status(500).json({ error: error.message || "An internal error occurred during token generation" });
    }
});

app.post('/api/chat', sessionRateLimiter, async (req, res) => {
    const { message, history, sessionId, phone } = req.body;
    if (!message) return res.status(400).json({ error: "Missing 'message' field" });

    const sessionKey = sessionId || 'web-chat-default';

    try {
        await appendTurn(sessionKey, 'user', message);
        const response = await processMessage(message, sessionKey, phone, history || []);
        await appendTurn(sessionKey, 'assistant', response);
        res.json({ content: response });
    } catch (error) {
        req.log?.error({ err: error.message }, 'Chat error');
        res.status(500).json({ error: 'Failed to process message.' });
    }
});

// --- Dev-only diagnostics & test endpoints --------------------------------
// These bypass Twilio signature checks and auth so the frontend "Backend Tester"
// page (and scripts/simulate-call.mjs) can exercise the chat / voice / TTS paths
// WITHOUT placing real Twilio calls (zero credits). Enabled automatically in
// non-production; to expose them on a deployed/production backend (e.g. so the
// Vercel frontend can reach them), set ENABLE_TEST_ENDPOINTS=true.
const TEST_ENDPOINTS_ENABLED =
    process.env.NODE_ENV !== 'production' || process.env.ENABLE_TEST_ENDPOINTS === 'true';
if (TEST_ENDPOINTS_ENABLED) {
    if (process.env.NODE_ENV === 'production') {
        logger.warn(
            'ENABLE_TEST_ENDPOINTS=true in production: /api/test/* are reachable without auth. Disable when not demoing.'
        );
    }
    // Config snapshot (no secret values, just whether each is configured).
    app.get('/api/test/status', (req, res) => {
        res.json({
            ok: true,
            env: process.env.NODE_ENV || 'development',
            model: MODEL_NAME,
            models: MODEL_LIST,
            ttsProvider: getTtsProvider(),
            redisHealthy: isRedisHealthy(),
            mediaConfigured: isMediaConfigured(),
            twilioSignatureValidation: process.env.TWILIO_VALIDATE_SIGNATURE === 'true',
            providers: {
                openrouter: Boolean(OPENROUTER_KEY),
                supabase: Boolean(process.env.VITE_SUPABASE_URL),
                twilio: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
                whatsappOtp: Boolean(
                    process.env.SECURITY_WHATSAPP_PHONE_NUMBER_ID &&
                        process.env.SECURITY_WHATSAPP_ACCESS_TOKEN
                ),
                azureTts: Boolean(process.env.AZURE_TTS_KEY && process.env.AZURE_TTS_REGION),
                elevenlabs: Boolean(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID),
                edgeTts: Boolean(process.env.EDGE_TTS_URL),
            },
        });
    });

    // Simulate one voice turn the way Twilio would (speech -> AI reply), but over
    // JSON and with NO signature requirement. Optionally returns synthesized audio.
    app.post('/api/test/voice', async (req, res) => {
        const { message, sessionId, phone, speak } = req.body || {};
        if (!message) return res.status(400).json({ error: "Missing 'message' field" });
        const sessionKey = sessionId || `test-voice-${Date.now()}`;
        try {
            const aiText = await processMessage(message, sessionKey, phone || null);
            let audio = null;
            if (speak) {
                const out = await synthesize(aiText, { lang: 'ar' });
                if (out?.buffer) {
                    audio = {
                        contentType: out.contentType,
                        provider: out.provider,
                        base64: out.buffer.toString('base64'),
                    };
                }
            }
            res.json({ userText: message, aiText, ttsProvider: getTtsProvider(), audio });
        } catch (err) {
            req.log?.error({ err: err.message }, 'test/voice error');
            res.status(500).json({ error: err.message });
        }
    });

    // Synthesize arbitrary text and stream back the audio bytes (tests TTS only).
    app.post('/api/test/tts', async (req, res) => {
        const { text } = req.body || {};
        if (!text) return res.status(400).json({ error: "Missing 'text' field" });
        try {
            const out = await synthesize(text, { lang: 'ar' });
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

    logger.info('Dev test endpoints enabled: /api/test/status, /api/test/voice, /api/test/tts');
}

app.post('/api/sms', requireAuth, requireRole('agent'), async (req, res) => {
    const { to, message } = req.body;
    if (!to || !message) {
        return res.status(400).json({ error: "Missing 'to' or 'message' field." });
    }

    try {
        console.log(`[Manual SMS] To: ${to}, Message: ${message} (Twilio Disabled to save credits)`);
        res.json({
            success: true,
            sid: "SMS_DISABLED_CREDIT_SAFETY",
            note: "Use the Notification Bell for OTPs"
        });
    } catch (error) {
        console.error("SMS error:", error);
        res.status(500).json({ error: error.message });
    }
});

// --- Private media access via short-lived signed URLs (G27) ---
// Role check happens BEFORE signing, so only authorized agents can read media.
app.get('/api/media/sign', requireAuth, requireRole('agent'), async (req, res) => {
    const path = req.query.path;
    if (!path || typeof path !== 'string') {
        return res.status(400).json({ error: "Missing 'path' query parameter." });
    }
    if (!isMediaConfigured()) {
        return res.status(503).json({ error: 'Media storage is not configured.' });
    }
    const signedUrl = await signExistingPath(path);
    if (!signedUrl) {
        return res.status(404).json({ error: 'Could not sign the requested object.' });
    }
    return res.json({ url: signedUrl });
});

// --- WhatsApp Cloud API webhook (G23) ---
// GET: Meta verification handshake.
app.get('/webhook/whatsapp', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
        return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
});

// POST: signature is verified against the raw body BEFORE any processing.
app.post('/webhook/whatsapp', verifyWhatsAppSignature, async (req, res) => {
    // Respond 200 quickly so Meta does not retry; process asynchronously.
    res.sendStatus(200);
    try {
        const entry = req.body?.entry?.[0]?.changes?.[0]?.value;
        const msg = entry?.messages?.[0];
        if (!msg || msg.type !== 'text') return;

        // Deduplicate by WhatsApp message id (state lives in Redis, not memory).
        if (await isDuplicate('whatsapp', msg.id)) {
            req.log?.info({ messageId: msg.id }, 'Duplicate WhatsApp message ignored');
            return;
        }

        const from = msg.from;
        const text = msg.text?.body || '';
        await appendTurn(from, 'user', text);
        const reply = await processMessage(text, from, from);
        await appendTurn(from, 'assistant', reply);

        if (process.env.SECURITY_WHATSAPP_PHONE_NUMBER_ID && process.env.SECURITY_WHATSAPP_ACCESS_TOKEN) {
            const url = `https://graph.facebook.com/v24.0/${process.env.SECURITY_WHATSAPP_PHONE_NUMBER_ID}/messages`;
            await fetch(url, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${process.env.SECURITY_WHATSAPP_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    messaging_product: 'whatsapp',
                    to: from,
                    type: 'text',
                    text: { body: reply },
                }),
            });
        }
    } catch (err) {
        req.log?.error({ err: err.message }, 'WhatsApp webhook processing error');
    }
});

// --- Streaming voice path with barge-in (G4, experimental) ---
// TwiML that hands the call audio to our WebSocket via Twilio Media Streams.
app.post('/voice/stream', validateTwilioSignature, (req, res) => {
    const twiml = new twilio.twiml.VoiceResponse();
    const host = (process.env.NGROK_URL || '').replace(/^https?:\/\//, '');
    if (!host) {
        // No public host configured; fall back to the stable gather flow.
        twiml.redirect('/voice');
        return res.type('text/xml').send(twiml.toString());
    }
    twiml.say({ voice: 'Polly.Zeina', language: 'arb' }, 'أهلاً بك في البنك الإسلامي الفلسطيني.');
    const connect = twiml.connect();
    connect.stream({ url: `wss://${host}/voice/stream` });
    res.type('text/xml').send(twiml.toString());
});

// Bridge the dead WebSocketServer to Twilio Media Streams.
attachVoiceStream(wss, processMessage);
httpServer.on('upgrade', (request, socket, head) => {
    let pathname = '';
    try {
        pathname = new URL(request.url, 'http://localhost').pathname;
    } catch {
        pathname = request.url || '';
    }
    if (pathname === '/voice/stream') {
        wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
    } else {
        socket.destroy();
    }
});

httpServer.listen(port, '0.0.0.0', () => logger.info({ port, tts: getTtsProvider() }, 'Node voice/API server started'));
