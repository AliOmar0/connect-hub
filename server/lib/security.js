// Channel security helpers: CORS, rate limiting, and webhook signature checks.
// Implements G14 (rate limiting), G23 (WhatsApp signature), G34 (CORS + Node routes).
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import twilio from 'twilio';
import { getRedisClient, isRedisHealthy } from './redis.js';
import { logger } from './logger.js';

// --- CORS (G34) ------------------------------------------------------------

export function buildCorsOptions() {
    const allowed = (process.env.CORS_ALLOWED_ORIGINS || '')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean);

    // Support wildcard entries (e.g. "https://connect-hub-*.vercel.app") so that
    // all of a project's Vercel preview/branch deployments are allowed without
    // hardcoding every generated URL. A "*" only matches within a single path
    // segment (no dots), so "connect-hub-*.vercel.app" cannot match a deeper
    // subdomain like "evil.connect-hub-x.vercel.app".
    const exact = new Set(allowed.filter((o) => !o.includes('*')));
    const patterns = allowed
        .filter((o) => o.includes('*'))
        .map((o) => {
            const escaped = o.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^.]*');
            return new RegExp(`^${escaped}$`);
        });

    const isAllowed = (origin) =>
        exact.has(origin) || patterns.some((re) => re.test(origin));

    return {
        origin(origin, callback) {
            // Allow same-origin / server-to-server (no Origin header) and Twilio webhooks.
            if (!origin) return callback(null, true);
            if (isAllowed(origin)) return callback(null, true);
            logger.warn({ origin }, 'Blocked by CORS policy');
            return callback(new Error('Not allowed by CORS'));
        },
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'x-correlation-id'],
        credentials: true,
        maxAge: 600,
    };
}

// --- Rate limiting (G14) ---------------------------------------------------

function makeStore(prefix) {
    const client = getRedisClient();
    if (client && isRedisHealthy()) {
        return new RedisStore({
            prefix: `ratelimit:${prefix}:`,
            sendCommand: (...args) => client.call(...args),
        });
    }
    return undefined; // express-rate-limit falls back to its in-memory store
}

// 60 requests/minute per IP.
export const ipRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: Number(process.env.RATE_LIMIT_IP_PER_MIN || 60),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    store: makeStore('ip'),
    message: { error: 'Too many requests from this IP. Please slow down.', code: 'RATE_LIMITED_IP' },
});

// 10 requests/minute per session (keyed by sessionId in body, falling back to IP).
export const sessionRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: Number(process.env.RATE_LIMIT_SESSION_PER_MIN || 10),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    store: makeStore('session'),
    keyGenerator: (req) => req.body?.sessionId || req.ip,
    message: { error: 'Too many requests for this session. Please slow down.', code: 'RATE_LIMITED_SESSION' },
});

// --- Twilio webhook signature validation -----------------------------------

export function validateTwilioSignature(req, res, next) {
    if (process.env.TWILIO_VALIDATE_SIGNATURE !== 'true') {
        return next(); // disabled in local/dev to ease testing
    }
    const signature = req.headers['x-twilio-signature'];
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const url = `${process.env.NGROK_URL || ''}${req.originalUrl}`;
    const valid = twilio.validateRequest(authToken, signature, url, req.body || {});
    if (!valid) {
        req.log?.warn('Rejected Twilio webhook with invalid signature');
        return res.status(403).type('text/xml').send('<Response><Reject/></Response>');
    }
    return next();
}

// --- Meta WhatsApp webhook signature verification (G23) --------------------
// Verify X-Hub-Signature-256 against the raw body BEFORE parsing/processing it.
// Requires the raw body to be captured (see rawBodySaver in index.js).
export function verifyWhatsAppSignature(req, res, next) {
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    if (!appSecret) {
        req.log?.warn('WHATSAPP_APP_SECRET not configured - rejecting webhook');
        return res.status(503).json({ error: 'Webhook verification not configured.' });
    }
    const signature = req.headers['x-hub-signature-256'];
    if (!signature || !req.rawBody) {
        return res.status(401).json({ error: 'Missing signature.' });
    }
    const expected =
        'sha256=' + crypto.createHmac('sha256', appSecret).update(req.rawBody).digest('hex');
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        req.log?.warn('Rejected WhatsApp webhook with invalid signature');
        return res.status(401).json({ error: 'Invalid signature.' });
    }
    return next();
}
