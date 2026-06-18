// Prometheus metrics + health/readiness endpoints (G15, G35).
import client from 'prom-client';
import { isRedisHealthy } from './redis.js';

const register = new client.Registry();
client.collectDefaultMetrics({ register });

export const httpRequestDuration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [register],
});

export const httpRequestsTotal = new client.Counter({
    name: 'http_requests_total',
    help: 'Total HTTP requests',
    labelNames: ['method', 'route', 'status_code'],
    registers: [register],
});

export const activeSessions = new client.Gauge({
    name: 'active_sessions',
    help: 'Number of active sessions',
    registers: [register],
});

export const escalationsTotal = new client.Counter({
    name: 'escalations_total',
    help: 'Total escalations to human agents',
    registers: [register],
});

// Middleware to record request metrics.
export function metricsMiddleware(req, res, next) {
    const end = httpRequestDuration.startTimer();
    res.on('finish', () => {
        const route = req.route?.path || req.path || 'unknown';
        const labels = { method: req.method, route, status_code: res.statusCode };
        end(labels);
        httpRequestsTotal.inc(labels);
    });
    next();
}

export function registerObservabilityRoutes(app) {
    // Liveness: process is up.
    app.get('/health', (req, res) => {
        res.json({ status: 'ok', uptime: process.uptime() });
    });

    // Readiness: dependencies are usable (graceful degradation aware).
    app.get('/ready', (req, res) => {
        const redisOk = isRedisHealthy();
        const ready = true; // service can serve in degraded (in-memory) mode
        res.status(ready ? 200 : 503).json({
            status: ready ? 'ready' : 'not-ready',
            dependencies: { redis: redisOk ? 'up' : 'degraded' },
        });
    });

    // Prometheus scrape endpoint.
    app.get('/metrics', async (req, res) => {
        res.set('Content-Type', register.contentType);
        res.end(await register.metrics());
    });
}

export { register };
