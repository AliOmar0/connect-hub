// Server-side Supabase JWT validation and RBAC (G22, G34).
// Do NOT rely only on protected React routes - every sensitive Node route must
// pass through requireAuth (and requireRole where appropriate).
//
// Supabase now signs user access tokens with ASYMMETRIC keys (ES256/RS256) that
// are published at the project's JWKS endpoint. We verify against those public
// keys. Legacy projects that still sign with the shared HS256 "JWT secret" are
// supported via SUPABASE_JWT_SECRET as a fallback.
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { logger } from './logger.js';

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
const SUPABASE_URL = (
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    ''
).replace(/\/+$/, '');
const JWKS_URL = SUPABASE_URL
    ? `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`
    : null;

if (!JWKS_URL && !JWT_SECRET) {
    logger.warn(
        'Neither SUPABASE_URL (for JWKS) nor SUPABASE_JWT_SECRET is set - protected routes will reject all requests until configured.',
    );
}

// Role hierarchy mirrors the frontend ProtectedRoute so server and client agree.
const ROLE_LEVEL = { viewer: 0, agent: 1, manager: 2, supervisor: 2, admin: 3 };

// --- JWKS public-key cache -------------------------------------------------
// Cache verified public keys by `kid`. Refetch when a token references a key
// we haven't seen (handles Supabase key rotation) with a short throttle so a
// burst of bad tokens can't hammer the JWKS endpoint.
const jwksKeys = new Map(); // kid -> crypto.KeyObject
let lastJwksFetch = 0;
const JWKS_MIN_REFETCH_MS = 30_000;

async function refreshJwks() {
    if (!JWKS_URL) return;
    const now = Date.now();
    if (now - lastJwksFetch < JWKS_MIN_REFETCH_MS) return;
    lastJwksFetch = now;
    try {
        const res = await fetch(JWKS_URL, { headers: { Accept: 'application/json' } });
        if (!res.ok) {
            logger.warn({ status: res.status }, 'JWKS fetch failed');
            return;
        }
        const { keys } = await res.json();
        if (!Array.isArray(keys)) return;
        for (const jwk of keys) {
            if (!jwk.kid) continue;
            try {
                jwksKeys.set(jwk.kid, crypto.createPublicKey({ key: jwk, format: 'jwk' }));
            } catch (err) {
                logger.warn({ err: err.message, kid: jwk.kid }, 'Failed to import JWKS key');
            }
        }
    } catch (err) {
        logger.warn({ err: err.message }, 'JWKS fetch error');
    }
}

async function getSigningKey(kid) {
    if (kid && jwksKeys.has(kid)) return jwksKeys.get(kid);
    await refreshJwks();
    return kid ? jwksKeys.get(kid) : undefined;
}

// Verify a Supabase access token. Chooses HS256 (legacy shared secret) or the
// asymmetric JWKS key based on the token header's `alg`/`kid`. Returns the
// decoded payload, or throws if verification fails.
async function verifyToken(token) {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || !decoded.header) {
        throw new Error('Malformed token');
    }
    const { alg, kid } = decoded.header;

    if (alg === 'HS256') {
        if (!JWT_SECRET) throw new Error('HS256 token but no SUPABASE_JWT_SECRET configured');
        return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    }

    if (alg === 'ES256' || alg === 'RS256') {
        const key = await getSigningKey(kid);
        if (!key) throw new Error(`No JWKS key for kid ${kid}`);
        return jwt.verify(token, key, { algorithms: ['ES256', 'RS256'] });
    }

    throw new Error(`Unsupported token alg: ${alg}`);
}

function extractBearer(req) {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme === 'Bearer' && token) return token;
    return null;
}

function deriveRole(payload) {
    // Supabase puts custom claims under app_metadata / user_metadata.
    return (
        payload.role_name ||
        payload.app_metadata?.role ||
        payload.user_metadata?.role ||
        'viewer'
    );
}

// Verifies the Supabase access token and attaches req.user.
export async function requireAuth(req, res, next) {
    if (!JWKS_URL && !JWT_SECRET) {
        return res.status(503).json({ error: 'Authentication is not configured on the server.' });
    }
    const token = extractBearer(req);
    if (!token) {
        return res.status(401).json({ error: 'Missing or malformed Authorization header.' });
    }
    try {
        const payload = await verifyToken(token);
        req.user = {
            id: payload.sub,
            email: payload.email,
            role: deriveRole(payload),
            claims: payload,
        };
        return next();
    } catch (err) {
        req.log?.warn({ err: err.message }, 'JWT verification failed');
        return res.status(401).json({ error: 'Invalid or expired token.' });
    }
}

// Enforces a minimum role level. Use after requireAuth.
export function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required.' });
        }
        const userLevel = ROLE_LEVEL[req.user.role] ?? 0;
        const ok = allowedRoles.some((r) => userLevel >= (ROLE_LEVEL[r] ?? 99));
        if (!ok) {
            req.log?.warn({ role: req.user.role, allowedRoles }, 'RBAC denied');
            return res.status(403).json({ error: 'Insufficient permissions.' });
        }
        return next();
    };
}
