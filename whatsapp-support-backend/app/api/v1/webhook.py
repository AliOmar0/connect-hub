from fastapi import APIRouter, Depends, HTTPException, Request, Response, BackgroundTasks
from app.api.v1.deps import get_session
from app.core.config import settings
from app.crud import crud
from app.models.enums import MessageDirection, ChannelType, SessionStatus
from app.core.llm import llm_service
from app.core.stt import stt_service
from app.core.whatsapp import WhatsAppClient
from app.core.notifications import NotificationService
from app.core.message_buffer import message_buffer
from typing import Any, Optional
import logging
import hmac
import hashlib
import httpx
from uuid import UUID

router = APIRouter()
logger = logging.getLogger("webhook")


def _verify_whatsapp_signature(raw_body: bytes, signature_header: Optional[str]) -> bool:
    """
    Verify Meta's X-Hub-Signature-256 header against the raw request body.

    Short-circuits to True when WHATSAPP_VERIFY_SIGNATURE=false (dev/local mode).
    Returns True when verification passes OR when no app secret is configured.
    Returns False only when a secret is configured and the signature is missing
    or does not match.
    """
    # Honour the opt-out flag (set in .env for local/dev environments).
    if not settings.WHATSAPP_VERIFY_SIGNATURE:
        logger.debug("Webhook signature verification disabled via WHATSAPP_VERIFY_SIGNATURE=false")
        return True

    app_secret = settings.WHATSAPP_APP_SECRET
    if not app_secret:
        logger.warning(
            "WHATSAPP_APP_SECRET not configured - skipping webhook signature "
            "verification. Set it in production to reject forged requests."
        )
        return True

    if not signature_header or not signature_header.startswith("sha256="):
        logger.warning(
            "Webhook rejected: X-Hub-Signature-256 header missing or malformed. "
            f"Received: {signature_header!r}"
        )
        return False

    expected = "sha256=" + hmac.new(
        app_secret.encode("utf-8"), raw_body, hashlib.sha256
    ).hexdigest()

    match = hmac.compare_digest(expected, signature_header)
    if not match:
        logger.warning(
            "Webhook signature mismatch. "
            f"Expected prefix: {expected[:20]}... | "
            f"Received prefix: {signature_header[:20]}... | "
            "Check that WHATSAPP_APP_SECRET matches your Meta App's App Secret."
        )
    return match


# In-memory store for OTP sessions (Similar to Node.js backend)
otp_sessions = {} # {db_session_id: {"type": "WAITING_OTP", "phone": "..."}}

# Track processed WhatsApp message IDs to prevent duplicate webhook processing.
# Uses an OrderedDict as a true LRU: oldest-inserted entries are evicted first
# once the cap is hit, unlike a plain set (which has no defined eviction order).
from collections import OrderedDict
_processed_message_ids: "OrderedDict[str, None]" = OrderedDict()
_MAX_PROCESSED_IDS = 10000  # Prevent unbounded memory growth


def _remember_message_id(message_id: str) -> None:
    """Record `message_id` as processed, evicting oldest entries past the cap.

    Kept separate from the webhook handler so the memory bound is testable on
    its own — the eviction used to live inline in `extract_webhook`, where no
    test could reach it without mocking an entire inbound request.
    """
    _processed_message_ids[message_id] = None
    while len(_processed_message_ids) > _MAX_PROCESSED_IDS:
        _processed_message_ids.popitem(last=False)

async def send_whatsapp_otp(phone: str, intent: str = "BANK_ACCOUNT"):
    """
    Call the standalone OTP service to generate and send OTP
    """
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                settings.OTP_SERVICE_URL,
                json={"phone": phone, "intent": intent},
                timeout=10.0
            )
            response.raise_for_status()
            data = response.json()
            return data.get("otp")
    except Exception as e:
        logger.error(f"[OTP Error] Failed to call OTP service: {e}")
        return None


from app.core.storage import storage_service

async def process_voice_message(db_session_id: UUID, media_id: str, sender_phone: str, message_id: str, config: dict):
    """
    Background task to download audio, transcribe, and then handle like a text message.
    The voice message is ALWAYS persisted to the DB so agents can see and play it,
    regardless of whether transcription succeeds.
    """
    try:
        # 1. Initialize WhatsApp Client
        client = WhatsAppClient(
            phone_number_id=config.get("phone_number_id"),
            access_token=config.get("access_token")
        )

        # 1.1 Mark as read & send typing indicator
        await client.mark_message_as_read(message_id)
        await client.send_typing_indicator(sender_phone)

        # 2. Get Media URL
        media_url = await client.get_media_url(media_id)
        if not media_url:
            logger.error("Failed to get media URL for voice message")
            return

        # 3. Download Audio
        audio_bytes = await client.download_media(media_url)
        if not audio_bytes:
            logger.error("Failed to download audio bytes")
            return

        # 3.5 Upload to Supabase Storage so the dashboard can play back the audio
        stored_url = await storage_service.upload_audio(audio_bytes)
        if not stored_url:
            logger.warning("Failed to upload audio to storage — will still attempt transcription")

        # 4. Transcribe Audio via Deepgram
        transcription = await stt_service.transcribe_audio(audio_bytes)

        if transcription:
            # ── SUCCESS PATH ─────────────────────────────────────────────────
            logger.info(f"Voice transcription succeeded: {transcription[:80]}")

            # 5a. Save inbound message WITH transcription text
            await crud.create_message(
                None,
                session_id=db_session_id,
                content=f"[رسالة صوتية]: {transcription}",
                direction=MessageDirection.inbound,
                external_id=message_id,
                media_url=stored_url,
                media_type="audio/ogg"
            )

            # 6. Let the AI respond (if no agent is assigned and session is not escalated)
            session = await crud.get_session_by_id(None, db_session_id)
            if session and session.employee_id is None and session.status != SessionStatus.escalated:
                await process_ai_response(db_session_id, transcription, sender_phone, config)
            else:
                logger.info(
                    f"Skipping AI response for voice message in session {db_session_id}. "
                    f"Status: {session.status if session else 'Unknown'}"
                )
        else:
            # ── FAILURE PATH ─────────────────────────────────────────────────
            # Transcription failed (no Deepgram key, network error, empty result, etc.)
            # We still SAVE the voice message to the DB with a placeholder so agents
            # can see the audio and listen to it in the dashboard.
            logger.error("Voice transcription failed — saving audio-only message for agents")

            await crud.create_message(
                None,
                session_id=db_session_id,
                content="[رسالة صوتية]",
                direction=MessageDirection.inbound,
                external_id=message_id,
                media_url=stored_url,
                media_type="audio/ogg"
            )

            # Notify agents so they can listen manually
            await crud.create_notification(
                None,
                user_id=None,  # broadcast
                title="رسالة صوتية بحاجة لمراجعة",
                message=f"لم يتمكن النظام من تفريغ رسالة صوتية من {sender_phone}. يرجى الاستماع إليها.",
                type="warning",
                action_url=f"/sessions/{db_session_id}"
            )

            # Check if an agent is assigned; if not, ask the customer to repeat as text
            session = await crud.get_session_by_id(None, db_session_id)
            agent_available = session and session.employee_id is not None
            if not agent_available:
                await client.send_text_message(
                    sender_phone,
                    "نعتذر، لم نتمكن من فهم رسالتك الصوتية بوضوح.\n"
                    "هل يمكنك إعادة إرسال طلبك كرسالة نصية؟ سيسعدنا مساعدتك. 🙏"
                )

    except Exception as e:
        logger.error(f"Error in background voice processing: {e}", exc_info=True)


async def send_session_closing_message(session_id: UUID):
    """
    Called automatically when a WhatsApp session is closed due to inactivity.
    Sends a polite closing / satisfaction-check message to the customer,
    then triggers auto-classification.
    """
    try:
        from app.database import supabase as _supabase

        # 1. Get session
        session = await crud.get_session_by_id(None, session_id)
        if not session or not session.customer_id:
            logger.warning(f"send_session_closing_message: session {session_id} not found or has no customer")
            return

        # 2. Get customer phone
        cust_resp = _supabase.table("customers").select("phone").eq("id", str(session.customer_id)).execute()
        if not cust_resp.data:
            logger.warning(f"send_session_closing_message: customer not found for session {session_id}")
            return
        customer_phone = cust_resp.data[0].get("phone")
        if not customer_phone:
            return

        # 3. Get WhatsApp API config
        api_config = await crud.get_api_config(None, ChannelType.whatsapp)
        if not api_config or not api_config.is_active or not api_config.access_token_encrypted:
            logger.warning(f"send_session_closing_message: no active WhatsApp config for session {session_id}")
            # Still classify even if we can't send the message
            await auto_classify_session(session_id)
            return

        # 4. Build & send closing message
        closing_text = (
            "شكراً لتواصلك مع البنك الإسلامي الفلسطيني 🌟\n\n"
            "هل تم حل مشكلتك بشكل كامل؟\n"
            "نسعد دائماً بخدمتك، وفي حال احتجت أي مساعدة إضافية لا تتردد في التواصل معنا مجدداً. 🤝"
        )

        client = WhatsAppClient(
            phone_number_id=api_config.phone_number_id,
            access_token=api_config.access_token_encrypted
        )
        await client.send_text_message(customer_phone, closing_text)

        # 5. Save the closing message to DB so agents / dashboard can see it
        await crud.create_message(
            None,
            session_id=session_id,
            content=closing_text,
            direction=MessageDirection.outbound,
        )

        logger.info(f"Sent closing message for session {session_id} to {customer_phone}")

    except Exception as e:
        logger.error(f"Error in send_session_closing_message for session {session_id}: {e}", exc_info=True)
    finally:
        # Always run classification regardless of whether the message was sent
        try:
            await auto_classify_session(session_id)
        except Exception as e:
            logger.error(f"auto_classify_session failed after closing message: {e}")

async def process_sticker_message(db_session_id: UUID, media_id: str, sender_phone: str, message_id: str, config: dict):
    """
    Background task to download sticker, upload to storage, and save message
    """
    try:
        client = WhatsAppClient(
            phone_number_id=config.get("phone_number_id"),
            access_token=config.get("access_token")
        )
        await client.mark_message_as_read(message_id)

        media_url = await client.get_media_url(media_id)
        if not media_url:
            return

        sticker_bytes = await client.download_media(media_url)
        if not sticker_bytes:
            return

        stored_url = await storage_service.upload_sticker(sticker_bytes)
        
        await crud.create_message(
            None,
            session_id=db_session_id,
            content="[Sticker]",
            direction=MessageDirection.inbound,
            external_id=message_id,
            media_url=stored_url,
            media_type="image/webp"
        )
    except Exception as e:
        logger.error(f"Error in background sticker processing: {e}")

async def process_image_message(
    db_session_id: UUID, 
    media_id: str, 
    sender_phone: str, 
    message_id: str, 
    config: dict,
    caption: Optional[str] = None
):
    """
    Background task to download image, upload to storage, analyze with vision AI, and respond.
    Follows the same pattern as process_voice_message.
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
            logger.error("Failed to get image media URL")
            return

        # 3. Download Image
        image_bytes = await client.download_media(media_url)
        if not image_bytes:
            logger.error("Failed to download image")
            return

        # 3.5 Upload to Storage for dashboard display
        stored_url = await storage_service.upload_image(image_bytes)
        if not stored_url:
            logger.warning("Failed to upload image to storage - but will still analyze")

        # 4. Save Inbound Message to DB
        content = "[Image]"
        if caption:
            content = f"[Image]: {caption}"
        
        # Detect image type for media_type field
        from app.core.storage import StorageService
        media_type = StorageService._detect_image_type(image_bytes)
        
        await crud.create_message(
            None,
            session_id=db_session_id,
            content=content,
            direction=MessageDirection.inbound,
            external_id=message_id,
            media_url=stored_url,
            media_type=media_type
        )
        
        # 5. Check if AI should respond
        session = await crud.get_session_by_id(None, db_session_id)
        if session and session.employee_id is None and session.status != SessionStatus.escalated:
            # 6. Fetch conversation history and session types
            history = await crud.get_messages_for_session(None, db_session_id, limit=10)
            session_types = await crud.get_session_main_types(None)
            
            # 7. Analyze image with Vision AI
            from app.core.vision import vision_service
            
            ai_response = await vision_service.analyse_image(
                image_bytes=image_bytes,
                user_text=caption,
                history=history,
                session_types=session_types,
                current_type_id=str(session.main_type_id) if session.main_type_id else None
            )
            
            # 8. Send AI response via WhatsApp
            if ai_response:
                await client.send_text_message(sender_phone, ai_response)
                
                # 9. Save outbound message to DB
                await crud.create_message(
                    None,
                    session_id=db_session_id,
                    content=ai_response,
                    direction=MessageDirection.outbound
                )
        else:
            logger.info(f"Skipping AI response for image message in session {db_session_id}. Status: {session.status if session else 'Unknown'}")

    except Exception as e:
        logger.error(f"Error in background image processing: {e}")

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
    Process AI response for a (possibly combined) user message.
    Called by the message buffer after collecting all messages.
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

        # --- Bank & Critical Verification Logic ---
        state = otp_sessions.get(str(db_session_id))
        
        # Scenario: User provided OTP (digits only)
        import re
        if state and state.get("type") == "WAITING_OTP":
            digits = "".join(re.findall(r'\d+', user_message))
            if digits and digits == state.get("otp"):
                intent = state.get("intent", "BANK_ACCOUNT")
                # Cleanup state
                otp_sessions.pop(str(db_session_id), None)
                
                if intent == "BANK_ACCOUNT":
                    account = await crud.get_bank_account(customer_phone)
                    if account:
                        ai_text = f"تم التحقق بنجاح! سيد {account['owner_name']}، رصيد حسابك هو {account['balance']} {account['currency']}. رقم حسابك: {account['account_number']}. هل هناك شيء آخر؟"
                    else:
                        ai_text = "تم التحقق، ولكن لم نجد بيانات حساب مرتبطة بهذا الرقم."
                elif intent == "CRITICAL_ACTION":
                    ai_text = "✅ تم التحقق من هويتك بنجاح. لقد قمنا بتوثيق هذا الإجراء الحساس. كيف يمكنني متابعة طلبك الآن؟"
                else:
                    ai_text = "تم التحقق بنجاح! شكراً لك."
                
                await client.send_text_message(customer_phone, ai_text)
                await crud.create_message(None, session_id=db_session_id, content=ai_text, direction=MessageDirection.outbound)
                return
            elif digits:
                # User sent digits but they were wrong
                if "إلغاء" in user_message or "cancel" in user_message.lower():
                    otp_sessions.pop(str(db_session_id), None)
                    ai_text = "تم إلغاء طلب التحقق. كيف يمكنني مساعدتك بشكل عام؟"
                else:
                    ai_text = "رمز التحقق غير صحيح. يرجى المحاولة مرة أخرى أو قول 'إلغاء'."
                
                await client.send_text_message(customer_phone, ai_text)
                await crud.create_message(None, session_id=db_session_id, content=ai_text, direction=MessageDirection.outbound)
                return
        # --- End Verification Logic ---


        # 1. Get History (last 5 messages for context)
        msgs = await crud.get_messages_for_session(None, db_session_id)
        history = []
        # Take the last 5 messages for context, excluding the current one
        for m in msgs[-5:]:
            role = "user" if m.direction == MessageDirection.inbound else "assistant"
            history.append({"role": role, "content": m.content})
        
        # 1.5 Get Session Types for awareness
        session_types = await crud.get_session_main_types(None)

        # 2. Call LLM with the combined message
        logger.info(f"[AI] Sending combined message to LLM for session {db_session_id}: '{user_message[:100]}...'")
        ai_text = await llm_service.get_ai_response(user_message, history, session_types, current_type_id=session.main_type_id)

        # --- Personal account limits: escalate instead of redirecting to call center ---
        msg_lower = user_message.lower()
        personal_limits_keywords = [
            "حدودي", "حد بطاقتي", "حد حسابي", "حدود حسابي", "حدود بطاقتي",
            "الحدود المطبقة", "حدودي الحالية", "حد التحويل لحسابي",
            "my card limit", "my account limit", "my limits",
        ]
        is_personal_limits = any(k in msg_lower for k in personal_limits_keywords)
        if not is_personal_limits:
            has_limit_word = any(w in msg_lower for w in ["حد", "حدود", "limit", "limits"])
            has_personal_marker = any(p in msg_lower for p in ["حسابي", "بطاقتي", "حدودي", "حالي", "my "])
            is_personal_limits = has_limit_word and has_personal_marker

        if is_personal_limits and "[ESCALATE]" not in ai_text:
            ai_text = (
                "[ESCALATE]: فهمت أنك تريد معرفة الحدود المطبقة على حسابك أو بطاقتك حالياً. "
                "سأحوّل طلبك إلى أحد موظفي خدمة العملاء لمتابعة استفسارك وتزويدك بالمعلومات الدقيقة الخاصة بحسابك."
            )

        # --- Intent Detection (Bank & Critical) ---
        # Refined keywords to avoid general inquiries like "how to open an account"
        account_keywords = ["رصيدي", "رصيد حسابي", "كشف حساب", "حسابي الشخصي", "my balance", "account balance"]
        critical_keywords = ["تحويل أموال", "تغيير كلمة المرور", "إغلاق حسابي", "money transfer", "reset password"]
        
        is_asking_private = any(k in user_message.lower() for k in account_keywords)
        is_critical = any(k in user_message.lower() for k in critical_keywords)
        
        # Check if AI itself decided an OTP is needed (from SYSTEM_PROMPT instructions)
        ai_mentions_otp = "رمز تحقق" in ai_text or "OTP" in ai_text
        
        if (is_asking_private or is_critical or ai_mentions_otp) and not state:
            # Determine intent
            intent = "BANK_ACCOUNT" if (is_asking_private or "رصيد" in user_message or "حساب" in user_message) else "CRITICAL_ACTION"
            
            # Additional check: If it's a general question about opening accounts or locations, ignore
            general_inquiry_keywords = ["كيف", "اين", "طريقة", "شروط", "how", "where", "location"]
            is_general = any(k in user_message.lower() for k in general_inquiry_keywords) and not is_asking_private
            
            if not is_general or ai_mentions_otp:
                otp = await send_whatsapp_otp(customer_phone, intent=intent)
                
                if otp:
                    otp_sessions[str(db_session_id)] = {
                        "type": "WAITING_OTP", 
                        "otp": otp, 
                        "phone": customer_phone,
                        "intent": intent
                    }
                    # Ensure AI response correctly explains the OTP wait
                    if "رمز تحقق" not in ai_text:
                        if intent == "BANK_ACCOUNT":
                            ai_text = "للقيام بذلك بأمان، سأقوم بإرسال رمز تحقق (OTP) الآن إلى رقمك المسجل. يرجى تزويدي بالرمز بمجرد وصوله لنتمكن من عرض بيانات حسابك."
                        else:
                            ai_text = "يتطلب هذا الإجراء الحساس عملية تحقق. لقد أرسلنا رمز (OTP) إلى هاتفك لضمان هويتك. يرجى تزويدي بالرمز للمتابعة."
                else:
                    ai_text = "عذراً، واجهنا مشكلة في إرسال رمز التحقق حالياً. يرجى المحاولة لاحقاً."
                
                await client.send_text_message(customer_phone, ai_text)
                await crud.create_message(None, session_id=db_session_id, content=ai_text, direction=MessageDirection.outbound)
                return
        # --- End Intent Detection ---
        
        # 2.5 Classify session (Understanding Required)
        if session.main_type_id is None:
            await auto_classify_session(db_session_id, user_message)

        # 3. Handle Escalation or Send Response
        if "[ESCALATE]" in ai_text:
            # Extract clean message
            clean_text = ai_text.replace("[ESCALATE]:", "").replace("[ESCALATE]", "").strip()
            
            # Send the handover message
            await client.send_text_message(customer_phone, clean_text)
            
            await crud.update_session_status(None, db_session_id, SessionStatus.escalated)

            # Clear the buffer for this session since it's escalated
            message_buffer.clear_session_buffer(db_session_id)

            # Classification at Escalation
            session = await crud.get_session_by_id(None, db_session_id)
            if session and session.main_type_id is None:
                await auto_classify_session(db_session_id, user_message)

            # Create Database Notifications
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


# Register the AI callback with the message buffer
message_buffer.set_ai_callback(process_ai_response)

@router.get("/webhook")
@router.get("/api/wa/webhook")
async def verify_webhook(request: Request, db: Any = Depends(get_session)):
    """
    Webhook verification for WhatsApp (Meta)

    Exposed at both /webhook and /api/wa/webhook so that Meta app configs
    pointing at either callback URL work. The optional `biz_id` query param
    used by the multi-tenant style URL is accepted but ignored (this backend
    is single-tenant; routing is resolved per phone_number_id in the payload).
    """
    params = request.query_params
    mode = params.get("hub.mode")
    token = params.get("hub.verify_token")
    challenge = params.get("hub.challenge")

    logger.info(f"Webhook Verification request: mode={mode}, challenge_present={challenge is not None}")

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
@router.post("/api/wa/webhook")
async def extract_webhook(
    request: Request, 
    background_tasks: BackgroundTasks,
    db: Any = Depends(get_session)
):
    """
    Receive WhatsApp messages.
    
    ANTI-DUPLICATE STRATEGY:
    1. WhatsApp message ID dedup: Prevents processing the same webhook delivery twice.
    2. Message Buffer: Collects rapid messages per session and combines them after 30s 
       of inactivity, sending only ONE AI request instead of multiple.
    3. Buffer lock: Prevents concurrent AI processing for the same session.
    """
    try:
        raw_body = await request.body()
        # Verify Meta's signature against the raw body BEFORE trusting any content
        # (A08: integrity / spoofed-webhook protection). No-op when secret unset.
        if not _verify_whatsapp_signature(raw_body, request.headers.get("x-hub-signature-256")):
            logger.warning("Rejected WhatsApp webhook with invalid/missing signature")
            raise HTTPException(status_code=401, detail="Invalid signature")

        import json
        payload = json.loads(raw_body)
        logger.debug("Incoming webhook payload received")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to parse JSON payload: {e}")
        raise HTTPException(status_code=400, detail="Invalid JSON")

    try:
        # Basic validation of structure
        entry = payload.get("entry", [])
        if not entry:
            return {"status": "ignored", "reason": "no entry"}
            
        changes = entry[0].get("changes", [])
        if not changes:
            return {"status": "ignored", "reason": "no changes"}
            
        value = changes[0].get("value", {})

        # Extract the phone_number_id Meta used to RECEIVE this message.
        # This is always the ground truth — the DB config may be stale.
        webhook_phone_number_id = value.get("metadata", {}).get("phone_number_id")
        
        # Check for messages
        messages = value.get("messages", [])
        contacts = value.get("contacts", [])

        if not messages:
            # Delivery/read receipts and other non-message events land here.
            # Mirror the "no entry"/"no changes" guards above instead of
            # falling through to the generic "received" at the end.
            return {"status": "ignored", "reason": "no messages"}
        
        if messages:
            msg_data = messages[0]
            contact_data = contacts[0] if contacts else {}
            
            sender_phone = msg_data.get("from")
            name = contact_data.get("profile", {}).get("name", "Unknown")
            
            message_id = msg_data.get("id")
            text_body = msg_data.get("text", {}).get("body")
            msg_type = msg_data.get("type")

            # ============================================================
            # DEDUP CHECK: Prevent processing the same WhatsApp message twice
            # (WhatsApp sometimes sends duplicate webhook deliveries)
            # ============================================================
            if message_id:
                if message_id in _processed_message_ids:
                    logger.warning(f"[DEDUP] Duplicate webhook for message {message_id}. Ignoring.")
                    return {"status": "ignored", "reason": "duplicate message_id"}

                # Record it (OrderedDict preserves insertion order) and evict
                # the OLDEST entries once the cap is hit.
                _remember_message_id(message_id)
            
            # Media handling
            media_id = None
            if msg_type == "audio":
                media_id = msg_data.get("audio", {}).get("id")
                if not media_id:
                    return {"status": "ignored", "reason": "audio message without media id"}
            elif msg_type == "sticker":
                media_id = msg_data.get("sticker", {}).get("id")
                if not media_id:
                    return {"status": "ignored", "reason": "sticker message without media id"}
            elif msg_type == "image":
                media_id = msg_data.get("image", {}).get("id")
                if not media_id:
                    return {"status": "ignored", "reason": "image message without media id"}
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
            
            # If session was Escalated, do NOT change to Active automatically. Just notify.
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

                
            # 3. Save Inbound Message IMMEDIATELY (for real-time dashboard display)
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
                db_phone_id = api_config.phone_number_id
                # Always prefer the phone_number_id from the webhook metadata:
                # it is the ID Meta used to receive this message and the one
                # that must be used when replying. The DB value may be stale.
                effective_phone_id = webhook_phone_number_id or db_phone_id
                if db_phone_id and webhook_phone_number_id and db_phone_id != webhook_phone_number_id:
                    logger.warning(
                        f"[Config Mismatch] DB phone_number_id ({db_phone_id}) differs from "
                        f"webhook metadata phone_number_id ({webhook_phone_number_id}). "
                        "Using webhook value. Update the DB config to suppress this warning."
                    )
                config_data = {
                    "phone_number_id": effective_phone_id,
                    "access_token": api_config.access_token_encrypted
                }
            elif webhook_phone_number_id:
                # DB config missing/inactive but we still have the phone ID from
                # the webhook — populate it so at least mark-as-read can resolve
                # the URL correctly (send_text will still fail without a token).
                config_data = {
                    "phone_number_id": webhook_phone_number_id,
                    "access_token": None
                }
                logger.warning(
                    "No active WhatsApp API config found in DB. "
                    f"Using phone_number_id={webhook_phone_number_id!r} from webhook metadata only. "
                    "Outbound messages will fail until an access_token is configured."
                )
            
            # 5. Trigger AI process or Voice Transcription
            if msg_type == "text":
                # ALWAYS try to classify if not yet classified, regardless of AI status
                if session.main_type_id is None:
                    background_tasks.add_task(auto_classify_session, session.id, text_body)

                if session.status != SessionStatus.escalated and session.employee_id is None:
                    # ============================================================
                    # MESSAGE BUFFER: Instead of calling AI immediately, buffer the
                    # message. The buffer collects messages for 30 seconds, then
                    # combines them into a single AI request.
                    # This prevents duplicate AI submissions when customers send
                    # multiple rapid messages.
                    # ============================================================
                    buffer_status = message_buffer.get_buffer_status(session.id)
                    logger.info(
                        f"[Buffer] Session {session.id}: Adding to buffer. "
                        f"Current status: {buffer_status}"
                    )
                    
                    # Add message to buffer (non-blocking, uses asyncio tasks internally)
                    await message_buffer.add_message(
                        session_id=session.id,
                        content=text_body,
                        customer_phone=sender_phone,
                        config=config_data,
                        message_id=message_id,     # WhatsApp ID
                        db_message_id=db_message.id if db_message else None,   # Database ID
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
            elif msg_type == "sticker":
                 background_tasks.add_task(
                    process_sticker_message,
                    session.id,
                    media_id,
                    sender_phone,
                    message_id,
                    config_data
                )
            elif msg_type == "image":
                # Handle image messages (Part 1: Image Analysis)
                # Extract caption if provided
                caption = msg_data.get("image", {}).get("caption", None)
                
                # Process image in background
                background_tasks.add_task(
                    process_image_message,
                    session.id,
                    media_id,
                    sender_phone,
                    message_id,
                    config_data,
                    caption
                )
    except Exception as e:
        logger.error(f"Error in extract_webhook: {e}")
        return {"status": "error", "message": str(e)}

    return {"status": "received"}
