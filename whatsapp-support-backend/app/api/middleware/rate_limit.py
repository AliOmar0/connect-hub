"""
In-memory sliding-window rate limiting for the FastAPI backend (NFR-03.03).

Mirrors the Node.js API's limits (60 req/min per IP, 10 req/min per session)
so both channels enforce the same policy. This is intentionally dependency-
free (no Redis requirement) — state lives in-process, which is correct for a
single instance and degrades to "no shared limit" (not "no limit at all",
since each replica still enforces its own) if horizontally scaled.

Usage: add as ASGI middleware in app/main.py:

    from app.api.middleware.rate_limit import RateLimitMiddleware
    app.add_middleware(RateLimitMiddleware)
"""
from __future__ import annotations

import time
import logging
from collections import deque
from typing import Deque, Dict, Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.core.config import settings

logger = logging.getLogger(__name__)

# Backwards-compatible private alias (this class was named _SlidingWindowCounter).


_WINDOW_SECONDS = 60


class SlidingWindowCounter:
    """Per-key sliding window request counter using a deque of timestamps."""

    def __init__(self, limit_per_min: int):
        self.limit = limit_per_min
        self._hits: Dict[str, Deque[float]] = {}

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        bucket = self._hits.setdefault(key, deque())

        # Drop timestamps outside the window.
        while bucket and now - bucket[0] > _WINDOW_SECONDS:
            bucket.popleft()

        if len(bucket) >= self.limit:
            return False

        bucket.append(now)
        return True

    def reset(self) -> None:
        self._hits.clear()

    def gc(self, max_keys: int = 5000) -> None:
        """Best-effort eviction of stale keys so the dict doesn't grow forever."""
        if len(self._hits) <= max_keys:
            return
        now = time.monotonic()
        stale = [
            k for k, bucket in self._hits.items()
            if not bucket or now - bucket[-1] > _WINDOW_SECONDS
        ]
        for k in stale:
            self._hits.pop(k, None)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Applies two independent limits per request:
      - RATE_LIMIT_IP_PER_MIN requests/min per client IP
      - RATE_LIMIT_SESSION_PER_MIN requests/min per session_id
        (read from the `X-Session-Id` header or a `session_id` query param;
        skipped when absent since not every route is session-scoped)

    The webhook route is exempt (Meta's servers share IPs across many
    customers; that endpoint has its own signature-based protection instead).
    """

    # Both webhook routes are exempt: Meta's servers share IPs across many
    # customers. /api/wa/webhook was missing here, so the alternate route was
    # IP-limited while the primary one was not.
    _EXEMPT_PATHS = {"/", "/health", "/webhook", "/api/wa/webhook"}

    def __init__(self, app):
        super().__init__(app)
        self._ip_counter = SlidingWindowCounter(settings.RATE_LIMIT_IP_PER_MIN)
        self._session_counter = SlidingWindowCounter(settings.RATE_LIMIT_SESSION_PER_MIN)

    @staticmethod
    def _client_ip(request: Request) -> str:
        """Resolve the client IP for rate-limiting.

        SECURITY: X-Forwarded-For is only honoured when TRUST_PROXY_HEADERS is
        explicitly enabled. Anyone can set that header, so trusting it
        unconditionally (as this did) meant one extra header per request
        defeated IP rate limiting entirely. Behind a real proxy the direct peer
        address is the proxy, so enable the flag there and only there.
        """
        if settings.TRUST_PROXY_HEADERS:
            forwarded = request.headers.get("x-forwarded-for")
            if forwarded:
                return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    async def dispatch(self, request: Request, call_next):
        if not settings.RATE_LIMIT_ENABLED or request.url.path in self._EXEMPT_PATHS:
            return await call_next(request)

        ip = self._client_ip(request)
        if not self._ip_counter.allow(ip):
            logger.warning(f"Rate limit exceeded for IP {ip} on {request.url.path}")
            return JSONResponse(
                status_code=429,
                content={"error": {"code": "RATE_LIMIT_EXCEEDED", "message": "Too many requests. Please slow down."}},
            )

        session_id: Optional[str] = request.headers.get("x-session-id") or request.query_params.get("session_id")
        if session_id and not self._session_counter.allow(session_id):
            logger.warning(f"Rate limit exceeded for session {session_id} on {request.url.path}")
            return JSONResponse(
                status_code=429,
                content={"error": {"code": "RATE_LIMIT_EXCEEDED", "message": "Too many requests for this session."}},
            )

        self._ip_counter.gc()
        self._session_counter.gc()
        return await call_next(request)


_SlidingWindowCounter = SlidingWindowCounter
