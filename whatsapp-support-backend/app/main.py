from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.v1.webhook import router as webhook_router
from app.api.v1.sessions import router as sessions_router

import asyncio
from contextlib import asynccontextmanager
from app.crud import crud

async def session_cleanup_task():
    """Periodic task to close inactive sessions"""
    from app.api.v1.webhook import auto_classify_session
    while True:
        try:
            await crud.close_inactive_sessions(None, minutes=10, on_close=auto_classify_session)
            await crud.delete_old_notifications(None, hours=24)
        except Exception as e:
            print(f"Error in session cleanup task: {e}")
        await asyncio.sleep(300) # Run every 5 minutes

@asynccontextmanager
async def lifespan(app: FastAPI):
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
                # Use public port from uvicorn or default to 5000
                public_url = ngrok.connect(5000).public_url
                print(f"\n==============================================")
                print(f"NGROK Tunnel is live!")
                print(f"Public URL: {public_url}")
                print(f"WhatsApp Webhook URL: {public_url}/webhook")
                print(f"==============================================\n")
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

@app.get("/")
def root():
    return {"message": "WhatsApp Support Backend Running"}
