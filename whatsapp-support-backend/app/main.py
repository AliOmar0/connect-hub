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
    while True:
        try:
            await crud.close_inactive_sessions(None, minutes=10)
            await crud.delete_old_notifications(None, hours=24)
        except Exception as e:
            print(f"Error in session cleanup task: {e}")
        await asyncio.sleep(300) # Run every 5 minutes

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Start background tasks
    task = asyncio.create_task(session_cleanup_task())
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
