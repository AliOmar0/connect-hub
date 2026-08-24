"""Channel-agnostic OTP verification flow shared by WhatsApp and the voice agent.

Extracted from app/api/v1/webhook.py so the voice agent (app/api/v1/voice_agent.py)
does not reimplement the send/verify bookkeeping. Returns raw outcomes only --
callers build their own channel-appropriate presentation (WhatsApp: Arabic
template text; voice: a structured status the ElevenLabs agent speaks from).
"""

from __future__ import annotations

from datetime import date
from typing import Optional, Sequence, Tuple

from app.core.bank.intents import AccountField
from app.core.config import settings
from app.core.otp_client import SendOutcome, otp_client
from app.core.verification_state import (
    VerificationIntent,
    otp_send_limiter,
    verification_store,
)
from app.crud import crud


async def start_verification(
    session_id: str,
    phone: str,
    fields: Sequence[AccountField],
    *,
    national_id: str = "",
    intent: VerificationIntent = "ACCOUNT_INFO",
) -> SendOutcome:
    """Send an OTP and record the pending verification.

    Returns "sent", "rate_limited", or "unavailable". Never returns or stores
    the code itself -- see app/core/otp_client.py.

    `intent` decides what the caller does once the code checks out:
    "ACCOUNT_INFO" discloses the requested fields, "COMPLAINT" writes the
    complaint the customer already described. `national_id` is carried through
    because a complaint record has to name who filed it, and by then the
    customer is several turns past having stated it.
    """
    if not otp_send_limiter.allow(phone):
        return "rate_limited"

    # otp_client's own intent vocabulary is about how the code is worded, not
    # about what happens afterwards -- a complaint verification is still an
    # ordinary account-holder confirmation, so it reuses ACCOUNT_INFO there.
    outcome = await otp_client.generate(phone, intent="ACCOUNT_INFO")
    if outcome != "sent":
        return outcome

    verification_store.start(
        session_id,
        phone=phone,
        intent=intent,
        fields=tuple(f.value for f in fields),
        national_id=national_id,
    )
    return "sent"


async def resolve_customer_phone_by_identity(
    national_id: str, date_of_birth: date
) -> Optional[str]:
    """Resolve a customer-stated (national_id, date_of_birth) to their
    Bank_db_oss phone-on-file. Returns None on no match; propagates
    BankDbUnavailable.

    This is the identity-first flow's ONLY read before OTP: it returns a
    phone, never account data. Account fields still only come from
    get_bank_account_fields, after that phone's OTP is verified -- see
    app/api/v1/webhook.py (WhatsApp) and app/api/v1/voice_agent.py's
    verify_identity (voice) -- both channels share this one function.

    Callers must NOT distinguish "wrong national ID" from "wrong date of
    birth" in what they say back, or this becomes an enumeration oracle for
    national ID numbers.

    The RPC name is configured via database.BANK_IDENTITY_RPC -- see
    scripts/sql/bank_db_oss_identity_lookup_v3.sql for why the match is
    national_id + date_of_birth rather than national_id + full_name.
    """
    return await crud.get_bank_customer_phone_by_identity(national_id, date_of_birth)


async def process_otp_verification(session_id: str, phone: str, code: str) -> Tuple[str, int]:
    """Check a submitted code against the pending verification for `session_id`.

    Returns (outcome, attempts_remaining):
      - ("valid", 0): verified, pending state cleared.
      - ("error", 0): our own outage -- caller should NOT charge an attempt.
      - ("wrong", remaining): incorrect code, remaining attempts before exhaustion.
      - ("exhausted", 0): attempt cap hit, pending state cleared.
    """
    outcome = await otp_client.verify(phone, code)

    if outcome == "valid":
        verification_store.clear(session_id)
        return "valid", 0

    if outcome == "error":
        return "error", 0

    attempts = verification_store.record_failure(session_id)
    remaining = settings.OTP_MAX_ATTEMPTS - attempts
    if remaining <= 0:
        verification_store.clear(session_id)
        return "exhausted", 0
    return "wrong", remaining
