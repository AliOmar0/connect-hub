from fastapi import APIRouter, Depends, HTTPException, Request, Response, BackgroundTasks
from app.api.v1.deps import get_session
from app.core.config import settings
from app.crud import crud
from app.models.enums import MessageDirection, ChannelType
from app.core.llm import llm_service
from app.core.whatsapp import WhatsAppClient
from typing import Any
import logging
from uuid import UUID

router = APIRouter()
logger = logging.getLogger("webhook")
# Force INFO level
logging.getLogger().setLevel(logging.INFO)

async def process_ai_response(db_session_id: UUID, user_message: str, customer_phone: str, config: dict):
    """
    Background task to get AI response and send back to WhatsApp
    """
    try:
        # 1. Get History (last 5 messages for context)
        msgs = await crud.get_messages_for_session(None, db_session_id)
        history = []
        # Take the last 5 messages for context, excluding the current one
        for m in msgs[-5:]:
            role = "user" if m.direction == MessageDirection.inbound else "assistant"
            history.append({"role": role, "content": m.content})
        
        # 2. Call LLM
        ai_text = await llm_service.get_ai_response(user_message, history)
        
        # 3. Send back to WhatsApp
        client = WhatsAppClient(
            phone_number_id=config.get("phone_number_id"),
            access_token=config.get("access_token")
        )
        await client.send_text_message(customer_phone, ai_text)
        
        # 4. Save Outbound Message
        await crud.create_message(
            None,
            session_id=db_session_id,
            content=ai_text,
            direction=MessageDirection.outbound
        )
    except Exception as e:
        logger.error(f"Error in background AI response: {e}")

@router.get("/webhook")
async def verify_webhook(request: Request, db: Any = Depends(get_session)):
    """
    Webhook verification for WhatsApp (Meta)
    """
    params = request.query_params
    mode = params.get("hub.mode")
    token = params.get("hub.verify_token")
    challenge = params.get("hub.challenge")

    logger.info(f"Webhook Verification: mode={mode}, token={token}, challenge={challenge}")
    logger.info(f"Expected Token: {settings.WHATSAPP_VERIFY_TOKEN}")

    if mode == "subscribe" and token:
        # 1. Check if token matches environment variable
        if token == settings.WHATSAPP_VERIFY_TOKEN:
            return Response(content=challenge, media_type="text/plain")
        
        # 2. Check if token is in the database (api_configurations.api_secret_encrypted or metadata)
        api_config = await crud.get_api_config(db, ChannelType.whatsapp)
        if api_config and api_config.is_active:
            if token == api_config.api_secret_encrypted:
                return Response(content=challenge, media_type="text/plain")
            
            if api_config.config_metadata and api_config.config_metadata.get("verify_token") == token:
                return Response(content=challenge, media_type="text/plain")

        raise HTTPException(status_code=403, detail="Verification failed")
        
    return Response(content="WhatsApp Webhook Server Active", media_type="text/plain")

@router.post("/webhook")
async def extract_webhook(
    request: Request, 
    background_tasks: BackgroundTasks,
    db: Any = Depends(get_session)
):
    """
    Receive WhatsApp messages
    """
    try:
        payload = await request.json()
        import json
        print(f"\nWEBHOOK_RECEIVED: {json.dumps(payload)}\n")
        logger.info(f"Incoming Webhook Payload: {json.dumps(payload)}")
    except Exception as e:
        print(f"WEBHOOK_ERROR: {e}")
        logger.error(f"Failed to parse JSON payload: {e}")
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Basic validation of structure
    entry = payload.get("entry", [])
    if not entry:
        return {"status": "ignored", "reason": "no entry"}
        
    changes = entry[0].get("changes", [])
    if not changes:
        return {"status": "ignored", "reason": "no changes"}
        
    value = changes[0].get("value", {})
    
    # Check for messages
    messages = value.get("messages", [])
    contacts = value.get("contacts", [])
    
    if messages:
        msg_data = messages[0]
        contact_data = contacts[0] if contacts else {}
        
        sender_phone = msg_data.get("from")
        name = contact_data.get("profile", {}).get("name", "Unknown")
        
        message_id = msg_data.get("id")
        text_body = msg_data.get("text", {}).get("body")
        msg_type = msg_data.get("type")
        
        if msg_type != "text":
            return {"status": "ignored", "reason": "non-text message phase 1"}
            
        if not sender_phone or not text_body:
             return {"status": "ignored", "reason": "incomplete data"}
             
        # 1. Find Customer
        customer = await crud.get_customer_by_phone(db, sender_phone)
        if not customer:
            customer = await crud.create_customer(db, sender_phone, name)
            
        # 2. Find/Create Session
        session = await crud.get_active_session_by_customer(db, customer.id)
        if not session:
            session = await crud.create_session(db, customer.id)
            
        # 3. Save Inbound Message
        await crud.create_message(
            db, 
            session_id=session.id, 
            content=text_body, 
            direction=MessageDirection.inbound, 
            external_id=message_id
        )
        
        # 4. Fetch dynamic configuration
        api_config = await crud.get_api_config(db, ChannelType.whatsapp)
        config_data = {}
        if api_config and api_config.is_active:
            config_data = {
                "phone_number_id": api_config.phone_number_id,
                "access_token": api_config.access_token_encrypted
            }
        
        # 5. Trigger AI process in background only if no human agent is joined
        if session.employee_id is None:
            background_tasks.add_task(
                process_ai_response, 
                session.id, 
                text_body, 
                sender_phone,
                config_data
            )
        else:
            logger.info(f"Human agent {session.employee_id} is assigned. Skipping AI response.")
        
    return {"status": "received"}
