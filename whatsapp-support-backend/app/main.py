from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.v1.webhook import router as webhook_router
from app.api.v1.sessions import router as sessions_router
from app.api.v1.knowledge_base import router as knowledge_base_router
from app.api.v1.decisions import router as decisions_router

import asyncio
from contextlib import asynccontextmanager
from app.crud import crud
import logging

class EndpointFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return record.getMessage().find("/typing") == -1

logging.getLogger("uvicorn.access").addFilter(EndpointFilter())

async def session_cleanup_task():
    """Periodic task to close inactive sessions"""
    from app.api.v1.webhook import auto_classify_session
    while True:
        try:
            await crud.close_inactive_sessions(None, minutes=10, on_close=auto_classify_session)
            await crud.delete_old_notifications(None, hours=24)
        except Exception as e:
            print(f"Error in session cleanup task: {e}")
        await asyncio.sleep(120) # Run every 2 minutes — keeps race window tight vs 10-min session timeout

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize RAG / Vector DB
    from app.core.rag import init_qdrant
    try:
        init_qdrant()
    except Exception as e:
        print(f"Failed to init Qdrant: {e}")
        
    # Startup: Start background tasks
    task = asyncio.create_task(session_cleanup_task())
    
    # Start ngrok tunnel if enabled
    if settings.USE_NGROK:
        try:
            from pyngrok import ngrok
            # Check for existing tunnels on port 5000 to avoid duplicates during reload
            tunnels = ngrok.get_tunnels()
            existing_tunnel = next((t for t in tunnels if ":5000" in t.config['addr']), None)
            
            if not existing_tunnel:
                # Use ID and URL from settings if available
                if settings.NGROK_ID and len(settings.NGROK_ID) > 20 and not settings.NGROK_ID.startswith("rd_"):
                    ngrok.set_auth_token(settings.NGROK_ID)
                
                connect_kwargs = {"addr": 5000}
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
                        print(f"\n[NGROK] Tunnel is already online for domain {settings.NGROK_URL}. Skipping startup.")
                    else:
                        raise connect_error
            else:
                print(f"\nNGROK Tunnel already active: {existing_tunnel.public_url}\n")
        except Exception as e:
            print(f"Failed to start ngrok: {e}")

    yield
    # Shutdown: Cancel background tasks
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass

app = FastAPI(title=settings.PROJECT_NAME, lifespan=lifespan)

# CORS
if settings.BACKEND_CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.BACKEND_CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Routers
# Webhook at root /webhook
app.include_router(webhook_router, tags=["webhook"])

# API V1
app.include_router(sessions_router, prefix=settings.API_V1_STR, tags=["sessions"])
app.include_router(knowledge_base_router, prefix=settings.API_V1_STR, tags=["knowledge-base"])
app.include_router(decisions_router, prefix=f"{settings.API_V1_STR}/decisions", tags=["decisions"])

@app.get("/")
def root():
    return {"message": "WhatsApp Support Backend Running"}
