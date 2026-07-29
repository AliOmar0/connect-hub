import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends, HTTPException

from app.core.logger import configure_logging, CorrelationIdMiddleware

# Structured JSON logging (NFR-05.02) must be configured before anything else
# logs, so every subsequent logger.* call in this process emits JSON with a
# correlation ID when available.
configure_logging()
logger = logging.getLogger(__name__)
from fastapi.middleware.cors import CORSMiddleware

from app.api.middleware.rate_limit import RateLimitMiddleware
from app.api.v1.assistant import router as assistant_router
from app.api.v1.decision import router as decision_router
from app.api.v1.knowledge_base import router as knowledge_base_router
from app.api.v1.nlp import router as nlp_router
from app.api.v1.scraper import router as scraper_router
from app.api.v1.sessions import router as sessions_router
from app.api.v1.webhook import router as webhook_router
from app.api.v1.deps import get_session, verify_jwt
from app.core.config import settings
from app.crud import crud


class EndpointFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return record.getMessage().find("/typing") == -1


logging.getLogger("uvicorn.access").addFilter(EndpointFilter())

# ---------------------------------------------------------------------------
# Startup validation
# ---------------------------------------------------------------------------

def _validate_startup() -> None:
    """Validate critical configuration at startup.
    
    Raises RuntimeError if any required setting is missing.
    """
    critical_settings = {
        "SUPABASE_URL": settings.SUPABASE_URL,
        "SUPABASE_KEY": settings.SUPABASE_KEY,
        "SUPABASE_JWT_SECRET": settings.SUPABASE_JWT_SECRET,
        "OPENROUTER_API_KEY": settings.OPENROUTER_API_KEY,
    }
    missing = [k for k, v in critical_settings.items() if not v]
    if missing:
        logger.error(f"CRITICAL: Missing required environment variables: {missing}")
        raise RuntimeError(f"Missing required configuration: {missing}")
    logger.info("✅ Startup validation passed - all critical settings configured")


async def session_cleanup_task():
    """Periodic task to close inactive WhatsApp sessions.

    When a session is closed due to inactivity the customer receives a
    polite satisfaction-check message, then the session is auto-classified.
    Both actions are handled by `send_session_closing_message` which calls
    `auto_classify_session` internally via its `finally` block.
    """
    from app.api.v1.webhook import send_session_closing_message

    while True:
        try:
            # Auto-close sessions inactive for 10 minutes (SESSION_TTL_SECONDS=600).
            await crud.close_inactive_sessions(
                None, minutes=10, on_close=send_session_closing_message
            )
            await crud.delete_old_notifications(None, hours=24)
        except Exception as e:
            logger.exception(f"Error in session cleanup task: {e}")
        await asyncio.sleep(
            60
        )  # Run every 60 seconds — tight race window vs the 10-min session timeout


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Add logging for startup
    logger.info("=" * 60)
    logger.info("Starting WhatsApp Support Backend")
    logger.info(f"Project: {settings.PROJECT_NAME}")
    logger.info(f"API Version: {settings.API_V1_STR}")
    logger.info("=" * 60)
    
    # Startup: validate critical configuration
    try:
        _validate_startup()
    except RuntimeError as exc:
        logger.error(f"Startup validation failed: {exc}")
        raise

    # --- 1. Initialize Qdrant vector database ---
    try:
        from app.core.rag import init_qdrant, _get_client
        init_qdrant()
        # Verify collection exists
        client = _get_client()
        client.get_collection(settings.QDRANT_COLLECTION)
        logger.info(f"✅ Qdrant: Collection '{settings.QDRANT_COLLECTION}' initialized and verified")
    except Exception as e:
        logger.error(f"❌ Qdrant initialization failed: {e}")
        raise RuntimeError(f"Qdrant initialization failed: {e}")

    # --- 2. Check embeddings availability ---
    try:
        from app.core import rag
        if rag.EMBEDDINGS_AVAILABLE:
            logger.info("✅ Embeddings: sentence-transformers is available")
        else:
            logger.warning("⚠️ Embeddings: sentence-transformers is NOT installed!")
            logger.warning("   RAG will use JSON knowledge base fallback only.")
            logger.warning("   Install with: pip install sentence-transformers")
    except Exception as e:
        logger.error(f"❌ Embeddings check failed: {e}")

    # --- Reconcile any Crawl_Job left "running" by an unclean shutdown ---
    # Fixes: a crawl in progress when the server is stopped never gets its
    # `crawl_jobs` row marked completed/failed, so on restart every
    # POST /scraper/jobs incorrectly 409s with "A crawl job is already
    # running" even though nothing is actually running anymore.
    try:
        from app.core.scraper import reconcile_stale_running_jobs
        reconciled = reconcile_stale_running_jobs()
        if reconciled:
            logger.warning(
                f"⚠️ Reconciled {reconciled} stale 'running' crawl job(s) "
                "left over from an unclean shutdown; marked as failed."
            )
    except Exception as e:
        logger.error(f"❌ Crawl job reconciliation failed: {e}")

    # Start background tasks
    task = asyncio.create_task(session_cleanup_task())
    from app.crud.cleanup import retention_cleanup_task
    retention_task = asyncio.create_task(retention_cleanup_task())

    scraper_task = None
    if settings.SCRAPER_ENABLED:
        from app.core.scraper.scheduler import scheduled_crawl_task
        scraper_task = asyncio.create_task(
            scheduled_crawl_task()
        )

    # Start ngrok tunnel if enabled
    if settings.USE_NGROK:
        try:
            from pyngrok import ngrok

            # Check for existing tunnels on port 3001 to avoid duplicates during reload
            tunnels = ngrok.get_tunnels()
            existing_tunnel = next(
                (t for t in tunnels if ":3001" in t.config["addr"]), None
            )

            if not existing_tunnel:
                # Use ID and URL from settings if available
                if (
                    settings.NGROK_ID
                    and len(settings.NGROK_ID) > 20
                    and not settings.NGROK_ID.startswith("rd_")
                ):
                    ngrok.set_auth_token(settings.NGROK_ID)

                connect_kwargs = {"addr": int(os.getenv("PORT", "5000"))}
                if settings.NGROK_URL:
                    connect_kwargs["domain"] = settings.NGROK_URL

                # Only use ID as name if it's not the auth token
                if settings.NGROK_ID and len(settings.NGROK_ID) <= 20:
                    connect_kwargs["name"] = settings.NGROK_ID
                else:
                    connect_kwargs["name"] = "whatsapp-backend-tunnel"

                try:
                    public_url = ngrok.connect(**connect_kwargs).public_url
                    print(f"\n==============================================")
                    print(f"NGROK Tunnel is live!")
                    print(f"Public URL: {public_url}")
                    print(f"WhatsApp Webhook URL: {public_url}/webhook")
                    print(f"==============================================\n")
                except Exception as connect_error:
                    if "already online" in str(connect_error).lower():
                        print(
                            f"\n[NGROK] Tunnel is already online for domain {settings.NGROK_URL}. Skipping startup."
                        )
                    else:
                        raise connect_error
            else:
                print(f"\nNGROK Tunnel already active: {existing_tunnel.public_url}\n")
        except Exception as e:
            print(f"Failed to start ngrok: {e}")

    yield
    # Shutdown: Cancel background tasks
    task.cancel()
    retention_task.cancel()
    if scraper_task is not None:
        scraper_task.cancel()
    tasks_to_await = [task, retention_task] + (
        [scraper_task] if scraper_task is not None else []
    )
    for t in tasks_to_await:
        try:
            await t
        except asyncio.CancelledError:
            pass


app = FastAPI(title=settings.PROJECT_NAME, lifespan=lifespan)

# Correlation IDs first (outermost) so every log line for a request — including
# ones from the rate limiter and CORS layer below — carries the same ID.
app.add_middleware(CorrelationIdMiddleware)

# Rate limiting (NFR-03.03): 60 req/min per IP, 10 req/min per session,
# mirroring the Node.js API's limits.
app.add_middleware(RateLimitMiddleware)

# CORS — no wildcard fallback. If BACKEND_CORS_ORIGINS is empty, cross-origin
# browser requests are simply not allowed (server-to-server calls, which don't
# send an Origin header, are unaffected).
if settings.BACKEND_CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.BACKEND_CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    logger.warning(
        "BACKEND_CORS_ORIGINS is empty - cross-origin browser requests to this "
        "API will be blocked. Set explicit origins in .env if a browser client "
        "needs access."
    )

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
# Webhook endpoints remain UNAUTHENTICATED (Meta servers cannot send JWTs)
app.include_router(webhook_router, tags=["webhook"])

# Public health/root (still no auth)
@app.get("/")
def root():
    return {"message": "WhatsApp Support Backend Running"}

@app.get("/health")
def health():
    """Lightweight health/status used by the Node API and the Backend Tester to
    report the ACTUAL answering model (this service is the AI brain; the Node
    API only delegates to it)."""
    use_deepseek = bool(settings.DEEPSEEK_API_KEY)
    return {
        "status": "ok",
        "ai_provider": "deepseek" if use_deepseek else "openrouter",
        "ai_model": settings.DEEPSEEK_MODEL
        if use_deepseek
        else settings.OPENROUTER_MODEL,
    }

# API V1 - PROTECTED with JWT auth (except webhook which is handled above)
app.include_router(
    sessions_router,
    prefix=settings.API_V1_STR,
    tags=["sessions"],
    dependencies=[Depends(verify_jwt)],
)
app.include_router(
    knowledge_base_router,
    prefix=settings.API_V1_STR,
    tags=["knowledge-base"],
    dependencies=[Depends(verify_jwt)],
)
app.include_router(
    nlp_router,
    prefix=settings.API_V1_STR,
    tags=["nlp"],
    dependencies=[Depends(verify_jwt)],
)
app.include_router(
    decision_router,
    prefix=settings.API_V1_STR,
    tags=["decision"],
    dependencies=[Depends(verify_jwt)],
)
app.include_router(
    assistant_router,
    prefix=settings.API_V1_STR,
    tags=["assistant"],
    dependencies=[Depends(verify_jwt)],
)
app.include_router(
    scraper_router,
    prefix=settings.API_V1_STR,
    tags=["scraper"],
    dependencies=[Depends(verify_jwt)],
)
