// Structured JSON logging with correlation IDs and secret redaction.
// Implements G15 (JSON logs, correlation IDs) without leaking secrets/payloads.
import { randomUUID } from 'crypto';
import pino from 'pino';

const REDACT_PATHS = [
    'req.headers.authorization',
    'req.headers.cookie',
    'req.headers["x-vapi-secret"]',
    'req.headers["x-vapi-signature"]',
    'req.headers["x-hub-signature-256"]',
    'req.body.otp',
    'req.body.OtP',
    'req.body.password',
    'req.body.token',
    'req.body.access_token',
    'res.headers["set-cookie"]',
];

export const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    formatters: {
        level: (label) => ({ level: label }),
    },
    base: { service: 'node-voice-api' },
    timestamp: pino.stdTimeFunctions.isoTime,
});

// Express middleware: attach a correlation id and a child logger to each request.
export function correlationMiddleware(req, res, next) {
    const correlationId = req.headers['x-correlation-id'] || randomUUID();
    req.correlationId = correlationId;
    res.setHeader('x-correlation-id', correlationId);
    req.log = logger.child({ correlationId, method: req.method, url: req.url });

    const start = process.hrtime.bigint();
    res.on('finish', () => {
        const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
        req.log.info(
            { statusCode: res.statusCode, durationMs: Math.round(durationMs) },
            'request completed'
        );
    });
    next();
}
