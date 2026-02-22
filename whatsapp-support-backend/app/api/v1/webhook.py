from fastapi import APIRouter, Depends, HTTPException, Request, Response, BackgroundTasks
from app.api.v1.deps import get_session
from app.core.config import settings
from app.crud import crud
from app.models.enums import MessageDirection, ChannelType, SessionStatus
from app.core.llm import llm_service
from app.core.stt import stt_service
from app.core.whatsapp import WhatsAppClient
from app.core.notifications import NotificationService
from typing import Any, Optional
import logging
from uuid import UUID

router = APIRouter()
logger = logging.getLogger("webhook")
# Force INFO level
logging.getLogger().setLevel(logging.INFO)

# Security client for OTPs (Uses a different number if configured)
security_client = WhatsAppClient(
    phone_number_id=settings.SECURITY_WHATSAPP_PHONE_NUMBER_ID,
    access_token=settings.SECURITY_WHATSAPP_ACCESS_TOKEN
)

# In-memory store for OTP sessions (Similar to Node.js backend)
otp_sessions = {} # {db_session_id: {"type": "WAITING_OTP", "phone": "..."}}

async def send_whatsapp_otp(phone: str):
    """
    Generate and send OTP via the Security WhatsApp Number
    """
    import random
    otp = str(random.randint(1000, 9999))
    logger.info(f"[OTP] Generated {otp} for {phone} (WhatsApp Delivery)")
    
    # 1. Save to Supabase
    await crud.create_bank_otp(phone, otp)
    
    # 2. Send via Security WhatsApp
    # If security credentials are not provided, it will fallback to defaults (or error)
    try:
        message = f"الرمز الخاص بك للتحقق من بيانات الحساب في البنك الإسلامي الفلسطيني هو: {otp}. يرجى عدم مشاركته مع أحد."
        await security_client.send_text_message(phone, message)
        logger.info(f"[OTP] Sent via Security WhatsApp to {phone}")
    except Exception as e:
        logger.error(f"[OTP Error] Failed to send via WhatsApp: {e}")
        # We still return OTP so it can be verified via Notification Bell
    
    # 3. Also create In-app notification (for redundancy/free testing)
    try:
        await crud.create_notification(
            None,
            title="🔑 PIB WhatsApp OTP",
            message=f"The WhatsApp OTP for {phone} (from security number) is: {otp}",
            type="info"
        )
    except:
        pass

    return otp


async def process_voice_message(db_session_id: UUID, media_id: str, sender_phone: str, message_id: str, config: dict):
    """
    Background task to download audio, transcribe, and then handle like a text message
    """
    try:
        # 1. Initialize WhatsApp Client
        client = WhatsAppClient(
            phone_number_id=config.get("phone_number_id"),
            access_token=config.get("access_token")
        )

        # 1.1 Mark as read & Send typing indicator
        await client.mark_message_as_read(message_id)
        await client.send_typing_indicator(sender_phone)

        # 2. Get Media URL
        media_url = await client.get_media_url(media_id)
        if not media_url:
            logger.error("Failed to get media URL")
            return

        # 3. Download Audio
        audio_bytes = await client.download_media(media_url)
        if not audio_bytes:
            logger.error("Failed to download audio")
            return

        # 4. Transcribe Audio
        transcription = await stt_service.transcribe_audio(audio_bytes)
        if not transcription:
            logger.error("Failed to transcribe audio")
            # Maybe send a message saying we couldn't understand the voice message
            await client.send_text_message(sender_phone, "نعتذر، لم نتمكن من فهم الرسالة الصوتية. هل يمكنك إرسالها بنص؟")
            return

        logger.info(f"Transcription: {transcription}")

        # 5. Save Inbound Message (Transcribed)
        # In background tasks, we don't need to worry about the session dependency
        # since our CRUD uses the global supabase client.
        await crud.create_message(
            None,
            session_id=db_session_id,
            content=f"[رسالة صوتية]: {transcription}",
            direction=MessageDirection.inbound,
            external_id=message_id
        )
        
        # 6. Check if AI should respond
        session = await crud.get_session_by_id(None, db_session_id)
        if session and session.employee_id is None and session.status != SessionStatus.escalated:
            # 7. Call LLM & Send Response
            await process_ai_response(db_session_id, transcription, sender_phone, config)
        else:
            logger.info(f"Skipping AI response for voice message in session {db_session_id}. Status: {session.status if session else 'Unknown'}")

    except Exception as e:
        logger.error(f"Error in background voice processing: {e}")

async def auto_classify_session(db_session_id: UUID, user_message: Optional[str] = None):
    """
    Background task to classify session type based on history
    """
    try:
        # 1. Fetch types
        types = await crud.get_session_main_types(None)
        if not types:
            return

        # 2. Fetch session
        session = await crud.get_session_by_id(None, db_session_id)
        if not session or session.main_type_id:
            # Already classified or session gone
            return

        # 3. Get history for context
        msgs = await crud.get_messages_for_session(None, db_session_id)
        history = []
        for m in msgs:
            role = "user" if m.direction == MessageDirection.inbound else "assistant"
            history.append({"role": role, "content": m.content})
        
        # If user_message not provided, use the last inbound message
        if not user_message:
            inbound_msgs = [m for m in msgs if m.direction == MessageDirection.inbound]
            if inbound_msgs:
                user_message = inbound_msgs[-1].content
            else:
                user_message = ""

        # 4. Call LLM for classification
        logger.info(f"Triggering auto-classification for session {db_session_id} with message: {user_message[:50]}...")
        classified_type_id = await llm_service.classify_session(user_message, types, history)
        
        if classified_type_id:
            logger.info(f"Auto-classified session {db_session_id} as {classified_type_id}")
            await crud.update_session_main_type(None, db_session_id, UUID(classified_type_id))
        else:
            logger.info(f"Auto-classification returned no match (None) for session {db_session_id}")
    except Exception as e:
        logger.error(f"Error in auto_classify_session background task: {e}")

async def process_ai_response(
    db_session_id: UUID, 
    user_message: str, 
    customer_phone: str, 
    config: dict, 
    message_id: Optional[str] = None, 
    db_message_id: Optional[UUID] = None
):
    """
    Background task to get AI response and send back to WhatsApp
    """
    try:
        # 0. Safety Check: Verify session is still eligible for AI response
        session = await crud.get_session_by_id(None, db_session_id)
        if not session or session.status == SessionStatus.escalated or session.employee_id is not None:
            logger.info(f"Aborting AI response for session {db_session_id}. Reason: {'Escalated' if session and session.status == SessionStatus.escalated else 'Agent Assigned' if session else 'Session Not Found'}")
            return

        # Initialize WhatsApp Client
        client = WhatsAppClient(
            phone_number_id=config.get("phone_number_id"),
            access_token=config.get("access_token")
        )

        # Mark as read & Send typing indicator
        if message_id:
            await client.mark_message_as_read(message_id)
        await client.send_typing_indicator(customer_phone)

        # --- Bank Verification Logic (New) ---
        state = otp_sessions.get(str(db_session_id))
        
        # Scenario: User provided OTP
        if state and state.get("type") == "WAITING_OTP":
            import re
            digits = "".join(re.findall(r'\d+', user_message))
            if digits == state.get("otp"):
                account = await crud.get_bank_account(customer_phone)
                # Cleanup state
                otp_sessions.pop(str(db_session_id), None)
                
                if account:
                    ai_text = f"تم التحقق بنجاح! سيد {account['owner_name']}، رصيد حسابك هو {account['balance']} {account['currency']}. رقم حسابك: {account['account_number']}. هل هناك شيء آخر؟"
                else:
                    ai_text = "تم التحقق، ولكن لم نجد بيانات حساب مرتبطة بهذا الرقم."
                
                await client.send_text_message(customer_phone, ai_text)
                await crud.create_message(None, session_id=db_session_id, content=ai_text, direction=MessageDirection.outbound)
                return
            else:
                if "إلغاء" in user_message or "cancel" in user_message.lower():
                    otp_sessions.pop(str(db_session_id), None)
                    ai_text = "تم إلغاء طلب التحقق. كيف يمكنني مساعدتك بشكل عام؟"
                else:
                    ai_text = "رمز التحقق غير صحيح. يرجى المحاولة مرة أخرى أو قول 'إلغاء'."
                
                await client.send_text_message(customer_phone, ai_text)
                await crud.create_message(None, session_id=db_session_id, content=ai_text, direction=MessageDirection.outbound)
                return
        # --- End Bank Verification Logic ---


        # 1. Get History (last 5 messages for context)
        msgs = await crud.get_messages_for_session(None, db_session_id)
        history = []
        # Take the last 5 messages for context, excluding the current one
        for m in msgs[-5:]:
            role = "user" if m.direction == MessageDirection.inbound else "assistant"
            history.append({"role": role, "content": m.content})
        
        # 1.5 Get Session Types for awareness
        session_types = await crud.get_session_main_types(None)

        # 2. Call LLM
        ai_text = await llm_service.get_ai_response(user_message, history, session_types)

        # --- Bank Intent Detection (New) ---
        account_keywords = ["رصيدي", "حسابي", "balance", "account", "بياناتي", "حساب"]
        is_asking_account = any(k in user_message.lower() for k in account_keywords)
        
        if is_asking_account:
            account = await crud.get_bank_account(customer_phone)
            if account:
                otp = await send_whatsapp_otp(customer_phone)
                otp_sessions[str(db_session_id)] = {"type": "WAITING_OTP", "otp": otp, "phone": customer_phone}
                ai_text = "لقد قمت بإرسال رمز تحقق (OTP) عبر واتساب من رقم الحماية الخاص بنا. يرجى تزويدي بالرمز لنتمكن من عرض بيانات حسابك بأمان."
            else:
                ai_text = "عذراً، لم أجد حساباً مرتبطاً برقم الهاتف هذا في قاعدة بياناتنا."
            
            await client.send_text_message(customer_phone, ai_text)
            await crud.create_message(None, session_id=db_session_id, content=ai_text, direction=MessageDirection.outbound)
            return
        # --- End Bank Intent Detection ---
        
        # 2.5 Classify session (Understanding Required)
        # We trigger this in every response attempt if not yet classified
        if session.main_type_id is None:
            # We call it as a separate task logic here directly for responsiveness
            # or we could use another background task
            await auto_classify_session(db_session_id, user_message)

        # 3. Handle Escalation or Send Response
        if "[ESCALATE]" in ai_text:
            # Extract clean message
            clean_text = ai_text.replace("[ESCALATE]:", "").replace("[ESCALATE]", "").strip()
            
            # Send the handover message
            await client.send_text_message(customer_phone, clean_text)
            
            # Update session status to escalated
            # We need a db session here. Since process_ai_response is background task, 
            # we should best use a fresh session or rely on crud handling it if it accepts None (it does for read, but update might need commit).
            # Looking at crud.py, update_session_status uses supabase client directly which is global. So None is fine.
            await crud.update_session_status(None, db_session_id, SessionStatus.escalated)

            # NEW: Classification at Escalation (End of AI conversation)
            # Fetch fresh session state to be sure
            session = await crud.get_session_by_id(None, db_session_id)
            if session and session.main_type_id is None:
                await auto_classify_session(db_session_id, user_message)

            # Create Database Notifications for all employees
            # We use a single broadcast notification (user_id=None) visible to everyone.
            # This avoids creating N notifications for N employees (preventing duplicates).
            
            try:
                await crud.create_notification(
                    None,
                    user_id=None,
                    title="⚠️ New Escalation Request",
                    message=f"Customer {customer_phone} requires human assistance.",
                    type="escalation",
                    action_url=f"/sessions/{db_session_id}"
                )
            except Exception as e:
                logger.error(f"Failed to create broadcast notification: {e}")

            logger.info(f"Session {db_session_id} escalated to human agent. Broadcast notification created.")
            
            # Send Notification
            await NotificationService.send_escalation_email(
                str(db_session_id), 
                customer_phone, 
                clean_text if clean_text else "AI decided to escalate"
            )
        else:
            # Send normal response
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
        
        # Audio handling
        media_id = None
        if msg_type == "audio":
            media_id = msg_data.get("audio", {}).get("id")
            if not media_id:
                return {"status": "ignored", "reason": "audio message without media id"}
        elif msg_type != "text":
            return {"status": "ignored", "reason": f"unsupported message type: {msg_type}"}
            
        if not sender_phone or (msg_type == "text" and not text_body):
             return {"status": "ignored", "reason": "incomplete data"}
             
        # 1. Find Customer
        customer = await crud.get_customer_by_phone(db, sender_phone)
        if not customer:
            customer = await crud.create_customer(db, sender_phone, name)
            
        # 2. Find/Create Session
        session = await crud.get_active_session_by_customer(db, customer.id)
        
        if not session:
            # Create a fresh session every time if no active/waiting/escalated session exists
            logger.info(f"No active session found. Creating fresh session for customer {customer.id}")
            session = await crud.create_session(db, customer.id)
            
            # Notify agents of new session
            await crud.create_notification(
                db,
                user_id=None,  # Broadcast
                title="New Session Started",
                message=f"Customer {sender_phone} started a new conversation.",
                type="info",
                action_url=f"/sessions/{session.id}"
            )
        
        # NEW: If session was Escalated, do NOT change to Active automatically. Just notify.
        if session.status == SessionStatus.escalated:
            logger.info(f"Session {session.id} is Escalated. Customer replied. Notifying agents.")
            
            # Notify agents
            await crud.create_notification(
                db,
                user_id=None, # Broadcast
                title="New Reply in Escalated Session",
                message=f"Customer {sender_phone} sent a new message.",
                type="info", 
                action_url=f"/sessions/{session.id}"
            )
            # We do NOT change status to Active here.
            # We do NOT let it fall through to AI (because AI checks status).

            
        # 3. Save Inbound Message (If text)
        db_message = None
        if msg_type == "text":
            db_message = await crud.create_message(
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
        
        # 5. Trigger AI process or Voice Transcription in background
        if msg_type == "text":
            # ALWAYS try to classify if not yet classified, regardless of AI status
            if session.main_type_id is None:
                background_tasks.add_task(auto_classify_session, session.id, text_body)

            if session.status != SessionStatus.escalated and session.employee_id is None:
                background_tasks.add_task(
                    process_ai_response, 
                    session.id, 
                    text_body, 
                    sender_phone,
                    config_data,
                    message_id,     # WhatsApp ID
                    db_message.id   # Database ID
                )
            else:
                 # If Escalated, rely on the notification we sent (or will send)
                 reason = "Escalated" if session.status == SessionStatus.escalated else "Agent Assigned"
                 logger.info(f"Skipping AI response for text message in session {session.id}. Reason: {reason}")

        
        elif msg_type == "audio":
            # Always process voice message to ensure transcription is available for agents
            background_tasks.add_task(
                process_voice_message,
                session.id,
                media_id,
                sender_phone,
                message_id,
                config_data
            )
        
    return {"status": "received"}
