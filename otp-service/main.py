from fastapi import FastAPI, HTTPException, Body
from contextlib import asynccontextmanager
from pydantic import BaseModel
import random
import logging
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
            "webhook": "/webhook [POST] (alias for generate)",
            "health": "/health [GET]"
        }
    }


@app.get("/health")
async def health():
    return {"status": "healthy", "timestamp": datetime.now(timezone.utc).isoformat()}

# Supabase init
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# WhatsApp settings for Security Number
SECURITY_WHATSAPP_PHONE_NUMBER_ID = os.getenv("SECURITY_WHATSAPP_PHONE_NUMBER_ID")
SECURITY_WHATSAPP_ACCESS_TOKEN = os.getenv("SECURITY_WHATSAPP_ACCESS_TOKEN")
WHATSAPP_BUSINESS_ACCOUNT_ID = os.getenv("WhatsAPP_BUSSINES")

class OtpRequest(BaseModel):
    phone: str

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

@app.post("/generate")
@app.post("/webhook")
async def generate_otp(request: OtpRequest):
    phone = request.phone
    otp = str(random.randint(1000, 9999))
    logger.info(f"Generating OTP {otp} for {phone}")
    
    # 1. Save to Supabase (bank_otps table)
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()
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
        message = f"الرمز الخاص بك للتحقق من بيانات الحساب في البنك الإسلامي الفلسطيني هو: {otp}. يرجى عدم مشاركته مع أحد."
        await send_whatsapp_message(phone, message)
        logger.info(f"OTP sent to {phone} via WhatsApp")
    except Exception as e:
        logger.error(f"Failed to send WhatsApp message: {e}")
        # We don't fail the whole request as the OTP is still valid in DB
    
    # 3. Create In-app notification for redundancy (optional but keeping it for now)
    try:
        supabase.table("notifications").insert({
            "title": "🔑 PIB WhatsApp OTP",
            "message": f"The WhatsApp OTP for {phone} is: {otp}",
            "type": "info"
        }).execute()
    except:
        pass

    return {"status": "sent", "phone": phone, "otp": otp}

@app.post("/verify")
async def verify_otp(request: VerifyRequest):
    try:
        response = supabase.table("bank_otps")\
            .select("*")\
            .eq("phone_number", request.phone)\
            .eq("otp_code", request.otp)\
            .eq("verified", False)\
            .gt("expires_at", datetime.now(timezone.utc).isoformat())\
            .order("created_at", desc=True)\
            .limit(1)\
            .execute()
        
        if response.data:
            # Mark as verified
            otp_id = response.data[0]['id']
            supabase.table("bank_otps").update({"verified": True}).eq("id", otp_id).execute()
            return {"status": "verified", "valid": True}
        else:
            return {"status": "invalid", "valid": False}
    except Exception as e:
        logger.error(f"Verification error: {e}")
        raise HTTPException(status_code=500, detail="Database error")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5001)
