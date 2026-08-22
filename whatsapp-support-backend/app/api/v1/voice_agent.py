"""Tool + signed-url + post-call-webhook endpoints for the ElevenLabs voice agent.

This channel inherits the invariants documented in docs/BANK_ACCOUNT_ACCESS.md
and enforced by app/core/bank/: bank_db_oss is read-only and reached only
through the get_bank_account_by_phone RPC, and account data is only disclosed
after phone identification + OTP verification. What's relaxed here (by explicit
product decision, voice-only): the /tools/account-info response goes straight
to ElevenLabs' own hosted LLM as a tool result, so it can be spoken aloud --
unlike WhatsApp, where account values never reach any LLM. Nothing is persisted
by the tool endpoints themselves; conversation logging is the post-call
webhook's job (see plan: turn-by-turn logging would need a public, weakly
authenticated browser-facing endpoint, so the ElevenLabs-signed post-call
webhook is used instead).
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import time
from typing import List, Optional

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel

from app.core.bank import (
    ALLOWED_FIELDS,
    AccountField,
    process_otp_verification,
    required_crud_fields,
    start_verification,
)
from app.core.complaints import (
    CATEGORY_LABELS,
    MIN_DESCRIPTION_LENGTH,
    is_valid_description,
)
from app.core.config import settings
from app.core.nlp.normalize import mask_identifier, normalize_msisdn
from app.core.pii import redact_pii
from app.core.voice_agent_state import voice_conversation_store
from app.crud import crud
from app.database import BankDbUnavailable
from app.models.enums import ChannelType, MessageDirection, SessionStatus

logger = logging.getLogger("voice_agent")

router = APIRouter(prefix="/voice-agent")

ELEVENLABS_SIGNED_URL_ENDPOINT = "https://api.elevenlabs.io/v1/convai/conversation/get-signed-url"
# ElevenLabs webhook signature timestamps outside this window are rejected as
# stale, to limit the replay window on a leaked/logged signature.
_WEBHOOK_SIGNATURE_TOLERANCE_SECONDS = 1800


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


async def require_elevenlabs_tool_secret(
    x_elevenlabs_tool_secret: Optional[str] = Header(None),
) -> None:
    """Shared-secret header auth for /tools/*. The secret is configured in the
    ElevenLabs dashboard as a tool-level "secret" header value, never exposed
    to the agent's LLM."""
    configured = settings.ELEVENLABS_TOOL_SHARED_SECRET
    if (
        not configured
        or not x_elevenlabs_tool_secret
        or not hmac.compare_digest(x_elevenlabs_tool_secret, configured)
    ):
        logger.warning("Rejected voice-agent tool call with missing/invalid shared secret")
        raise HTTPException(status_code=401, detail="Unauthorized")


def _verify_elevenlabs_webhook_signature(raw_body: bytes, signature_header: Optional[str]) -> bool:
    """Verify ElevenLabs' HMAC signature on the post-call webhook.

    ElevenLabs signs as ``t=<unix ts>,v0=<hex hmac>`` over ``f"{t}.{raw_body}"``.
    """
    secret = settings.ELEVENLABS_WEBHOOK_SECRET
    if not secret:
        logger.error("Voice-agent webhook rejected: ELEVENLABS_WEBHOOK_SECRET is not configured.")
        return False
    if not signature_header:
        logger.warning("Voice-agent webhook rejected: missing signature header.")
        return False

    try:
        parts = dict(p.split("=", 1) for p in signature_header.split(",") if "=" in p)
        ts = parts["t"]
        v0 = parts["v0"]
        if abs(time.time() - int(ts)) > _WEBHOOK_SIGNATURE_TOLERANCE_SECONDS:
            logger.warning("Voice-agent webhook rejected: signature timestamp outside tolerance.")
            return False
    except (KeyError, ValueError):
        logger.warning("Voice-agent webhook rejected: malformed signature header.")
        return False

    expected = hmac.new(
        secret.encode("utf-8"),
        f"{ts}.{raw_body.decode('utf-8')}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, v0)


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------


class IdentifyRequest(BaseModel):
    conversation_id: str
    phone: str


class ConversationIdRequest(BaseModel):
    conversation_id: str


class VerifyOtpRequest(BaseModel):
    conversation_id: str
    code: str


class AccountInfoRequest(BaseModel):
    conversation_id: str
    fields: List[str]


class FileComplaintRequest(BaseModel):
    conversation_id: str
    category: str
    description: str
    preferred_contact: Optional[str] = None


# ---------------------------------------------------------------------------
# Tools (called by the ElevenLabs agent during a call)
# ---------------------------------------------------------------------------


@router.post("/tools/identify", dependencies=[Depends(require_elevenlabs_tool_secret)])
async def identify(body: IdentifyRequest):
    phone = normalize_msisdn(body.phone)
    if not phone:
        raise HTTPException(status_code=400, detail="Invalid phone number")

    customer = await crud.get_customer_by_phone(None, phone)
    if customer is None:
        customer = await crud.create_customer(None, phone, name="", channel=ChannelType.voice)

    session = await crud.create_session(
        None,
        customer.id,
        channel=ChannelType.voice,
        external_conversation_id=body.conversation_id,
    )

    voice_conversation_store.start(
        body.conversation_id,
        db_session_id=session.id,
        customer_id=customer.id,
        phone=phone,
    )
    logger.info(
        f"[voice-agent] identified {mask_identifier(phone)} for conversation {body.conversation_id}"
    )
    return {"status": "ok"}


@router.post("/tools/send-otp", dependencies=[Depends(require_elevenlabs_tool_secret)])
async def send_otp(body: ConversationIdRequest):
    convo = voice_conversation_store.get(body.conversation_id)
    if convo is None:
        raise HTTPException(status_code=404, detail="Unknown conversation - call identify first")

    # Verify the caller-stated phone actually belongs to a Bank_db_oss customer
    # BEFORE sending a real OTP. Without this check, /tools/identify accepts
    # any phone number at face value (there is no equivalent of WhatsApp's
    # identity-first flow here -- see app/core/bank/verification_flow.py), and
    # account existence used to be checked only later, in /tools/account-info.
    # That meant this endpoint would text a real verification code to ANY
    # phone number handed to /tools/identify, registered customer or not.
    try:
        account = await crud.get_bank_account_fields(convo.phone, ["owner_name"])
    except BankDbUnavailable as e:
        logger.error(f"[voice-agent] bank lookup unavailable before OTP send: {e}")
        return {"status": "unavailable"}

    if account is None:
        logger.info(
            f"[voice-agent] no account for {mask_identifier(convo.phone)} "
            f"in conversation {body.conversation_id}; OTP not sent"
        )
        return {"status": "not_found"}

    # Which fields get unlocked by this OTP is irrelevant here (unlike the
    # WhatsApp flow): /tools/account-info re-validates against the same
    # allowlist per-request. Passing the full allowlist just keeps
    # verification_store's record accurate.
    outcome = await start_verification(str(convo.db_session_id), convo.phone, tuple(ALLOWED_FIELDS))
    return {"status": outcome}


@router.post("/tools/verify-otp", dependencies=[Depends(require_elevenlabs_tool_secret)])
async def verify_otp(body: VerifyOtpRequest):
    convo = voice_conversation_store.get(body.conversation_id)
    if convo is None:
        raise HTTPException(status_code=404, detail="Unknown conversation - call identify first")

    outcome, remaining = await process_otp_verification(
        str(convo.db_session_id), convo.phone, body.code
    )
    if outcome == "valid":
        voice_conversation_store.mark_verified(body.conversation_id)
        return {"status": "valid"}
    if outcome == "wrong":
        return {"status": "wrong", "attempts_remaining": remaining}
    return {"status": outcome}  # "exhausted" or "error"


@router.post("/tools/account-info", dependencies=[Depends(require_elevenlabs_tool_secret)])
async def account_info(body: AccountInfoRequest):
    convo = voice_conversation_store.get(body.conversation_id)
    if convo is None:
        raise HTTPException(status_code=404, detail="Unknown conversation - call identify first")
    if not convo.otp_verified:
        raise HTTPException(status_code=403, detail="Caller has not completed OTP verification")

    try:
        fields = tuple(AccountField(f) for f in body.fields)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"fields must be one of {sorted(f.value for f in ALLOWED_FIELDS)}",
        )

    try:
        account = await crud.get_bank_account_fields(convo.phone, required_crud_fields(fields))
    except BankDbUnavailable as e:
        logger.error(f"[voice-agent] bank lookup unavailable: {e}")
        raise HTTPException(status_code=503, detail="Account data is temporarily unavailable")

    if not account:
        raise HTTPException(status_code=404, detail="No account found for this caller")

    wanted = {f.value for f in fields} | {"owner_name"}
    payload = {k: v for k, v in account.items() if k in wanted}

    # Card numbers are masked before the payload leaves this process, exactly as
    # app/core/bank/responses.py masks them for WhatsApp. Everything returned
    # here is spoken aloud by ElevenLabs' hosted LLM and retained in their
    # conversation log -- a full PAN must not end up in either.
    cards = payload.get(AccountField.CARDS.value)
    if isinstance(cards, list):
        payload[AccountField.CARDS.value] = [
            {**card, "card_number": mask_identifier(str(card.get("card_number") or ""), visible=4)}
            if isinstance(card, dict)
            else card
            for card in cards
        ]

    return payload


@router.post("/tools/file-complaint", dependencies=[Depends(require_elevenlabs_tool_secret)])
async def file_complaint(body: FileComplaintRequest):
    """Record a complaint the caller described during the call.

    Unlike WhatsApp -- where a deterministic slot machine collects the details
    (app/core/complaints/) -- the ElevenLabs agent does the collecting here and
    submits it in one call. That is this channel's existing model: it drives the
    conversation and calls tools for effects. Deliberately does NOT require OTP
    verification: filing a complaint discloses nothing about an account, and
    making a frustrated caller verify first is the wrong trade.

    The category is validated against the same fixed set WhatsApp offers, so a
    hallucinated category cannot enter the table and split the dashboard's
    grouping.
    """
    convo = voice_conversation_store.get(body.conversation_id)
    if convo is None:
        raise HTTPException(status_code=404, detail="Unknown conversation - call identify first")

    if body.category not in CATEGORY_LABELS:
        raise HTTPException(
            status_code=400,
            detail=f"category must be one of {sorted(CATEGORY_LABELS)}",
        )

    description = (body.description or "").strip()
    if not is_valid_description(description):
        raise HTTPException(
            status_code=400,
            detail=f"description must be at least {MIN_DESCRIPTION_LENGTH} characters",
        )

    try:
        complaint = await crud.create_complaint(
            None,
            channel=ChannelType.voice,
            category=body.category,
            # Redacted for the same reason WhatsApp redacts: a caller reads a
            # card number aloud more readily than they type one.
            description=redact_pii(description),
            session_id=convo.db_session_id,
            customer_id=convo.customer_id,
            customer_phone=convo.phone,
            preferred_contact=body.preferred_contact,
            context={
                "category_label": CATEGORY_LABELS[body.category],
                "conversation_id": body.conversation_id,
            },
        )
    except Exception as e:
        logger.error(f"[voice-agent] failed to save complaint: {e}")
        raise HTTPException(status_code=503, detail="Could not save the complaint")

    try:
        await crud.create_notification(
            None,
            user_id=None,
            title="📝 New Complaint Filed",
            message=f"Complaint {complaint.reference_number} from a voice call.",
            type="escalation",
            action_url=f"/complaints/{complaint.id}",
        )
    except Exception as e:
        logger.error(f"[voice-agent] failed to create complaint notification: {e}")

    logger.info(
        f"[voice-agent] filed complaint {complaint.reference_number} "
        f"for conversation {body.conversation_id}"
    )
    return {"status": "ok", "reference_number": complaint.reference_number}


# ---------------------------------------------------------------------------
# Signed URL (called by the browser widget, not ElevenLabs -- no shared
# secret here, since a browser can't hold one safely)
# ---------------------------------------------------------------------------


@router.get("/signed-url")
async def signed_url():
    if not settings.ELEVENLABS_API_KEY or not settings.ELEVENLABS_AGENT_ID:
        raise HTTPException(status_code=503, detail="Voice agent is not configured")

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            response = await client.get(
                ELEVENLABS_SIGNED_URL_ENDPOINT,
                params={"agent_id": settings.ELEVENLABS_AGENT_ID},
                headers={"xi-api-key": settings.ELEVENLABS_API_KEY},
            )
            response.raise_for_status()
        except httpx.HTTPError as e:
            logger.error(f"[voice-agent] failed to mint signed URL: {e}")
            raise HTTPException(status_code=502, detail="Could not start voice session")

    return {"signed_url": response.json().get("signed_url")}


# ---------------------------------------------------------------------------
# Post-call webhook (server-to-server, from ElevenLabs, once the call ends)
# ---------------------------------------------------------------------------


@router.post("/webhook/post-call")
async def post_call_webhook(request: Request, elevenlabs_signature: Optional[str] = Header(None)):
    raw_body = await request.body()
    if not _verify_elevenlabs_webhook_signature(raw_body, elevenlabs_signature):
        raise HTTPException(status_code=401, detail="Invalid signature")

    payload = await request.json()
    data = payload.get("data", payload)
    conversation_id = data.get("conversation_id")
    if not conversation_id:
        raise HTTPException(status_code=400, detail="Missing conversation_id")

    session = await crud.get_session_by_external_conversation_id(None, conversation_id)
    if session is None:
        logger.warning(
            f"[voice-agent] post-call webhook for unknown conversation {conversation_id}"
        )
        return {"status": "ignored"}

    if session.ended_at is not None:
        # Already processed - ElevenLabs retries webhook delivery on non-2xx.
        return {"status": "already_processed"}

    transcript = data.get("transcript") or []
    for turn in transcript:
        role = turn.get("role")
        text = turn.get("message") or turn.get("text")
        if not text:
            continue
        direction = MessageDirection.inbound if role == "user" else MessageDirection.outbound
        await crud.create_message(
            None,
            session_id=session.id,
            content=text,
            direction=direction,
            channel=ChannelType.voice,
        )

    await crud.update_session_status(None, session.id, SessionStatus.completed)
    voice_conversation_store.clear(conversation_id)

    logger.info(
        f"[voice-agent] logged {len(transcript)} turn(s) for conversation {conversation_id}"
    )
    return {"status": "ok"}
