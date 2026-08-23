import hashlib
import hmac
import logging
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response

from app.api.v1.deps import get_session
from app.core.bank import (
    PROTECTED_PREFIX,
    AccountField,
    build_account_audit_line,
    build_account_not_found_reply,
    build_account_reply,
    build_account_unavailable_reply,
    build_critical_incident_reply,
    build_field_unavailable_reply,
    build_identity_exhausted_reply,
    build_identity_malformed_reply,
    build_identity_not_found_reply,
    build_identity_request_reply,
    build_llm_unavailable_reply,
    build_otp_cancelled_reply,
    build_otp_error_reply,
    build_otp_exhausted_reply,
    build_otp_prompt_reply,
    build_otp_rate_limited_reply,
    build_otp_send_failed_reply,
    build_otp_wrong_reply,
    extract_identity_claim,
    extract_otp_code,
    is_critical_request,
    match_account_intent,
    mentions_cancel,
    mentions_unavailable_field,
    process_otp_verification,
    required_crud_fields,
    resolve_customer_phone_by_identity,
    start_verification,
)
from app.core.complaints import (
    CATEGORY_LABELS,
    MAX_SLOT_RETRIES,
    SLOT_CATEGORY,
    SLOT_CONFIRM,
    SLOT_CONTACT,
    SLOT_DESCRIPTION,
    SLOT_IDENTITY,
    SLOT_LOCATION,
    build_complaint_abandoned_reply,
    build_complaint_cancelled_reply,
    build_complaint_category_prompt,
    build_complaint_category_retry,
    build_complaint_contact_prompt,
    build_complaint_description_prompt,
    build_complaint_description_retry,
    build_complaint_escalated_reply,
    build_complaint_failed_reply,
    build_complaint_followup_reply,
    build_complaint_identity_prompt,
    build_complaint_identity_retry,
    build_complaint_location_prompt,
    build_complaint_location_retry,
    build_complaint_saved_reply,
    build_complaint_understood_reply,
    complaint_store,
    is_valid_description,
    match_category,
    match_complaint_intent,
    mentions_complaint_followup,
    mentions_skip,
)
from app.core.config import settings
from app.core.llm import LLMUnavailable, llm_service
from app.core.message_buffer import message_buffer
from app.core.notifications import NotificationService
from app.core.pii import redact_pii
from app.core.stt import stt_service
from app.core.triage.session_types import (
    COMPLAINT_SESSION_TYPE,
    session_type_for_intent,
)
from app.core.triage import (
    Severity,
    lexicon_severity,
    mentions_card_capture,
    triage,
)
from app.core.verification_state import identity_pending_store, verification_store
from app.core.csat_state import csat_store, parse_rating
from app.core.whatsapp import WhatsAppClient
from app.crud import crud
from app.database import BankDbUnavailable
from app.models.enums import ChannelType, MessageDirection, SessionStatus

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
        # FAIL CLOSED. This used to return True with a warning, which meant a
        # default deployment (WHATSAPP_APP_SECRET defaults to None) accepted any
        # forged webhook - anyone could inject messages into any session.
        if settings.WHATSAPP_ALLOW_UNSIGNED:
            logger.warning(
                "WHATSAPP_APP_SECRET not configured and WHATSAPP_ALLOW_UNSIGNED=true "
                "- accepting an UNVERIFIED webhook. Never do this in production."
            )
            return True
        logger.error(
            "Webhook rejected: WHATSAPP_APP_SECRET is not configured. Set it to "
            "verify Meta's signature, or set WHATSAPP_ALLOW_UNSIGNED=true for local dev."
        )
        return False

    if not signature_header or not signature_header.startswith("sha256="):
        logger.warning(
            "Webhook rejected: X-Hub-Signature-256 header missing or malformed. "
            f"Received: {signature_header!r}"
        )
        return False

    expected = (
        "sha256=" + hmac.new(app_secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    )

    match = hmac.compare_digest(expected, signature_header)
    if not match:
        logger.warning(
            "Webhook signature mismatch. "
            f"Expected prefix: {expected[:20]}... | "
            f"Received prefix: {signature_header[:20]}... | "
            "Check that WHATSAPP_APP_SECRET matches your Meta App's App Secret."
        )
    return match


# OTP state lives in app/core/verification_state.py (`verification_store`).
# It deliberately does NOT hold the code: verification is delegated to the OTP
# service's /verify endpoint, so this process never has the secret to leak or
# to compare incorrectly.

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


async def _start_verification(
    db_session_id: UUID,
    customer_phone: str,
    fields: tuple,
) -> str:
    """Send an OTP and record the pending verification. Returns the reply text.

    Delegates to the channel-agnostic app/core/bank/verification_flow.py so the
    voice agent (app/api/v1/voice_agent.py) doesn't reimplement this. Never
    returns or stores the code -- see app/core/otp_client.py.
    """
    outcome = await start_verification(str(db_session_id), customer_phone, fields)
    if outcome == "rate_limited":
        return build_otp_rate_limited_reply()
    if outcome != "sent":
        return build_otp_send_failed_reply()
    return build_otp_prompt_reply()


async def _deliver_account_data(customer_phone: str, field_values: tuple) -> tuple:
    """Fetch and render the verified customer's account data.

    Returns ``(customer_text, persisted_text)`` -- deliberately two different
    strings. The transcript copy carries no balance and no full identifiers,
    because the webhook rebuilds LLM history from stored messages.
    """
    fields = tuple(AccountField(v) for v in field_values)
    try:
        account = await crud.get_bank_account_fields(customer_phone, required_crud_fields(fields))
    except BankDbUnavailable as e:
        logger.error(f"Bank lookup unavailable: {e}")
        text = build_account_unavailable_reply()
        return text, text
    except Exception as e:
        logger.error(f"Bank lookup failed: {e}")
        text = build_account_unavailable_reply()
        return text, text

    if not account:
        text = build_account_not_found_reply()
        return text, text

    return (
        build_account_reply(fields, account),
        build_account_audit_line(fields, account),
    )


from app.core.storage import storage_service


async def process_voice_message(
    db_session_id: UUID, media_id: str, sender_phone: str, message_id: str, config: dict
):
    """
    Background task to download audio, transcribe, and then handle like a text message.
    The voice message is ALWAYS persisted to the DB so agents can see and play it,
    regardless of whether transcription succeeds.
    """
    try:
        # 1. Initialize WhatsApp Client
        client = WhatsAppClient(
            phone_number_id=config.get("phone_number_id"), access_token=config.get("access_token")
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
                media_type="audio/ogg",
            )

            # 6. Let the AI respond (if no agent is assigned and session is not escalated)
            session = await crud.get_session_by_id(None, db_session_id)
            if (
                session
                and session.employee_id is None
                and session.status != SessionStatus.escalated
            ):
                await process_ai_response(db_session_id, transcription, sender_phone, config)
            else:
                logger.info(
                    f"Skipping AI response for voice message in session {db_session_id}. "
                    f"Status: {session.status if session else 'Unknown'}"
                )
                # process_ai_response is where classification normally happens,
                # so an escalated or agent-assigned voice session used to reach
                # the dashboard with no Type at all. The transcript is right
                # here; use it.
                if session and session.main_type_id is None:
                    await auto_classify_session(db_session_id, transcription)
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
                media_type="audio/ogg",
            )

            # Notify agents so they can listen manually
            await crud.create_notification(
                None,
                user_id=None,  # broadcast
                title="رسالة صوتية بحاجة لمراجعة",
                message=f"لم يتمكن النظام من تفريغ رسالة صوتية من {sender_phone}. يرجى الاستماع إليها.",
                type="warning",
                action_url=f"/sessions/{db_session_id}",
            )

            # Check if an agent is assigned; if not, ask the customer to repeat as text
            session = await crud.get_session_by_id(None, db_session_id)
            agent_available = session and session.employee_id is not None
            if not agent_available:
                await client.send_text_message(
                    sender_phone,
                    "نعتذر، لم نتمكن من فهم رسالتك الصوتية بوضوح.\n"
                    "هل يمكنك إعادة إرسال طلبك كرسالة نصية؟ سيسعدنا مساعدتك. 🙏",
                )

    except Exception as e:
        logger.error(f"Error in background voice processing: {e}", exc_info=True)


# Sent when a customer answers the closing question with a 1-5 rating.
RATING_THANKS_TEXT = "شكراً لتقييمك! رأيك يساعدنا على تحسين خدمتنا. ⭐"


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
            logger.warning(
                f"send_session_closing_message: session {session_id} not found or has no customer"
            )
            return

        # 2. Get customer phone
        cust_resp = (
            _supabase.table("customers")
            .select("phone")
            .eq("id", str(session.customer_id))
            .execute()
        )
        if not cust_resp.data:
            logger.warning(
                f"send_session_closing_message: customer not found for session {session_id}"
            )
            return
        customer_phone = cust_resp.data[0].get("phone")
        if not customer_phone:
            return

        # 3. Get WhatsApp API config
        api_config = await crud.get_api_config(None, ChannelType.whatsapp)
        if not api_config or not api_config.is_active or not api_config.access_token_encrypted:
            logger.warning(
                f"send_session_closing_message: no active WhatsApp config for session {session_id}"
            )
            # Still classify even if we can't send the message
            await auto_classify_session(session_id)
            return

        # 4. Build & send closing message
        #
        # This used to ask a yes/no question that nothing parsed, on a
        # session that was already closed -- so the answer became the
        # opening line of an unrelated new conversation and
        # sessions.satisfaction_score stayed NULL for every session ever
        # recorded. Asking for a number gives that column something it can
        # store, and csat_state remembers which session it belongs to.
        closing_text = (
            "شكراً لتواصلك مع البنك الإسلامي الفلسطيني 🌟\n\n"
            "كيف تقيّم خدمتنا؟ أرسل رقماً من 1 (سيئ) إلى 5 (ممتاز).\n"
            "نسعد دائماً بخدمتك، وفي حال احتجت أي مساعدة إضافية لا تتردد في التواصل معنا مجدداً. 🤝"
        )

        client = WhatsAppClient(
            phone_number_id=api_config.phone_number_id,
            access_token=api_config.access_token_encrypted,
        )
        await client.send_text_message(customer_phone, closing_text)

        # Only after the question actually went out: a window opened for a
        # question the customer never saw would swallow their next message.
        csat_store.start(customer_phone, session_id)

        # 5. Save the closing message to DB so agents / dashboard can see it
        await crud.create_message(
            None,
            session_id=session_id,
            content=closing_text,
            direction=MessageDirection.outbound,
        )

        logger.info(f"Sent closing message for session {session_id} to {customer_phone}")

    except Exception as e:
        logger.error(
            f"Error in send_session_closing_message for session {session_id}: {e}", exc_info=True
        )
    finally:
        # Always run classification regardless of whether the message was sent
        try:
            await auto_classify_session(session_id)
        except Exception as e:
            logger.error(f"auto_classify_session failed after closing message: {e}")


async def process_sticker_message(
    db_session_id: UUID, media_id: str, sender_phone: str, message_id: str, config: dict
):
    """
    Background task to download sticker, upload to storage, and save message
    """
    try:
        client = WhatsAppClient(
            phone_number_id=config.get("phone_number_id"), access_token=config.get("access_token")
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
            media_type="image/webp",
        )
    except Exception as e:
        logger.error(f"Error in background sticker processing: {e}")


async def process_image_message(
    db_session_id: UUID,
    media_id: str,
    sender_phone: str,
    message_id: str,
    config: dict,
    caption: Optional[str] = None,
):
    """
    Background task to download image, upload to storage, analyze with vision AI, and respond.
    Follows the same pattern as process_voice_message.
    """
    try:
        # 1. Initialize WhatsApp Client
        client = WhatsAppClient(
            phone_number_id=config.get("phone_number_id"), access_token=config.get("access_token")
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
            media_type=media_type,
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
                current_type_id=str(session.main_type_id) if session.main_type_id else None,
            )

            # 8. Send AI response via WhatsApp
            if ai_response:
                await client.send_text_message(sender_phone, ai_response)

                # 9. Save outbound message to DB
                await crud.create_message(
                    None,
                    session_id=db_session_id,
                    content=ai_response,
                    direction=MessageDirection.outbound,
                )
        else:
            logger.info(
                f"Skipping AI response for image message in session {db_session_id}. Status: {session.status if session else 'Unknown'}"
            )
            # Same gap as the voice path: vision_service classifies as a side
            # effect of answering, so a session nobody answers stays untyped.
            if session and session.main_type_id is None:
                await auto_classify_session(db_session_id, caption or content)

    except Exception as e:
        logger.error(f"Error in background image processing: {e}")


async def auto_classify_session(
    db_session_id: UUID,
    user_message: Optional[str] = None,
    triage_summary: Optional[str] = None,
    fallback_intent: Optional[str] = None,
):
    """Background task to classify session type based on history.

    ``triage_summary`` is the one-line, PII-masked reading of what the customer
    wanted (app/core/triage). When present it is handed to the classifier
    alongside the raw text: "الصراف بلع بطاقتي" plus "شكوى بخصوص احتجاز بطاقة في
    صراف آلي" is a far easier thing to map onto a session type than the bare
    message, especially in dialect.

    ``fallback_intent`` is the triage IntentLabel for the same message. If the
    model returns nothing usable the intent decides the type instead of leaving
    the session unclassified -- see app/core/triage/session_types.py for why an
    LLM-only classifier left the dashboard's Type column mostly empty.
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
        logger.info(
            f"Triggering auto-classification for session {db_session_id} with message: {user_message[:50]}..."
        )
        classify_input = user_message
        if triage_summary:
            classify_input = f"{user_message}\n\n[ملخّص النظام: {triage_summary}]"
        classified_type_id = await llm_service.classify_session(classify_input, types, history)

        if classified_type_id:
            logger.info(f"Auto-classified session {db_session_id} as {classified_type_id}")
            await crud.update_session_main_type(None, db_session_id, UUID(classified_type_id))
            return

        # The model gave us nothing usable. Rather than leave the session
        # unclassified forever, fall back to what triage already worked out
        # deterministically from the same message.
        fallback_name = session_type_for_intent(fallback_intent)
        if fallback_name:
            match = next((t for t in types if t.get("name") == fallback_name), None)
            if match:
                logger.info(
                    f"Auto-classification fell back to {fallback_name!r} for "
                    f"session {db_session_id} (intent {fallback_intent})"
                )
                await crud.update_session_main_type(None, db_session_id, UUID(match["id"]))
                return
            logger.warning(
                f"Fallback session type {fallback_name!r} is not seeded; "
                f"leaving session {db_session_id} unclassified"
            )
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
    db_message_id: Optional[UUID] = None,
):
    """
    Process AI response for a (possibly combined) user message.
    Called by the message buffer after collecting all messages.
    """
    try:
        # 0. Safety Check: Verify session is still eligible for AI response
        session = await crud.get_session_by_id(None, db_session_id)
        if (
            not session
            or session.status == SessionStatus.escalated
            or session.employee_id is not None
        ):
            logger.info(
                f"Aborting AI response for session {db_session_id}. Reason: {'Escalated' if session and session.status == SessionStatus.escalated else 'Agent Assigned' if session else 'Session Not Found'}"
            )
            return

        # Initialize WhatsApp Client
        client = WhatsAppClient(
            phone_number_id=config.get("phone_number_id"), access_token=config.get("access_token")
        )

        # Mark as read & Send typing indicator
        if message_id:
            await client.mark_message_as_read(message_id)
        await client.send_typing_indicator(customer_phone)

        # ------------------------------------------------------------------
        # Bank verification + account questions.
        #
        # This whole block runs BEFORE the LLM call, deliberately: an account
        # question must never be sent to the model at all, and the old ordering
        # burned an LLM call whose answer was then thrown away.
        # ------------------------------------------------------------------
        sid = str(db_session_id)

        # Set only by the triage branch further down. Initialised here because
        # the otp_pending branch can ALSO fall through to the assistant (a
        # message with no code in it keeps the verification alive), and that
        # path never runs triage -- reading an unset local there would be a
        # NameError on a live customer message.
        triage_summary: Optional[str] = None
        # Same reasoning, same branch: the classifier fallback below reads this
        # on paths that never reached triage.
        triage_intent: Optional[str] = None

        otp_pending = verification_store.get(sid)
        # A session is never in both states at once: identity resolves into an
        # OTP send (see the identity branch below), which is what creates
        # otp_pending in the first place.
        identity_pending = identity_pending_store.get(sid) if not otp_pending else None
        # Complaint collection is likewise exclusive with both: it can only be
        # started from the terminal `else` branch, which no pending verification
        # ever reaches.
        complaint_pending = (
            complaint_store.get(sid) if not (otp_pending or identity_pending) else None
        )

        async def _reply_and_store(customer_text: str, persisted_text: str = None) -> None:
            await client.send_text_message(customer_phone, customer_text)
            await crud.create_message(
                None,
                session_id=db_session_id,
                content=persisted_text if persisted_text is not None else customer_text,
                direction=MessageDirection.outbound,
            )

        async def _escalate(
            customer_text: str, notification_message: str, *, urgent: bool = False
        ) -> None:
            """Hand the session to a human, then reply.

            Same shape as the critical-request branch below, factored out so the
            complaint paths that need to give up (unparseable answers, a
            follow-up on an existing complaint) escalate identically instead of
            re-implementing it.
            """
            await client.send_text_message(customer_phone, customer_text)
            await crud.update_session_status(None, db_session_id, SessionStatus.escalated)
            message_buffer.clear_session_buffer(db_session_id)
            try:
                await crud.create_notification(
                    None,
                    user_id=None,
                    # `urgent` is fraud/theft in progress. The title is what a
                    # staff member sees in the toast, and a queue where every
                    # row says "New Escalation Request" cannot be triaged.
                    title=(
                        "🚨 Critical Incident" if urgent else "⚠️ New Escalation Request"
                    ),
                    message=notification_message,
                    type="escalation",
                    action_url=f"/sessions/{db_session_id}",
                )
            except Exception as e:
                logger.error(f"Failed to create escalation notification: {e}")
            await crud.create_message(
                None,
                session_id=db_session_id,
                content=customer_text,
                direction=MessageDirection.outbound,
            )

        _history_cache: list = []

        async def _recent_history() -> list:
            """Last few turns, LLM-safe, fetched at most once per message.

            Triage needs context ("أيوه صار معي نفس الإشي" means nothing alone)
            and so does the assistant further down, so the read is memoised
            rather than done twice.

            Applies the same PROTECTED_PREFIX scrub as the assistant path: a
            stored account reply must never be replayed to any model, triage
            included.
            """
            if _history_cache:
                return _history_cache
            rows = await crud.get_messages_for_session(None, db_session_id)
            for m in rows[-5:]:
                role = "user" if m.direction == MessageDirection.inbound else "assistant"
                content = m.content or ""
                if content.startswith(PROTECTED_PREFIX):
                    content = "[تم تزويد العميل ببيانات حسابه بعد تحقق ناجح.]"
                _history_cache.append({"role": role, "content": content})
            return _history_cache

        def _prompt_for_current_slot(pending) -> str:
            """The question for whichever slot the form is on now.

            Each branch below used to name its own successor
            ("after description, ask identity"), which encoded SLOT_ORDER in
            five places. Now that advance() can SKIP slots triage already
            filled, a hardcoded successor would ask a question we have the
            answer to -- so every branch asks this instead.
            """
            if pending.slot == SLOT_CATEGORY:
                return build_complaint_category_prompt()
            if pending.slot == SLOT_DESCRIPTION:
                return build_complaint_description_prompt()
            if pending.slot == SLOT_LOCATION:
                return build_complaint_location_prompt(pending.category or "other")
            if pending.slot == SLOT_IDENTITY:
                return build_complaint_identity_prompt()
            if pending.slot == SLOT_CONTACT:
                return build_complaint_contact_prompt()
            # SLOT_CONFIRM is no longer a question. It marks "every slot is
            # answered", and _advance_or_submit files the complaint instead of
            # asking the customer to read the record back to us. Reaching here
            # means a caller advanced the form without going through that helper.
            raise AssertionError(
                f"No prompt for slot {pending.slot!r}; use _advance_or_submit"
            )

        async def _submit_complaint(pending) -> None:
            """File the complaint and tell the customer its reference number.

            This used to be the SLOT_CONFIRM branch, reached only after the
            customer read back a summary of their own complaint and replied
            "نعم". The summary was a round trip that lost complaints: people
            answered it with a new sentence, or not at all, and the form then
            expired with everything already collected. The last answered slot
            now files the record directly.

            Nothing is written unseen even so -- every field here is either
            something the customer typed a moment ago or something triage read
            out of their own message, and build_complaint_saved_reply tells
            them it was filed.
            """
            # Clear the state BEFORE the write, so a failure cannot strand the
            # customer in a form that has no unanswered question left.
            category = pending.category or "other"
            description = pending.description or ""
            preferred_contact = pending.preferred_contact
            full_name = pending.full_name
            national_id = pending.national_id
            severity = pending.severity or "medium"
            location = pending.location
            atm_identifier = pending.atm_identifier
            incident_at_text = pending.incident_at_text
            ai_summary = pending.ai_summary
            intent = pending.intent
            complaint_store.clear(sid)

            customer = await crud.get_customer_by_phone(None, customer_phone)
            try:
                complaint = await crud.create_complaint(
                    None,
                    channel=ChannelType.whatsapp,
                    category=category,
                    description=description,
                    session_id=db_session_id,
                    customer_id=customer.id if customer else None,
                    # The name the customer just typed wins over whatever
                    # is on the session's customer record -- it is what
                    # they confirmed the complaint would be filed under.
                    customer_name=full_name or (customer.name if customer else None) or None,
                    customer_phone=customer_phone,
                    national_id=national_id,
                    preferred_contact=preferred_contact,
                    severity=severity,
                    location=location,
                    atm_identifier=atm_identifier,
                    incident_at_text=incident_at_text,
                    ai_summary=ai_summary,
                    intent=intent,
                    # HIGH is also handed to a human below, so the record
                    # and the escalated conversation point at each other.
                    escalated_session_id=(
                        db_session_id if severity in ("critical", "high") else None
                    ),
                    context={"category_label": CATEGORY_LABELS.get(category, category)},
                )
            except Exception as e:
                logger.error(f"Failed to save complaint for session {sid}: {e}")
                await _escalate(
                    build_complaint_failed_reply(),
                    f"Complaint intake failed to save for {customer_phone}.",
                )
                return

            await _reply_and_store(build_complaint_saved_reply(complaint.reference_number))

            # A filed complaint IS the session type -- no classifier needed, and
            # no waiting for one that may never return a match. Only when the
            # session is still unclassified, so a human's manual choice wins.
            try:
                session_now = await crud.get_session_by_id(None, db_session_id)
                if session_now and session_now.main_type_id is None:
                    types = await crud.get_session_main_types(None)
                    match = next(
                        (t for t in types if t.get("name") == COMPLAINT_SESSION_TYPE), None
                    )
                    if match:
                        await crud.update_session_main_type(
                            None, db_session_id, UUID(match["id"])
                        )
            except Exception as e:
                # Dashboard metadata: never let it cost the customer their reply.
                logger.warning(f"Could not set complaint session type: {e}")

            try:
                await crud.create_notification(
                    None,
                    user_id=None,
                    title=(
                        "🔴 Urgent Complaint Filed"
                        if severity in ("critical", "high")
                        else "📝 New Complaint Filed"
                    ),
                    message=(
                        f"[{severity.upper()}] Complaint {complaint.reference_number} "
                        f"from {customer_phone}: {ai_summary or description[:80]}"
                    ),
                    type="escalation",
                    action_url=f"/complaints/{complaint.id}",
                )
            except Exception as e:
                logger.error(f"Failed to create complaint notification: {e}")

            if severity == "high":
                # A reference number does not get their card back out of the
                # machine. The record is filed AND a human takes over --
                # after the save, so the customer has their number either
                # way. MEDIUM stops at the reference number: a tracked
                # complaint is the right answer to ordinary dissatisfaction,
                # and escalating all of them would drown the queue.
                await _escalate(
                    build_complaint_escalated_reply(),
                    f"[HIGH] Complaint {complaint.reference_number} from "
                    f"{customer_phone} needs follow-up: {ai_summary or description[:80]}",
                    urgent=True,
                )
            return

        async def _advance_or_submit(pending) -> None:
            """Move to the next open slot, or file the complaint if there is none.

            The single place that decides "the form is done". SLOT_CONFIRM
            survives in SLOT_ORDER as that terminal marker -- advance() falls
            through to it when every other slot is filled -- it just no longer
            has a question attached.
            """
            complaint_store.advance(sid)
            if pending.slot == SLOT_CONFIRM:
                await _submit_complaint(pending)
                return
            await _reply_and_store(_prompt_for_current_slot(pending))


        def _complaint_opening_reply(pending, result, result_text: str = "") -> str:
            """First message of an intake, matched to how much we already know.

            When triage read the category out of the customer's own words, the
            numbered menu reads as though nobody listened -- so acknowledge what
            we understood and ask only the next open question.
            """
            if pending.slot == SLOT_CATEGORY:
                # We understood nothing concrete; the menu is still the honest
                # way to start.
                return build_complaint_category_prompt()

            opening = build_complaint_understood_reply(
                pending.category or "other",
                location=pending.location,
                severity=pending.severity,
                # Reassure instead of alarm: a card the ATM kept is inside a
                # machine the bank owns. Detected deterministically so the
                # wording does not depend on the classifier being up.
                card_capture=mentions_card_capture(result_text),
            )
            follow_up = {
                SLOT_DESCRIPTION: build_complaint_description_prompt(),
                SLOT_LOCATION: build_complaint_location_prompt(pending.category or "other"),
                SLOT_IDENTITY: build_complaint_identity_prompt(),
                SLOT_CONTACT: build_complaint_contact_prompt(),
            }.get(pending.slot)
            return f"{opening}\n\n{follow_up}" if follow_up else opening

        if otp_pending:
            # Cancel is checked first and anywhere in the message: it used to be
            # nested under "did they send digits", so a bare "إلغاء" fell through
            # to the LLM and left the verification state alive.
            if mentions_cancel(user_message):
                verification_store.clear(sid)
                await _reply_and_store(build_otp_cancelled_reply())
                return

            code = extract_otp_code(user_message, settings.OTP_CODE_LENGTH)
            if code:
                outcome, remaining = await process_otp_verification(sid, otp_pending.phone, code)

                if outcome == "valid":
                    # otp_pending.phone, NOT customer_phone: the OTP went to the
                    # phone Bank_db_oss resolved from the customer's stated
                    # identity (see the identity_pending branch below), which
                    # may differ from the WhatsApp number they're chatting from.
                    customer_text, persisted_text = await _deliver_account_data(
                        otp_pending.phone, otp_pending.fields
                    )
                    await _reply_and_store(customer_text, persisted_text)
                    return

                if outcome == "error":
                    # Our outage, not their mistake - do NOT consume an attempt.
                    await _reply_and_store(build_otp_error_reply())
                    return

                if outcome == "exhausted":
                    await _reply_and_store(build_otp_exhausted_reply())
                else:
                    await _reply_and_store(build_otp_wrong_reply(remaining))
                return
            # No code in the message: fall through to the assistant, keeping the
            # pending verification alive so they can still send it.

        elif identity_pending:
            # Identity-first verification: the customer asked an account
            # question and must state (full name, national ID) BEFORE any OTP
            # is sent -- see app/core/bank/verification_flow.py and
            # scripts/sql/bank_db_oss_identity_lookup.sql. The OTP then goes to
            # whatever phone Bank_db_oss has on file for that identity, not
            # necessarily customer_phone.
            if mentions_cancel(user_message):
                identity_pending_store.clear(sid)
                await _reply_and_store(build_otp_cancelled_reply())
                return

            claim = extract_identity_claim(user_message)
            if claim is None:
                # Unlike a missing OTP code, this does NOT fall through to the
                # assistant: a customer who mistyped the format needs to see
                # the expected shape again, not a generic AI reply. Does not
                # consume an attempt -- only a resolved-but-unmatched identity
                # does, below.
                await _reply_and_store(build_identity_malformed_reply())
                return

            full_name, national_id = claim
            try:
                phone_on_file = await resolve_customer_phone_by_identity(full_name, national_id)
            except BankDbUnavailable as e:
                logger.error(f"Bank identity lookup unavailable: {e}")
                identity_pending_store.clear(sid)
                await _reply_and_store(build_account_unavailable_reply())
                return
            except Exception as e:
                logger.error(f"Bank identity lookup failed: {e}")
                identity_pending_store.clear(sid)
                await _reply_and_store(build_account_unavailable_reply())
                return

            if phone_on_file is None:
                # Deliberately generic reply either way (see
                # build_identity_not_found_reply) -- do not let this branch
                # become an oracle for which half of the claim was wrong.
                attempts = identity_pending_store.record_failure(sid)
                remaining = settings.IDENTITY_MAX_ATTEMPTS - attempts
                if remaining <= 0:
                    identity_pending_store.clear(sid)
                    await _reply_and_store(build_identity_exhausted_reply())
                else:
                    await _reply_and_store(build_identity_not_found_reply(remaining))
                return

            fields = tuple(AccountField(v) for v in identity_pending.fields)
            identity_pending_store.clear(sid)
            reply = await _start_verification(db_session_id, phone_on_file, fields)
            await _reply_and_store(reply)
            return

        elif complaint_pending:
            # Complaint slot filling. One slot per turn, deterministic -- the
            # model never decides what was answered, and never writes the
            # record. See app/core/complaints/flow.py for the slot order.
            #
            # Cancel is checked first and anywhere in the message, for the same
            # reason it is in the OTP branch: a bare "إلغاء" must not fall
            # through to the LLM leaving the form alive behind it.
            if mentions_cancel(user_message):
                complaint_store.clear(sid)
                await _reply_and_store(build_complaint_cancelled_reply())
                return

            slot = complaint_pending.slot

            if slot == SLOT_CATEGORY:
                category = match_category(user_message)
                if category is None:
                    if complaint_store.record_retry(sid) >= MAX_SLOT_RETRIES:
                        complaint_store.clear(sid)
                        await _escalate(
                            build_complaint_abandoned_reply(),
                            f"Customer {customer_phone} could not complete complaint intake.",
                        )
                        return
                    await _reply_and_store(build_complaint_category_retry())
                    return
                complaint_pending.category = category
                await _advance_or_submit(complaint_pending)
                return

            if slot == SLOT_DESCRIPTION:
                if not is_valid_description(user_message):
                    if complaint_store.record_retry(sid) >= MAX_SLOT_RETRIES:
                        complaint_store.clear(sid)
                        await _escalate(
                            build_complaint_abandoned_reply(),
                            f"Customer {customer_phone} could not complete complaint intake.",
                        )
                        return
                    await _reply_and_store(build_complaint_description_retry())
                    return
                # Redacted on the way in, not on the way out: the customer was
                # asked not to send card numbers, and some will anyway.
                complaint_pending.description = redact_pii(user_message.strip())
                await _advance_or_submit(complaint_pending)
                return

            if slot == SLOT_LOCATION:
                # Only reached for the categories where a location is what makes
                # the report actionable, and only when triage did not already
                # read one out of the customer's message (see
                # PendingComplaint.is_filled). Free text: a branch name, a
                # landmark, or "the ATM by the hospital" are all usable answers.
                answer = (user_message or "").strip()
                if mentions_skip(answer):
                    # Not knowing where it happened must not trap them in the
                    # form -- staff can still work the complaint without it.
                    await _advance_or_submit(complaint_pending)
                    return
                if len(answer) < 2:
                    if complaint_store.record_retry(sid) >= MAX_SLOT_RETRIES:
                        complaint_store.clear(sid)
                        await _escalate(
                            build_complaint_abandoned_reply(),
                            f"Customer {customer_phone} could not complete complaint intake.",
                        )
                        return
                    await _reply_and_store(build_complaint_location_retry())
                    return
                complaint_pending.location = redact_pii(answer)[:200]
                await _advance_or_submit(complaint_pending)
                return

            if slot == SLOT_IDENTITY:
                # Same (name, national ID) free-text parser the account
                # verification flow uses -- see extract_identity_claim's
                # docstring for why a malformed reply re-prompts instead of
                # counting as a failed attempt.
                claim = extract_identity_claim(user_message)
                if claim is None:
                    if complaint_store.record_retry(sid) >= MAX_SLOT_RETRIES:
                        complaint_store.clear(sid)
                        await _escalate(
                            build_complaint_abandoned_reply(),
                            f"Customer {customer_phone} could not complete complaint intake.",
                        )
                        return
                    await _reply_and_store(build_complaint_identity_retry())
                    return
                complaint_pending.full_name, complaint_pending.national_id = claim
                await _advance_or_submit(complaint_pending)
                return

            if slot == SLOT_CONTACT:
                # Free text is fine here -- anything the customer says is a
                # usable answer to "how should we reach you", so there is
                # nothing to fail to parse and no retry path.
                contact = user_message.strip()
                complaint_pending.preferred_contact = {
                    "1": "واتساب",
                    "2": "اتصال هاتفي",
                    "3": "بريد إلكتروني",
                }.get(contact, contact)
                await _advance_or_submit(complaint_pending)
                return

        else:
            # Deterministic, allowlist-only. `ai_mentions_otp` used to be an
            # additional trigger here; it is GONE ON PURPOSE. The system prompt
            # tells the model to mention the OTP step for any transfer question
            # (system_prompt.py, sections 20.3 / security rules), so model output
            # could make us send a real code. Model output must never initiate a
            # verification. Do not reintroduce it.
            if is_critical_request(user_message):
                # Transfers / password resets / account closure / card block:
                # escalate to a human. Never send an OTP for these - the
                # assistant cannot perform the action, so the code would gate
                # nothing and would only teach customers to type codes into chat.
                #
                # Checked BEFORE match_account_intent: the account lexicon now
                # covers cards and statements, so "ايقاف بطاقتي" and
                # "كشف حساب رسمي" overlap both. Escalation has to win.
                clean_text = (
                    "فهمت أنك ترغب في تنفيذ عملية حساسة على حسابك. "
                    "سأحوّل طلبك إلى أحد موظفي خدمة العملاء لمتابعته معك مباشرة."
                )
                await client.send_text_message(customer_phone, clean_text)
                await crud.update_session_status(None, db_session_id, SessionStatus.escalated)
                message_buffer.clear_session_buffer(db_session_id)
                try:
                    await crud.create_notification(
                        None,
                        user_id=None,
                        title="⚠️ New Escalation Request",
                        message=f"Customer {customer_phone} requested a sensitive action.",
                        type="escalation",
                        action_url=f"/sessions/{db_session_id}",
                    )
                except Exception as e:
                    logger.error(f"Failed to create escalation notification: {e}")
                await crud.create_message(
                    None,
                    session_id=db_session_id,
                    content=clean_text,
                    direction=MessageDirection.outbound,
                )
                return

            # An INCIDENT is not a data request. "الصراف بلع بطاقتي في فرع رام
            # الله" trips match_account_intent -- "بطاقتي" is a personal marker
            # and a CARDS field keyword -- so the customer reporting a captured
            # card was asked for their national ID to look up card details they
            # never asked for, and the complaint was never opened.
            #
            # lexicon_severity, NOT the triage model: this gate sits on the path
            # to identity verification, and model output must never influence
            # that (see the comment above is_critical_request). A keyword list
            # cannot be talked into anything. Skipping the branch only ever
            # withholds account data, so this cannot loosen the OTP guarantee.
            incident_report = lexicon_severity(user_message) >= Severity.HIGH

            account_fields = match_account_intent(user_message)
            if account_fields and settings.BANK_LOOKUP_ENABLED and not incident_report:
                # Ask for identity FIRST. _start_verification (which actually
                # sends the OTP) only runs once identity_pending resolves to a
                # phone-on-file, above -- never straight off customer_phone.
                identity_pending_store.start(sid, fields=tuple(f.value for f in account_fields))
                await _reply_and_store(build_identity_request_reply())
                return

            if mentions_unavailable_field(user_message):
                # e.g. "ما هو رقم الآيبان الخاص بحسابي؟". Bank_db_oss has no
                # IBAN column, so answer plainly instead of sending an OTP that
                # would gate nothing -- and instead of letting the question
                # reach the LLM, which has no account data and would guess.
                await _reply_and_store(build_field_unavailable_reply())
                return

            if mentions_complaint_followup(user_message):
                # Chasing a complaint they already filed. Escalate rather than
                # opening a second record for the same problem -- this backend
                # has no lookup-by-reference flow, and a human does.
                await _escalate(
                    build_complaint_followup_reply(),
                    f"Customer {customer_phone} is following up on an existing complaint.",
                )
                return

            # ----------------------------------------------------------------
            # Understanding, then routing by how bad it is.
            #
            # Everything above this point is deterministic and stays that way:
            # OTP, identity, account fields and is_critical_request are security
            # boundaries, and a model must never be able to talk its way past
            # them. Triage sits BELOW those and only decides what happens to a
            # message they all declined -- which used to mean "hand it to the
            # free-text LLM and hope".
            #
            # It also replaces match_complaint_intent as the complaint trigger.
            # That matcher required the literal word "شكوى", so
            # "الصراف بلع بطاقتي في فرع رام الله" opened nothing at all.
            # ----------------------------------------------------------------
            keyword_complaint = match_complaint_intent(user_message)
            triage_result = await triage(user_message, history=await _recent_history())

            if keyword_complaint:
                # An explicit "بدي أقدم شكوى" is a filing even if the model read
                # it as a neutral question. The keyword can only ADD certainty
                # here, never remove it.
                triage_result.is_complaint = True

            severity = triage_result.severity
            triage_summary = triage_result.summary or None
            # Kept in scope for auto_classify_session below: when the model
            # cannot pick a session type, this is what it falls back to.
            triage_intent = triage_result.intent.value

            # messages.classification is an existing column that nothing has ever
            # written to. Filling it makes the transcript filterable by what the
            # customer actually wanted, not just by session type.
            if db_message_id is not None:
                try:
                    await crud.update_message_classification(
                        None, db_message_id, triage_result.intent.value
                    )
                except Exception as e:
                    # Cosmetic metadata: never let it cost the customer a reply.
                    logger.warning(f"Could not store message classification: {e}")

            if severity is Severity.CRITICAL:
                # Fraud, theft, a compromised account. Straight to a human with
                # no intake form: making someone whose money is moving right now
                # answer a five-slot questionnaire is the wrong response.
                logger.warning(
                    f"Critical incident reported on session {db_session_id}",
                    extra={"data": dict(
                        triage_result.log_data(), session_id=str(db_session_id)
                    )},
                )
                await _escalate(
                    build_critical_incident_reply(),
                    f"🚨 URGENT — {customer_phone}: {triage_result.summary}",
                    urgent=True,
                )
                return

            if triage_result.is_complaint and severity >= Severity.MEDIUM:
                # HIGH and MEDIUM both open a record. They diverge only after it
                # is saved: HIGH also hands the conversation to a human, because
                # a reference number alone does not get the customer's card back
                # out of the machine. That branch lives in _submit_complaint.
                pending = complaint_store.start_prefilled(
                    sid,
                    category=triage_result.complaint_category,
                    description=triage_result.description,
                    full_name=triage_result.full_name,
                    location=triage_result.location,
                    atm_identifier=triage_result.atm_identifier,
                    incident_at_text=triage_result.incident_at_text,
                    severity=severity.value,
                    intent=triage_result.intent.value,
                    ai_summary=triage_result.summary,
                )
                logger.info(
                    f"Complaint intake opened for session {db_session_id} "
                    f"at slot {pending.slot}",
                    extra={"data": dict(
                        triage_result.log_data(),
                        session_id=str(db_session_id),
                        starting_slot=pending.slot,
                    )},
                )
                if pending.slot == SLOT_CONFIRM:
                    # Triage filled every slot on its own, so there is nothing
                    # left to ask. Rare -- is_filled() demands a national ID and
                    # triage never reads one -- but a prompt for SLOT_CONFIRM no
                    # longer exists, so this must not fall through to one.
                    await _submit_complaint(pending)
                    return
                await _reply_and_store(
                    _complaint_opening_reply(pending, triage_result, user_message)
                )
                return

            # LOW severity, or nothing the customer wants filed: this is an
            # ordinary question. Fall through to the assistant below.
        # --- End Verification Logic ---

        # 1. Get History (last 5 messages for context).
        #
        # _recent_history() memoises, so when triage already ran for this message
        # the rows are reused instead of read a second time. It applies the same
        # PROTECTED_PREFIX scrub this block used to do inline: account replies
        # are stored behind a sentinel so the customer's balance and account
        # number are never fed back to the model on their next turn.
        history = await _recent_history()

        # 1.5 Get Session Types for awareness
        session_types = await crud.get_session_main_types(None)

        # 2. Call LLM with the combined message
        logger.info(
            f"[AI] Sending combined message to LLM for session {db_session_id}: '{user_message[:100]}...'"
        )
        try:
            ai_text = await llm_service.get_ai_response(
                user_message, history, session_types, current_type_id=session.main_type_id
            )
        except LLMUnavailable as e:
            # Every provider failed. This used to arrive here as the STRING
            # "نعتذر، لم أتمكن من معالجة طلبك حالياً." and get sent as a normal
            # reply: session left active, nobody notified, customer at a dead
            # end. Hand the conversation to a human instead -- _escalate sends
            # the message, flips the status, clears the buffer, and notifies.
            logger.error(
                f"LLM unavailable for session {db_session_id}: {e.reason}",
                extra={"data": dict(e.log_data(), session_id=str(db_session_id))},
            )
            await _escalate(
                build_llm_unavailable_reply(),
                f"AI unavailable for {customer_phone} ({e.reason}). Customer is waiting.",
            )
            return

        # --- Personal account limits: escalate instead of redirecting to call center ---
        msg_lower = user_message.lower()
        personal_limits_keywords = [
            "حدودي",
            "حد بطاقتي",
            "حد حسابي",
            "حدود حسابي",
            "حدود بطاقتي",
            "الحدود المطبقة",
            "حدودي الحالية",
            "حد التحويل لحسابي",
            "my card limit",
            "my account limit",
            "my limits",
        ]
        is_personal_limits = any(k in msg_lower for k in personal_limits_keywords)
        if not is_personal_limits:
            has_limit_word = any(w in msg_lower for w in ["حد", "حدود", "limit", "limits"])
            has_personal_marker = any(
                p in msg_lower for p in ["حسابي", "بطاقتي", "حدودي", "حالي", "my "]
            )
            is_personal_limits = has_limit_word and has_personal_marker

        if is_personal_limits and "[ESCALATE]" not in ai_text:
            ai_text = (
                "[ESCALATE]: فهمت أنك تريد معرفة الحدود المطبقة على حسابك أو بطاقتك حالياً. "
                "سأحوّل طلبك إلى أحد موظفي خدمة العملاء لمتابعة استفسارك وتزويدك بالمعلومات الدقيقة الخاصة بحسابك."
            )

        # (Bank/critical intent detection now runs before the LLM call, above.)

        # 2.5 Classify session (Understanding Required)
        if session.main_type_id is None:
            await auto_classify_session(
                db_session_id,
                user_message,
                triage_summary=triage_summary,
                fallback_intent=triage_intent,
            )

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
                await auto_classify_session(
                    db_session_id, user_message, fallback_intent=triage_intent
                )

            # Create Database Notifications
            try:
                await crud.create_notification(
                    None,
                    user_id=None,
                    title="⚠️ New Escalation Request",
                    message=f"Customer {customer_phone} requires human assistance.",
                    type="escalation",
                    action_url=f"/sessions/{db_session_id}",
                )
            except Exception as e:
                logger.error(f"Failed to create broadcast notification: {e}")

            logger.info(
                f"Session {db_session_id} escalated to human agent. Broadcast notification created."
            )

            # Send Notification
            await NotificationService.send_escalation_email(
                str(db_session_id),
                customer_phone,
                clean_text if clean_text else "AI decided to escalate",
            )
        else:
            # Send normal response
            await client.send_text_message(customer_phone, ai_text)

            # 4. Save Outbound Message
            await crud.create_message(
                None, session_id=db_session_id, content=ai_text, direction=MessageDirection.outbound
            )
    except Exception as e:
        # exc_info: this is the broadest catch on the reply path, and without a
        # traceback a failure here was unattributable.
        logger.error(
            f"Error in background AI response: {e}",
            exc_info=True,
            extra={"data": {
                "event": "ai_response_failed",
                "session_id": str(db_session_id),
            }},
        )
        # The customer was left in total silence by this branch: no reply, no
        # escalation, nothing. Anything can have failed by now (a DB write, the
        # Graph API), so this last-ditch handover is itself wrapped -- a failure
        # here must not replace the original error in the log.
        try:
            client = WhatsAppClient(
                phone_number_id=config.get("phone_number_id"),
                access_token=config.get("access_token"),
            )
            await client.send_text_message(customer_phone, build_llm_unavailable_reply())
            await crud.update_session_status(None, db_session_id, SessionStatus.escalated)
            message_buffer.clear_session_buffer(db_session_id)
            await crud.create_notification(
                None,
                user_id=None,
                title="⚠️ New Escalation Request",
                message=f"AI processing failed for {customer_phone}; customer needs a human.",
                type="escalation",
                action_url=f"/sessions/{db_session_id}",
            )
        except Exception as recovery_error:
            logger.error(
                f"Could not notify customer after AI failure: {recovery_error}",
                exc_info=True,
            )


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

    logger.info(
        f"Webhook Verification request: mode={mode}, challenge_present={challenge is not None}"
    )

    if mode == "subscribe" and token:
        # 1. Check if token matches environment variable
        if token == settings.WHATSAPP_VERIFY_TOKEN:
            return Response(content=challenge, media_type="text/plain")

        # 2. Check if token is in the database (api_configurations.api_secret_encrypted or metadata)
        api_config = await crud.get_api_config(db, ChannelType.whatsapp)
        if api_config and api_config.is_active:
            if token == api_config.api_secret_encrypted:
                return Response(content=challenge, media_type="text/plain")

            if (
                api_config.config_metadata
                and api_config.config_metadata.get("verify_token") == token
            ):
                return Response(content=challenge, media_type="text/plain")

        raise HTTPException(status_code=403, detail="Verification failed")

    return Response(content="WhatsApp Webhook Server Active", media_type="text/plain")


@router.post("/webhook")
@router.post("/api/wa/webhook")
async def extract_webhook(
    request: Request, background_tasks: BackgroundTasks, db: Any = Depends(get_session)
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

            # 0. Satisfaction rating for the session that just closed.
            #
            # Deliberately BEFORE customer/session resolution: by the time this
            # reply arrives the rated session is already terminal, so falling
            # through would open a brand-new session and file the rating as its
            # first message -- which is exactly why satisfaction_score was never
            # once written before this existed.
            pending_rating = csat_store.get(sender_phone)
            if pending_rating is not None:
                rating = parse_rating(text_body) if msg_type == "text" else None
                # Whether or not it parsed, the window closes here: a customer
                # who came back with a real question must not have their next
                # message eaten by a rating prompt they already moved past.
                csat_store.clear(sender_phone)
                if rating is not None:
                    try:
                        await crud.update_session_satisfaction(
                            None, pending_rating.session_id, rating
                        )
                        logger.info(
                            f"Recorded satisfaction {rating}/5 for session "
                            f"{pending_rating.session_id}"
                        )
                    except Exception as e:
                        logger.error(f"Failed to store satisfaction rating: {e}")

                    try:
                        api_config = await crud.get_api_config(db, ChannelType.whatsapp)
                        if api_config and api_config.access_token_encrypted:
                            await WhatsAppClient(
                                phone_number_id=api_config.phone_number_id,
                                access_token=api_config.access_token_encrypted,
                            ).send_text_message(sender_phone, RATING_THANKS_TEXT)
                    except Exception as e:
                        logger.warning(f"Could not acknowledge rating: {e}")

                    # No session is created: the rating is about the old
                    # conversation, not the start of a new one.
                    return {"status": "ok", "reason": "satisfaction recorded"}
                # Not a rating -- fall through and treat it as a normal message.

            # 1. Find Customer
            customer = await crud.get_customer_by_phone(db, sender_phone)
            if not customer:
                customer = await crud.create_customer(db, sender_phone, name)

            # 2. Find/Create Session
            session = await crud.get_active_session_by_customer(db, customer.id)

            if not session:
                # Create a fresh session every time if no active/waiting/escalated session exists
                logger.info(
                    f"No active session found. Creating fresh session for customer {customer.id}"
                )
                session = await crud.create_session(db, customer.id)

                # Notify agents of new session
                await crud.create_notification(
                    db,
                    user_id=None,  # Broadcast
                    title="New Session Started",
                    message=f"Customer {sender_phone} started a new conversation.",
                    type="info",
                    action_url=f"/sessions/{session.id}",
                )

            # If session was Escalated, do NOT change to Active automatically. Just notify.
            if session.status == SessionStatus.escalated:
                logger.info(
                    f"Session {session.id} is Escalated. Customer replied. Notifying agents."
                )

                # Notify agents
                await crud.create_notification(
                    db,
                    user_id=None,  # Broadcast
                    title="New Reply in Escalated Session",
                    message=f"Customer {sender_phone} sent a new message.",
                    type="info",
                    action_url=f"/sessions/{session.id}",
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
                    external_id=message_id,
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
                if (
                    db_phone_id
                    and webhook_phone_number_id
                    and db_phone_id != webhook_phone_number_id
                ):
                    logger.warning(
                        f"[Config Mismatch] DB phone_number_id ({db_phone_id}) differs from "
                        f"webhook metadata phone_number_id ({webhook_phone_number_id}). "
                        "Using webhook value. Update the DB config to suppress this warning."
                    )
                config_data = {
                    "phone_number_id": effective_phone_id,
                    "access_token": api_config.access_token_encrypted,
                }
            elif webhook_phone_number_id:
                # DB config missing/inactive but we still have the phone ID from
                # the webhook — populate it so at least mark-as-read can resolve
                # the URL correctly (send_text will still fail without a token).
                config_data = {"phone_number_id": webhook_phone_number_id, "access_token": None}
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
                        message_id=message_id,  # WhatsApp ID
                        db_message_id=db_message.id if db_message else None,  # Database ID
                    )
                else:
                    # If Escalated, rely on the notification we sent (or will send)
                    reason = (
                        "Escalated"
                        if session.status == SessionStatus.escalated
                        else "Agent Assigned"
                    )
                    logger.info(
                        f"Skipping AI response for text message in session {session.id}. Reason: {reason}"
                    )

            elif msg_type == "audio":
                # Always process voice message to ensure transcription is available for agents
                background_tasks.add_task(
                    process_voice_message,
                    session.id,
                    media_id,
                    sender_phone,
                    message_id,
                    config_data,
                )
            elif msg_type == "sticker":
                background_tasks.add_task(
                    process_sticker_message,
                    session.id,
                    media_id,
                    sender_phone,
                    message_id,
                    config_data,
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
                    caption,
                )
    except Exception as e:
        logger.error(f"Error in extract_webhook: {e}")
        return {"status": "error", "message": str(e)}

    return {"status": "received"}
