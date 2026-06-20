// Distributed state via Redis with a safe in-memory fallback.
// Implements G5 (Redis), G13 (30-min TTL + last-5-turn context), G29 (move
// dedup/buffers/session state out of process memory).
//
// Redis key schema (documented for the team):
//   session:<sessionId>            -> JSON { language, lastBranch, lastCard, turns[], ...meta }   TTL = SESSION_TTL_SECONDS
//   dedup:<channel>:<messageId>    -> "1"                                                          TTL = DEDUP_TTL_SECONDS
//   ratelimit:ip:<ip>              -> counter (managed by rate-limit middleware)                    TTL = 60s
//   ratelimit:session:<sessionId>  -> counter                                                      TTL = 60s
//   otp:attempts:<phone>           -> counter (exposed for Person 1's OTP flow)                     TTL = OTP_WINDOW_SECONDS
//
// Failure fallback: if Redis is unavailable, an in-memory Map is used so the
// service degrades gracefully (single-instance) instead of crashing.
import Redis from 'ioredis';
import { logger } from './logger.js';

export const SESSION_TTL_SECONDS = Number(process.env.SESSION_TTL_SECONDS || 1800); // 30 minutes
export const DEDUP_TTL_SECONDS = Number(process.env.DEDUP_TTL_SECONDS || 600);
export const MAX_TURNS = Number(process.env.SESSION_MAX_TURNS || 5);

let redis = null;
let redisHealthy = false;

// In-memory fallback store: key -> { value, expiresAt }
const memoryStore = new Map();

function memSet(key, value, ttlSeconds) {
    memoryStore.set(key, { value, expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null });
}
function memGet(key) {
    const entry = memoryStore.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
        memoryStore.delete(key);
        return null;
    }
    return entry.value;
}

if (process.env.REDIS_URL) {
    redis = new Redis(process.env.REDIS_URL, {
        maxRetriesPerRequest: 2,
        lazyConnect: false,
        retryStrategy: (times) => Math.min(times * 200, 2000),
    });
    let warnedDown = false;
    redis.on('ready', () => {
        redisHealthy = true;
        warnedDown = false;
        logger.info('Redis connected');
    });
    redis.on('error', (err) => {
        redisHealthy = false;
        // Log only once per outage to avoid flooding the console while ioredis
        // keeps retrying in the background (the in-memory fallback handles reads).
        if (!warnedDown) {
            warnedDown = true;
            logger.warn(
                { err: err.message },
                'Redis unavailable - using in-memory fallback (set REDIS_URL or start Redis to enable distributed state)'
            );
        }
    });
    redis.on('end', () => {
        redisHealthy = false;
    });
} else {
    logger.warn('REDIS_URL not set - using in-memory fallback store (not safe for multi-instance)');
}

export function isRedisHealthy() {
    return redisHealthy;
}

export function getRedisClient() {
    return redis;
}

async function rawSet(key, value, ttlSeconds) {
    if (redis && redisHealthy) {
        if (ttlSeconds) await redis.set(key, value, 'EX', ttlSeconds);
        else await redis.set(key, value);
        return;
    }
    memSet(key, value, ttlSeconds);
}

async function rawGet(key) {
    if (redis && redisHealthy) return redis.get(key);
    return memGet(key);
}

async function rawDel(key) {
    if (redis && redisHealthy) {
        await redis.del(key);
        return;
    }
    memoryStore.delete(key);
}

// --- Session helpers (G13) -------------------------------------------------

const sessionKey = (id) => `session:${id}`;

export async function getSession(sessionId) {
    const raw = await rawGet(sessionKey(sessionId));
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

export async function saveSession(sessionId, data) {
    // Always refresh TTL on write so an active session stays alive (sliding expiry).
    await rawSet(sessionKey(sessionId), JSON.stringify(data), SESSION_TTL_SECONDS);
    return data;
}

export async function deleteSession(sessionId) {
    await rawDel(sessionKey(sessionId));
}

// Append a turn and keep only the last MAX_TURNS turns.
export async function appendTurn(sessionId, role, content) {
    const session = (await getSession(sessionId)) || { turns: [] };
    session.turns = [...(session.turns || []), { role, content, ts: Date.now() }].slice(-MAX_TURNS);
    session.updatedAt = Date.now();
    await saveSession(sessionId, session);
    return session;
}

// --- Deduplication (G29) ---------------------------------------------------

export async function isDuplicate(channel, messageId) {
    if (!messageId) return false;
    const key = `dedup:${channel}:${messageId}`;
    const existing = await rawGet(key);
    if (existing) return true;
    await rawSet(key, '1', DEDUP_TTL_SECONDS);
    return false;
}

// --- OTP rate-limit hook for Person 1's flow (G14) -------------------------

export async function incrementOtpAttempts(phone, windowSeconds = 300) {
    const key = `otp:attempts:${phone}`;
    if (redis && redisHealthy) {
        const count = await redis.incr(key);
        if (count === 1) await redis.expire(key, windowSeconds);
        return count;
    }
    const current = Number(memGet(key) || 0) + 1;
    memSet(key, String(current), windowSeconds);
    return current;
}
