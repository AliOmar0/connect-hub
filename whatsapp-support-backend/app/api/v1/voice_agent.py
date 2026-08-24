"""Tool + signed-url + post-call-webhook endpoints for the ElevenLabs voice agent.

This channel inherits the invariants documented in docs/BANK_ACCOUNT_ACCESS.md
and enforced by app/core/bank/: bank_db_oss is read-only, and account data is
only disclosed after identity + OTP verification. Identity is established the
same way WhatsApp does it (app/api/v1/webhook.py's identity_pending branch):
the caller states their national ID + date of birth, /tools/verify-identity
resolves that pair to the phone Bank_db_oss has ON FILE via
resolve_customer_phone_by_identity, and the OTP goes to THAT phone --
regardless of what number the caller is calling from. What's relaxed here (by
explicit product decision, voice-only): the /tools/account-info response goes
straight to ElevenLabs' own hosted LLM as a tool result, so it can be spoken
aloud -- unlike WhatsApp, where account values never reach any LLM. Nothing is
persisted by the tool endpoints themselves; conversation logging is the
post-call webhook's job (see plan: turn-by-turn logging would need a public,
weakly authenticated browser-facing endpoint, so the ElevenLabs-signed
post-call webhook is used instead).
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import time
from typing import List, Optional
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from app.api.v1.deps import verify_jwt
from app.core.bank import (
    ALLOWED_FIELDS,
    AccountField,
    normalize_identity_input,
    process_otp_verification,
    required_crud_fields,
    resolve_customer_phone_by_identity,
    start_verification,
)
from app.core.complaints import (
    CATEGORY_LABELS,
    MIN_DESCRIPTION_LENGTH,
    is_valid_description,
)
from app.core.config import settings
from app.core.nlp.normalize import mask_identifier
from app.core.pii import redact_pii
from app.core.triage.session_types import COMPLAINT_SESSION_TYPE
from app.core.voice_agent_state import voice_conversation_store
from app.crud import crud
from app.database import BankDbUnavailable
from app.models.enums import ChannelType, MessageDirection, SessionStatus

logger = logging.getLogger("voice_agent")

router = APIRouter(prefix="/voice-agent")

ELEVENLABS_SIGNED_URL_ENDPOINT = "https://api.elevenlabs.io/v1/convai/conversation/get-signed-url"
ELEVENLABS_CONVERSATION_AUDIO_ENDPOINT = (
    "https://api.elevenlabs.io/v1/convai/conversations/{conversation_id}/audio"
)
# Voice is a real-time channel: a knowledge lookup that takes longer than this
# is heard as dead air, so the retrieval budget is deliberately tight.
_KNOWLEDGE_SEARCH_TOP_K = 3
# The agent prompt caps spoken replies at 60 words; feeding it 150-word chunks
# (build_context_block's default) just invites it to read an essay aloud.
_KNOWLEDGE_SEARCH_WORDS_PER_CHUNK = 80
# ElevenLabs webhook signature timestamps outside this window are rejected as
# stale, to limit the replay window on a leaked/logged signature.
_WEBHOOK_SIGNATURE_TOLERANCE_SECONDS = 1800


def _keyword_chunks(query: str, top_k: int):
    """Keyword hits from the static dataset, shaped like vector-search results.

    Mirrors the conversion app.core.rag.retrieve_with_audit does for its own
    fallback, so callers can treat both the same way.
    """
    from app.core.rag import RetrievedChunk, retrieve_from_json_knowledge_base

    return [
        RetrievedChunk(
            id=f"json_kb_{index}",
            document_id=item.get("url", "unknown"),
            chunk_index=0,
            content=item.get("content", ""),
            score=min(item.get("score", 50) / 100, 1.0),
            metadata={
                "title": item.get("title", ""),
                "url": item.get("url", ""),
                "source": "json_kb_fallback",
            },
        )
        for index, item in enumerate(retrieve_from_json_knowledge_base(query, top_n=top_k))
    ]


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


class VerifyIdentityRequest(BaseModel):
    conversation_id: str
    national_id: str
    # The agent is instructed to send ISO YYYY-MM-DD; day-first forms are
    # accepted as a fallback. See app/core/bank/identity_input.py.
    date_of_birth: str


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


class KnowledgeSearchRequest(BaseModel):
    query: str
    # Optional on purpose: general questions about products, fees and branches
    # must work before the caller has been through /tools/verify-identity. It
    # is used only to correlate the retrieval log with a session.
    conversation_id: Optional[str] = None


class EscalateRequest(BaseModel):
    conversation_id: str
    reason: str


# ---------------------------------------------------------------------------
# Tools (called by the ElevenLabs agent during a call)
# ---------------------------------------------------------------------------


@router.post("/tools/verify-identity", dependencies=[Depends(require_elevenlabs_tool_secret)])
async def verify_identity(body: VerifyIdentityRequest):
    """Resolve a spoken (national_id, date_of_birth) claim to the phone
    Bank_db_oss has on file, and OTP that phone -- the same identity-first
    gate WhatsApp uses (app/api/v1/webhook.py's identity_pending branch),
    applied to voice.

    Replaces the old phone-based /tools/identify: there, the caller SPOKE a
    phone number and it was trusted at face value, so anyone who knew a
    customer's number could start the flow and the OTP landed on whatever
    number the caller chose. Here the OTP always goes to the number
    Bank_db_oss has on record for the matched identity, regardless of what
    the caller is calling from.

    The caller's NAME is not a factor: it was the one value arriving through
    speech-to-text, and Arabic names vary in hamza/alef/ta-marbuta forms
    constantly, so matching it required a deliberately loosened comparison.
    A date of birth is exact and has no spelling. See
    scripts/sql/bank_db_oss_identity_lookup_v3.sql.

    The DB session is created/attached BEFORE any identity lookup runs (see
    app/core/voice_agent_state.py's module docstring): a caller who never
    gets past this gate must still have a loggable, escalatable session, or
    /tools/escalate and the post-call webhook would have nothing to act on.

    Can legitimately be called more than once per conversation -- the caller
    misspoke their name or ID and is retrying. Re-inserting would violate
    external_conversation_id's unique index (one session per conversation),
    so the existing session is re-pointed rather than duplicated.
    """
    existing = await crud.get_session_by_external_conversation_id(None, body.conversation_id)
    if existing is not None:
        session = existing
    else:
        session = await crud.create_session(
            None,
            None,
            channel=ChannelType.voice,
            external_conversation_id=body.conversation_id,
        )

    convo = voice_conversation_store.get(body.conversation_id)
    if convo is None:
        convo = voice_conversation_store.start(body.conversation_id, db_session_id=session.id)

    cleaned, problem, digit_count = normalize_identity_input(body.national_id, body.date_of_birth)
    if problem is not None:
        # A format problem, not a database miss -- does NOT consume an
        # identity attempt (mirrors WhatsApp's build_identity_malformed_reply
        # path) and is safe to name specifically: it discloses nothing about
        # who does or doesn't have an account.
        return {"status": problem, "digits_received": digit_count}

    clean_id, clean_dob = cleaned
    try:
        phone_on_file = await resolve_customer_phone_by_identity(clean_id, clean_dob)
    except BankDbUnavailable as e:
        logger.error(f"[voice-agent] bank identity lookup unavailable: {e}")
        return {"status": "unavailable"}
    except Exception as e:
        logger.error(f"[voice-agent] bank identity lookup failed: {e}")
        return {"status": "unavailable"}

    if phone_on_file is None:
        # Deliberately generic either way -- see
        # resolve_customer_phone_by_identity's docstring -- do not let this
        # branch become an oracle for whether it was the national ID or the
        # date of birth that was wrong, and never echo back any part of a
        # phone number here.
        attempts = voice_conversation_store.record_identity_failure(body.conversation_id)
        remaining = settings.IDENTITY_MAX_ATTEMPTS - attempts
        if remaining <= 0:
            return {"status": "exhausted"}
        return {"status": "not_found", "attempts_remaining": remaining}

    customer = await crud.get_customer_by_phone(None, phone_on_file)
    if customer is None:
        # No name to seed the row with -- the caller never states one now, and
        # the authoritative name arrives from the bank in send_otp below.
        customer = await crud.create_customer(
            None, phone_on_file, name="", channel=ChannelType.voice
        )

    await crud.update_session_customer(None, session.id, customer.id)
    voice_conversation_store.mark_identity_verified(
        body.conversation_id,
        customer_id=customer.id,
        phone=phone_on_file,
        national_id=clean_id,
    )
    logger.info(
        f"[voice-agent] verified identity for {mask_identifier(phone_on_file)} "
        f"in conversation {body.conversation_id}"
    )
    return {"status": "ok"}


@router.post("/tools/send-otp", dependencies=[Depends(require_elevenlabs_tool_secret)])
async def send_otp(body: ConversationIdRequest):
    convo = voice_conversation_store.get(body.conversation_id)
    if convo is None:
        raise HTTPException(
            status_code=404, detail="Unknown conversation - call verify-identity first"
        )
    if not convo.identity_verified:
        raise HTTPException(
            status_code=403, detail="Caller has not completed identity verification"
        )

    # Verify the resolved phone-on-file actually has a Bank_db_oss account
    # BEFORE sending a real OTP. identity_verified only proves a *customer*
    # row matched (see resolve_customer_phone_by_identity) -- it says nothing
    # about whether that customer has an *account*, and account existence
    # used to be checked only later, in /tools/account-info. That meant this
    # endpoint could text a real verification code to a customer with no
    # account to disclose.
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

    # The account lookup above already carries the holder's name as the bank
    # records it. Keep it: a complaint filed later is recorded under this,
    # rather than under a name the caller spoke and ASR transcribed.
    voice_conversation_store.record_owner_name(
        body.conversation_id, str(account.get("owner_name") or "")
    )

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
        raise HTTPException(
            status_code=404, detail="Unknown conversation - call verify-identity first"
        )

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
        raise HTTPException(
            status_code=404, detail="Unknown conversation - call verify-identity first"
        )
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
    conversation and calls tools for effects.

    Now requires the SAME identity + OTP gate as an account question
    (identity_verified and otp_verified on the conversation entry -- see
    /tools/verify-identity and /tools/verify-otp). This reverses the previous
    design, which deliberately skipped verification on the argument that
    filing a complaint discloses nothing about an account. The accepted
    consequence: a caller whose identity does not resolve, or who never
    completes OTP, cannot file a complaint by voice at all -- /tools/escalate
    is the designated path for them instead. full_name/national_id are no
    longer request fields; they come from the conversation entry that passed
    verify-identity, so this can never be handed an identity that never
    passed the gate. national_id is stored masked by crud.create_complaint,
    same as everywhere else it's collected.

    The category is validated against the same fixed set WhatsApp offers, so a
    hallucinated category cannot enter the table and split the dashboard's
    grouping.
    """
    convo = voice_conversation_store.get(body.conversation_id)
    if convo is None:
        raise HTTPException(
            status_code=404, detail="Unknown conversation - call verify-identity first"
        )
    if not convo.otp_verified:
        raise HTTPException(status_code=403, detail="Caller has not completed verification")

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
            customer_name=convo.verified_full_name,
            national_id=convo.verified_national_id,
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

    # A filed complaint IS the session type. Set directly rather than leaving it
    # to the classifier, which for a voice call runs only at session close and
    # can still come back with no match at all.
    if convo.db_session_id:
        try:
            session = await crud.get_session_by_id(None, convo.db_session_id)
            if session and session.main_type_id is None:
                types = await crud.get_session_main_types(None)
                match = next((t for t in types if t.get("name") == COMPLAINT_SESSION_TYPE), None)
                if match:
                    await crud.update_session_main_type(
                        None, convo.db_session_id, UUID(match["id"])
                    )
        except Exception as e:
            logger.warning(f"[voice-agent] could not set complaint session type: {e}")

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


@router.post("/tools/knowledge-search", dependencies=[Depends(require_elevenlabs_tool_secret)])
async def knowledge_search(body: KnowledgeSearchRequest):
    """Ground the agent's answers in the bank's own knowledge base.

    Without this tool the ElevenLabs agent answers product, fee and branch
    questions from its hosted model's own knowledge -- every document uploaded
    through /api/v1/knowledge-base and every page the scraper ingests is
    invisible to callers. This routes those questions through the same
    retrieval stack the decision engine uses (app/core/decision_engine.py),
    so the two channels answer from one corpus.

    Nothing here is persisted and nothing is disclosed about an account, so no
    OTP gate: the shared secret is the only thing standing between this and the
    public internet, exactly as for the other tools.
    """
    query = (body.query or "").strip()
    if not query:
        return {"found": False, "context": "", "sources": []}

    session_id = None
    if body.conversation_id:
        convo = voice_conversation_store.get(body.conversation_id)
        if convo is not None and convo.db_session_id:
            session_id = str(convo.db_session_id)

    # Imported here, not at module scope, purely for import hygiene: app.core.rag
    # drags in sentence-transformers/torch, and importing that after the Supabase
    # client stack has already loaded segfaults the interpreter on Windows (the
    # same collision app/api/v1/knowledge_base.py hits when imported on its own).
    # By the time a call is in progress the module is long since loaded, so this
    # costs a dict lookup.
    from app.core.rag import build_context_block, retrieve_with_audit

    started = time.monotonic()
    # Both calls below are fully synchronous -- retrieval embeds the query with
    # sentence-transformers and then makes a blocking Qdrant call. Awaiting them
    # inline would stall the event loop (and every other in-flight call) for the
    # whole embedding pass, so they run on a worker thread.
    try:
        chunks, _fallback = await run_in_threadpool(
            retrieve_with_audit,
            query,
            session_id=session_id,
            top_k=_KNOWLEDGE_SEARCH_TOP_K,
        )
    except Exception as e:
        # retrieve_with_audit's own JSON fallback only runs when vector search
        # returns cleanly-empty. Anything that RAISES first -- an unreachable
        # Qdrant, a locked local storage folder, a missing embedding model --
        # skips it entirely, and the caller would be told the bank has no
        # answer when the dataset in fact does. Reach for the keyword index
        # directly instead: degraded, but an answer.
        logger.warning(f"[voice-agent] vector retrieval failed ({e}); using keyword fallback")
        try:
            chunks = await run_in_threadpool(_keyword_chunks, query, _KNOWLEDGE_SEARCH_TOP_K)
        except Exception as fallback_error:
            logger.error(f"[voice-agent] knowledge search failed: {fallback_error}")
            return {"found": False, "context": "", "sources": []}

    elapsed_ms = int((time.monotonic() - started) * 1000)

    if not chunks:
        logger.info(f"[voice-agent] knowledge search: no match ({elapsed_ms} ms)")
        # Deliberately not an error and deliberately not build_context_block's
        # empty-case string: the agent's prompt turns `found: false` into an
        # offer to transfer, and a canned Arabic paragraph here would just be
        # read aloud verbatim.
        return {"found": False, "context": "", "sources": []}

    sources = []
    for chunk in chunks:
        source = (
            chunk.metadata.get("source_url")
            or chunk.metadata.get("url")
            or chunk.metadata.get("title")
        )
        if source and source not in sources:
            sources.append(source)

    logger.info(f"[voice-agent] knowledge search: {len(chunks)} chunk(s) in {elapsed_ms} ms")
    return {
        "found": True,
        "context": build_context_block(
            chunks, max_words_per_chunk=_KNOWLEDGE_SEARCH_WORDS_PER_CHUNK
        ),
        "sources": sources,
    }


@router.post("/tools/escalate", dependencies=[Depends(require_elevenlabs_tool_secret)])
async def escalate(body: EscalateRequest):
    """Hand the call to a human.

    The agent prompt offers a transfer in half a dozen places; until this tool
    existed nothing happened when it did -- the session stayed `active` and no
    one was notified. Mirrors the two durable effects of webhook.py::_escalate
    (status + staff notification); the WhatsApp reply it also sends has no
    equivalent here, because the agent speaks the handover itself.

    Degrades rather than 404s when there is no conversation entry (the store's
    30-minute TTL expired, or the agent escalates -- e.g. a bank-transfer
    request -- before ever calling verify-identity). escalate is now also the
    designated failure path for `exhausted` identity/OTP verification, so it
    must not be the thing that breaks; a notification with no session link is
    strictly better than none at all.
    """
    convo = voice_conversation_store.get(body.conversation_id)

    if convo is not None:
        await crud.update_session_status(None, convo.db_session_id, SessionStatus.escalated)

    action_url = f"/sessions/{convo.db_session_id}" if convo is not None else None
    try:
        await crud.create_notification(
            None,
            user_id=None,
            title="⚠️ New Escalation Request",
            # Redacted for the same reason a complaint description is: a caller
            # explaining why they need a human reads out card numbers.
            message=redact_pii((body.reason or "").strip()) or "Voice call escalated.",
            type="escalation",
            action_url=action_url,
        )
    except Exception as e:
        logger.error(f"[voice-agent] failed to create escalation notification: {e}")

    logger.info(f"[voice-agent] escalated conversation {body.conversation_id}")
    return {"status": "ok"}


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
# Recording playback (dashboard -> here -> ElevenLabs). Staff-only.
# ---------------------------------------------------------------------------


@router.get("/recording/{session_id}", dependencies=[Depends(verify_jwt)])
async def call_recording(session_id: UUID):
    """Stream a finished call's recording to the dashboard.

    Pulled from ElevenLabs on demand rather than copied into Supabase Storage:
    the audio contains everything the caller said aloud, including whatever they
    read out before the agent could stop them, and a second permanent copy of
    that is a liability with no upside. The trade is that playback stops working
    once the ElevenLabs retention window elapses (404 below).

    This router sits outside the global staff-JWT dependency (see main.py), so
    the dependency is attached per-route here -- without it this would be an
    open endpoint serving customer call audio to anyone with a session id.
    """
    if not settings.ELEVENLABS_API_KEY:
        raise HTTPException(status_code=503, detail="Voice agent is not configured")

    session = await crud.get_session_by_id(None, session_id)
    if session is None or not session.external_conversation_id:
        raise HTTPException(status_code=404, detail="No recording for this session")

    url = ELEVENLABS_CONVERSATION_AUDIO_ENDPOINT.format(
        conversation_id=session.external_conversation_id
    )

    client = httpx.AsyncClient(timeout=30.0)
    try:
        request = client.build_request(
            "GET", url, headers={"xi-api-key": settings.ELEVENLABS_API_KEY}
        )
        response = await client.send(request, stream=True)
    except httpx.HTTPError as e:
        await client.aclose()
        logger.error(f"[voice-agent] failed to fetch recording: {e}")
        raise HTTPException(status_code=502, detail="Could not fetch the recording")

    if response.status_code == 404:
        await response.aclose()
        await client.aclose()
        raise HTTPException(status_code=404, detail="Recording is no longer available")
    if response.status_code >= 400:
        await response.aclose()
        await client.aclose()
        logger.error(f"[voice-agent] recording fetch returned {response.status_code}")
        raise HTTPException(status_code=502, detail="Could not fetch the recording")

    async def stream():
        try:
            async for piece in response.aiter_bytes():
                yield piece
        finally:
            await response.aclose()
            await client.aclose()

    return StreamingResponse(stream(), media_type="audio/mpeg")


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
    event_type = payload.get("type")
    conversation_id = data.get("conversation_id")
    if not conversation_id:
        raise HTTPException(status_code=400, detail="Missing conversation_id")

    # ElevenLabs delivers three different event types to this one URL, and only
    # one of them carries a transcript. post_call_audio in particular has no
    # `transcript` at all, so handling it here as if it did would mark the
    # session completed (stamping ended_at) and the real transcription webhook
    # -- which may well arrive second -- would then hit the already-processed
    # guard below and the entire conversation would be dropped on the floor.
    if event_type in ("post_call_audio", "call_initiation_failure"):
        logger.info(f"[voice-agent] ignoring {event_type} for conversation {conversation_id}")
        return {"status": "ignored"}

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
    if not transcript and event_type != "post_call_transcription":
        # An unrecognised event type with nothing to log. Closing the session on
        # it would have the same transcript-eating effect as the audio webhook.
        logger.warning(f"[voice-agent] webhook type {event_type!r} carried no transcript; ignoring")
        return {"status": "ignored"}

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

    # ElevenLabs writes its own wrap-up of the call; surfacing it on the session
    # saves staff replaying a transcript to find out what the caller wanted.
    summary = ((data.get("analysis") or {}).get("transcript_summary") or "").strip()
    if summary:
        try:
            await crud.update_session_resolution_notes(None, session.id, redact_pii(summary))
        except Exception as e:
            logger.warning(f"[voice-agent] could not store call summary: {e}")

    await crud.update_session_status(None, session.id, SessionStatus.completed)
    voice_conversation_store.clear(conversation_id)

    logger.info(
        f"[voice-agent] logged {len(transcript)} turn(s) for conversation {conversation_id}"
    )
    return {"status": "ok"}
