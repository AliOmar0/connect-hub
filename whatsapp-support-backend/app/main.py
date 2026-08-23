import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI

from app.core.logger import CorrelationIdMiddleware, configure_logging

# Structured JSON logging (NFR-05.02) must be configured before anything else
# logs, so every subsequent logger.* call in this process emits JSON with a
# correlation ID when available.
configure_logging()
logger = logging.getLogger(__name__)
from fastapi.middleware.cors import CORSMiddleware

from app.api.middleware.rate_limit import RateLimitMiddleware
from app.api.v1.assistant import router as assistant_router
from app.api.v1.complaints import router as complaints_router
from app.api.v1.decision import router as decision_router
from app.api.v1.deps import verify_jwt
from app.api.v1.knowledge_base import router as knowledge_base_router
from app.api.v1.nlp import router as nlp_router
from app.api.v1.scraper import router as scraper_router
from app.api.v1.sessions import router as sessions_router
from app.api.v1.voice_agent import router as voice_agent_router
from app.api.v1.webhook import router as webhook_router
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
    # Bank account lookups: refuse to boot half-configured rather than silently
    # degrading. The bank client NEVER falls back to the main (service-role)
    # Supabase project, so an unset BANK_DB_OSS_* means the feature is off, not
    # that it quietly reads from somewhere else.
    if settings.BANK_LOOKUP_ENABLED:
        from app import database

        problems = []
        if database.bank_db_oss is None:
            problems.append(
                "Bank_db_oss is not available "
                f"({database._BANK_DB_ERROR or 'BANK_DB_OSS_URL/BANK_DB_OSS_KEY not set'})"
            )
        # OTP delivery is embedded (app/core/otp_client.py) rather than a
        # separate service now, so what's required is the dedicated security
        # WhatsApp sender, not a service URL/secret.
        if not settings.SECURITY_WHATSAPP_PHONE_NUMBER_ID:
            problems.append("SECURITY_WHATSAPP_PHONE_NUMBER_ID is not set")
        if not settings.SECURITY_WHATSAPP_ACCESS_TOKEN:
            problems.append("SECURITY_WHATSAPP_ACCESS_TOKEN is not set")
        if problems:
            logger.error(f"CRITICAL: BANK_LOOKUP_ENABLED but {problems}")
            raise RuntimeError(
                f"Bank account lookups are enabled but misconfigured: {problems}. "
                "Set BANK_LOOKUP_ENABLED=false to run without them."
            )

    # ElevenLabs voice agent: same fail-closed shape as BANK_LOOKUP_ENABLED above.
    if settings.VOICE_AGENT_ENABLED:
        voice_problems = []
        if not settings.ELEVENLABS_API_KEY:
            voice_problems.append("ELEVENLABS_API_KEY is not set")
        if not settings.ELEVENLABS_AGENT_ID:
            voice_problems.append("ELEVENLABS_AGENT_ID is not set")
        if not settings.ELEVENLABS_TOOL_SHARED_SECRET:
            voice_problems.append("ELEVENLABS_TOOL_SHARED_SECRET is not set")
        if not settings.ELEVENLABS_WEBHOOK_SECRET:
            voice_problems.append("ELEVENLABS_WEBHOOK_SECRET is not set")
        if voice_problems:
            logger.error(f"CRITICAL: VOICE_AGENT_ENABLED but {voice_problems}")
            raise RuntimeError(
                f"Voice agent is enabled but misconfigured: {voice_problems}. "
                "Set VOICE_AGENT_ENABLED=false to run without it."
            )

    logger.info("✅ Startup validation passed - all critical settings configured")


async def session_cleanup_task():
    """Periodic task to close inactive WhatsApp sessions.

    Two sweeps, because "gone quiet" means two different things:

      * A bot conversation the customer stopped replying to -- 10 minutes,
        ends as `completed`.
      * An escalation no human ever answered -- ESCALATION_TIMEOUT_MINUTES
        (2 hours), ends as `auto_closed`. Longer, because someone is supposed
        to be picking this up and a staff member stepping away must not lose
        the conversation; and a different terminal status, because nobody
        resolved it.

    When a session is closed the customer receives a polite closing message
    asking them to rate the service, then the session is auto-classified. Both
    actions are handled by `send_session_closing_message`, which calls
    `auto_classify_session` internally via its `finally` block.
    """
    from app.api.v1.webhook import send_session_closing_message
    from app.core.complaints import complaint_store
    from app.core.csat_state import csat_store
    from app.core.verification_state import identity_pending_store, verification_store
    from app.core.voice_agent_state import voice_conversation_store
    from app.models.enums import SessionStatus

    while True:
        try:
            # Ordinary idle bot conversations.
            await crud.close_inactive_sessions(
                None, minutes=10, on_close=send_session_closing_message
            )
            # Escalations nobody picked up. require_outbound_last=False because
            # these usually end on the CUSTOMER asking for a human -- the
            # outbound check that protects the sweep above would keep every one
            # of them open indefinitely.
            await crud.close_inactive_sessions(
                None,
                minutes=settings.ESCALATION_TIMEOUT_MINUTES,
                statuses=(SessionStatus.escalated,),
                terminal_status=SessionStatus.auto_closed,
                require_outbound_last=False,
                on_close=send_session_closing_message,
            )
            await crud.delete_old_notifications(None, hours=24)
            # Evict verification state whose OTP has expired.
            verification_store.purge_expired()
            # Evict identity-verification state (name+national ID, pre-OTP).
            identity_pending_store.purge_expired()
            # Evict stale in-process conversation<->session links for voice calls.
            voice_conversation_store.purge_expired()
            # Evict abandoned complaint intake forms.
            complaint_store.purge_expired()
            # Evict rating windows for sessions the customer never rated.
            csat_store.purge_expired()
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
        from app.core.rag import _get_client, init_qdrant
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
                    print("\n==============================================")
                    print("NGROK Tunnel is live!")
                    print(f"Public URL: {public_url}")
                    print(f"WhatsApp Webhook URL: {public_url}/webhook")
                    print("==============================================\n")
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

# Voice agent endpoints remain UNAUTHENTICATED by JWT (ElevenLabs and the
# public website widget cannot send staff JWTs) -- each route authenticates
# itself: the /tools/* routes require a shared secret, the post-call webhook
# verifies ElevenLabs' HMAC signature, and /signed-url is intentionally public
# (rate-limited + CORS-scoped) since a browser can't hold a server secret.
app.include_router(voice_agent_router, prefix=settings.API_V1_STR, tags=["voice-agent"])

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
app.include_router(
    complaints_router,
    prefix=settings.API_V1_STR,
    tags=["complaints"],
    dependencies=[Depends(verify_jwt)],
)
