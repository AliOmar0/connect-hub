from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api.v1.webhook import router as webhook_router
from app.api.v1.sessions import router as sessions_router

app = FastAPI(title=settings.PROJECT_NAME)

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
# Webhook at root /webhook (as requested by prompt "POST /webhook")
app.include_router(webhook_router, tags=["webhook"])

# API V1
app.include_router(sessions_router, prefix=settings.API_V1_STR, tags=["sessions"])

@app.get("/")
def root():
    return {"message": "WhatsApp Support Backend Running"}
