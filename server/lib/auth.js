// Server-side Supabase JWT validation and RBAC (G22, G34).
// Do NOT rely only on protected React routes - every sensitive Node route must
// pass through requireAuth (and requireRole where appropriate).
import jwt from 'jsonwebtoken';
import { logger } from './logger.js';

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;

if (!JWT_SECRET) {
    logger.warn('SUPABASE_JWT_SECRET not set - protected routes will reject all requests until configured.');
}

// Role hierarchy mirrors the frontend ProtectedRoute so server and client agree.
const ROLE_LEVEL = { viewer: 0, agent: 1, manager: 2, supervisor: 2, admin: 3 };

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
export function requireAuth(req, res, next) {
    if (!JWT_SECRET) {
        return res.status(503).json({ error: 'Authentication is not configured on the server.' });
    }
    const token = extractBearer(req);
    if (!token) {
        return res.status(401).json({ error: 'Missing or malformed Authorization header.' });
    }
    try {
        // Supabase signs access tokens with HS256 using the project JWT secret.
        const payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
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
