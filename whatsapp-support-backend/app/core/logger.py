"""
Structured JSON logging with correlation IDs (NFR-05.02).

Mirrors the Node.js API's pino-based structured logs so both backends emit a
comparable shape and can be correlated by `correlation_id` across a request
that crosses Node -> FastAPI.

Usage (in app/main.py, before anything else logs):

    from app.core.logger import configure_logging
    configure_logging()

To attach a correlation ID to a request and have every log line during that
request include it, add CorrelationIdMiddleware to the FastAPI app:

    from app.core.logger import CorrelationIdMiddleware
    app.add_middleware(CorrelationIdMiddleware)
"""
from __future__ import annotations

import json
import logging
import sys
import uuid
from contextvars import ContextVar
from typing import Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

_correlation_id: ContextVar[Optional[str]] = ContextVar("correlation_id", default=None)


def get_correlation_id() -> Optional[str]:
    return _correlation_id.get()


class JsonFormatter(logging.Formatter):
    """Renders each log record as a single JSON line."""

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        cid = get_correlation_id()
        if cid:
            payload["correlation_id"] = cid
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        # Allow callers to pass structured extras via `extra={"data": {...}}`.
        extra_data = getattr(record, "data", None)
        if extra_data:
            payload["data"] = extra_data
        return json.dumps(payload, ensure_ascii=False, default=str)


def configure_logging(level: int = logging.INFO) -> None:
    """Replace the root logger's handlers with a single JSON stream handler.

    Idempotent: safe to call multiple times (e.g. under uvicorn --reload).
    """
    root = logging.getLogger()
    root.setLevel(level)

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())

    # Avoid duplicate handlers on reload.
    root.handlers = [handler]

    # uvicorn installs its own handlers on these loggers; route them through
    # the same JSON formatter for consistency instead of leaving plain text.
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        uv_logger = logging.getLogger(name)
        uv_logger.handlers = [handler]
        uv_logger.propagate = False


class CorrelationIdMiddleware(BaseHTTPMiddleware):
    """
    Reads `X-Correlation-Id` from the incoming request (set by the Node API
    when it proxies a call here) or generates a new UUID4 when absent, stores
    it in a ContextVar for the duration of the request so every log line
    emitted while handling it includes the same ID, and echoes it back in the
    response header for the caller to log/display.
    """

    HEADER_NAME = "x-correlation-id"

    async def dispatch(self, request: Request, call_next):
        incoming = request.headers.get(self.HEADER_NAME)
        cid = incoming or str(uuid.uuid4())
        token = _correlation_id.set(cid)
        try:
            response = await call_next(request)
        finally:
            _correlation_id.reset(token)
        response.headers[self.HEADER_NAME] = cid
        return response
