from fastapi import Depends, FastAPI, Header, HTTPException
from contextlib import asynccontextmanager
from pydantic import BaseModel
import hmac
import secrets
import logging
import time
from collections import deque
from typing import Deque, Dict
import os
from typing import Optional
import httpx
from supabase import create_client, Client
from dotenv import load_dotenv
from datetime import datetime, timedelta, timezone

# Load env
load_dotenv()

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("otp-service")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start ngrok tunnel if enabled
    if os.getenv("USE_NGROK") == "true":
        try:
            from pyngrok import ngrok
            # Check for existing tunnels on port 5001 to avoid duplicates during reload
            tunnels = ngrok.get_tunnels()
            existing_tunnel = next((t for t in tunnels if ":5001" in t.config['addr']), None)
            
            if not existing_tunnel:
                # Use ID and URL from .env if available
                ngrok_id = os.getenv("ID")
                ngrok_url = os.getenv("URL")
                
                if ngrok_id and len(ngrok_id) > 20 and not ngrok_id.startswith("rd_"): 
                    ngrok.set_auth_token(ngrok_id)
                
                connect_kwargs = {"addr": 5001}
                if ngrok_url:
                    connect_kwargs["domain"] = ngrok_url
                
                # Only use ID as name if it's not the auth token
                if ngrok_id and len(ngrok_id) <= 20:
                    connect_kwargs["name"] = ngrok_id
                else:
                    connect_kwargs["name"] = "otp-service-tunnel"
                
                try:
                    public_url = ngrok.connect(**connect_kwargs).public_url
                    print(f"\n==============================================")
                    print(f"OTP Service NGROK Tunnel is live!")
                    print(f"Public URL: {public_url}")
                    print(f"==============================================\n")
                except Exception as connect_error:
                    if "already online" in str(connect_error).lower():
                        print(f"\n[NGROK] Tunnel is already online for domain {ngrok_url}. Skipping startup.")
                    else:
                        raise connect_error
            else:
                print(f"\nNGROK Tunnel already active: {existing_tunnel.public_url}\n")
        except Exception as e:
            logger.error(f"Failed to start ngrok: {e}")
    yield

app = FastAPI(title="OTP Service", lifespan=lifespan)

@app.get("/")
async def root():
    return {
        "message": "OTP Service is running",
        "endpoints": {
            "generate": "/generate [POST]",
            "verify": "/verify [POST]",
            "health": "/health [GET]"
        }
    }


@app.get("/health")
async def health():
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}

# Supabase init (accept the project's env var names as fallbacks so the service
# runs with the shared root .env, which uses VITE_SUPABASE_URL + service-role key).
SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
# NO publishable-key fallback. VITE_SUPABASE_PUBLISHABLE_KEY is the key the
# React frontend ships to browsers; using it here meant live OTP codes in
# bank_otps were readable by anything holding that key. This service needs the
# service-role key, and bank_otps must have RLS on with no anon policies
# (see whatsapp-support-backend/scripts/sql/bank_otps_hardening.sql).
SUPABASE_KEY = os.getenv("SUPABASE_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")

supabase: Optional[Client] = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    except Exception as e:
        logger.error(f"Failed to init Supabase client: {e}")
else:
    logger.warning(
        "Supabase not configured (SUPABASE_URL/VITE_SUPABASE_URL + key). "
        "OTP storage/verification will return an error until it is set."
    )

# WhatsApp settings for Security Number
SECURITY_WHATSAPP_PHONE_NUMBER_ID = os.getenv("SECURITY_WHATSAPP_PHONE_NUMBER_ID")
SECURITY_WHATSAPP_ACCESS_TOKEN = os.getenv("SECURITY_WHATSAPP_ACCESS_TOKEN")
WHATSAPP_BUSINESS_ACCOUNT_ID = os.getenv("WhatsAPP_BUSSINES")

OTP_SERVICE_SHARED_SECRET = os.getenv("OTP_SERVICE_SHARED_SECRET")
OTP_CODE_LENGTH = int(os.getenv("OTP_CODE_LENGTH", "6"))
OTP_MAX_VERIFY_ATTEMPTS = int(os.getenv("OTP_MAX_VERIFY_ATTEMPTS", "5"))

if not OTP_SERVICE_SHARED_SECRET:
    # Fail closed: /generate can send WhatsApp messages to any number and
    # /verify is a brute-force oracle, so neither may be reachable anonymously.
    raise RuntimeError(
        "OTP_SERVICE_SHARED_SECRET is not set. Refusing to start: this service "
        "would otherwise accept unauthenticated requests from the public internet."
    )


async def require_service_key(x_otp_service_key: Optional[str] = Header(None)) -> None:
    """Shared-secret auth between the backend and this service.

    Note this only helps over TLS -- a bearer secret on plain HTTP buys nothing.
    """
    if not x_otp_service_key or not hmac.compare_digest(
        x_otp_service_key, OTP_SERVICE_SHARED_SECRET
    ):
        logger.warning("Rejected OTP request with missing/invalid service key")
        raise HTTPException(status_code=401, detail="Unauthorized")


class _RateLimiter:
    """Per-key sliding window."""

    def __init__(self, limit: int, window_seconds: int) -> None:
        self.limit = limit
        self.window = window_seconds
        self._hits: Dict[str, Deque[float]] = {}

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        bucket = self._hits.setdefault(key, deque())
        while bucket and now - bucket[0] > self.window:
            bucket.popleft()
        if len(bucket) >= self.limit:
            return False
        bucket.append(now)
        return True


# 3 codes per phone per 15 min; 10 verify attempts per phone per 5 min.
_generate_limiter = _RateLimiter(3, 15 * 60)
_verify_limiter = _RateLimiter(10, 5 * 60)


def _normalize_phone(phone: str) -> str:
    return "".join(ch for ch in (phone or "") if ch.isdigit())


class OtpRequest(BaseModel):
    phone: str
    intent: Optional[str] = "BANK_ACCOUNT"

class VerifyRequest(BaseModel):
    phone: str
    otp: str

async def send_whatsapp_message(phone: str, text: str):
    url = f"https://graph.facebook.com/v21.0/{SECURITY_WHATSAPP_PHONE_NUMBER_ID}/messages"
    headers = {
        "Authorization": f"Bearer {SECURITY_WHATSAPP_ACCESS_TOKEN}",
        "Content-Type": "application/json"
    }
    payload = {
        "messaging_product": "whatsapp",
        "to": phone,
        "type": "text",
        "text": {"body": text}
    }
    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload, headers=headers)
        response.raise_for_status()
        return response.json()

@app.post("/generate", dependencies=[Depends(require_service_key)])
async def generate_otp(request: OtpRequest):
    if supabase is None:
        raise HTTPException(status_code=503, detail="Supabase not configured on the OTP service")
    phone = request.phone
    if not _generate_limiter.allow(_normalize_phone(phone)):
        raise HTTPException(status_code=429, detail="Too many OTP requests for this number")

    # CSPRNG for verification codes (A02: avoid predictable PRNG).
    # 6 digits, not 4: a 4-digit code is a 9,000-value space, which is trivially
    # brute-forced inside the 5-minute window.
    upper = 10 ** OTP_CODE_LENGTH
    lower = 10 ** (OTP_CODE_LENGTH - 1)
    otp = str(secrets.randbelow(upper - lower) + lower)
    # SECURITY: never log the OTP value (A09: sensitive data in logs).
    logger.info(f"Generating OTP for {phone}")
    
    # 1. Save to Supabase (bank_otps table)
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()
    try:
        # Retire any outstanding codes for this phone so only the newest is live.
        supabase.table("bank_otps").update(
            {"consumed_at": datetime.now(timezone.utc).isoformat()}
        ).eq("phone_number", phone).is_("consumed_at", "null").execute()
    except Exception as e:
        logger.error(f"Failed to retire previous OTPs: {e}")

    try:
        supabase.table("bank_otps").insert({
            "phone_number": phone, 
            "otp_code": otp,
            "expires_at": expires_at
        }).execute()
    except Exception as e:
        logger.error(f"Failed to save OTP to database: {e}")
        raise HTTPException(status_code=500, detail="Database error")

    # 2. Send via WhatsApp
    try:
        if request.intent == "CRITICAL_ACTION":
            message = f"رمز التحقق الخاص بك لإتمام العملية الحساسة هو: {otp}. يرجى عدم مشاركته مع أحد لحماية حسابك."
        else:
            message = f"الرمز الخاص بك للتحقق من بيانات الحساب في البنك الإسلامي الفلسطيني هو: {otp}. يرجى عدم مشاركته مع أحد."
            
        await send_whatsapp_message(phone, message)
        logger.info(f"OTP sent to {phone} for {request.intent} via WhatsApp")
    except Exception as e:
        logger.error(f"Failed to send WhatsApp message: {e}")
        # We don't fail the whole request as the OTP is still valid in DB
    
    # 3. Create in-app notification for audit trail (OTP value intentionally omitted)
    try:
        supabase.table("notifications").insert({
            "title": "🔑 PIB WhatsApp OTP",
            "message": f"A verification OTP was sent to {phone}.",
            "type": "info"
        }).execute()
    except:
        pass

    # INVARIANT: never return the code. The backend must not hold it -- it asks
    # /verify instead. Do not "helpfully" add an `otp` field here.
    return {"status": "sent", "phone": phone}

@app.post("/verify", dependencies=[Depends(require_service_key)])
async def verify_otp(request: VerifyRequest):
    if supabase is None:
        raise HTTPException(status_code=503, detail="Supabase not configured on the OTP service")

    if not _verify_limiter.allow(_normalize_phone(request.phone)):
        raise HTTPException(status_code=429, detail="Too many verification attempts")

    try:
        # Select by PHONE ONLY, then compare the code in Python. Matching on
        # .eq("otp_code", ...) meant a wrong guess returned no row, so there was
        # nothing to count -- attempts were effectively unlimited.
        response = (
            supabase.table("bank_otps")
            .select("*")
            .eq("phone_number", request.phone)
            .eq("verified", False)
            .is_("consumed_at", "null")
            .gt("expires_at", datetime.now(timezone.utc).isoformat())
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )

        if not response.data:
            return {"status": "invalid", "valid": False}

        row = response.data[0]
        attempts = (row.get("attempts") or 0) + 1

        if attempts > OTP_MAX_VERIFY_ATTEMPTS:
            supabase.table("bank_otps").update(
                {"consumed_at": datetime.now(timezone.utc).isoformat()}
            ).eq("id", row["id"]).execute()
            logger.warning("OTP burned after too many attempts")
            return {"status": "invalid", "valid": False}

        if hmac.compare_digest(str(row.get("otp_code") or ""), str(request.otp)):
            supabase.table("bank_otps").update(
                {
                    "verified": True,
                    "attempts": attempts,
                    "consumed_at": datetime.now(timezone.utc).isoformat(),
                }
            ).eq("id", row["id"]).execute()
            return {"status": "verified", "valid": True}

        supabase.table("bank_otps").update({"attempts": attempts}).eq(
            "id", row["id"]
        ).execute()
        return {"status": "invalid", "valid": False}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Verification error: {e}")
        raise HTTPException(status_code=500, detail="Database error")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5001)
