"""Channel-agnostic OTP verification flow shared by WhatsApp and the voice agent.

Extracted from app/api/v1/webhook.py so the voice agent (app/api/v1/voice_agent.py)
does not reimplement the send/verify bookkeeping. Returns raw outcomes only --
callers build their own channel-appropriate presentation (WhatsApp: Arabic
template text; voice: a structured status the ElevenLabs agent speaks from).
"""

from __future__ import annotations

from typing import Optional, Sequence, Tuple

from app.core.bank.intents import AccountField
from app.core.config import settings
from app.core.otp_client import SendOutcome, otp_client
from app.core.verification_state import otp_send_limiter, verification_store
from app.crud import crud


async def start_verification(
    session_id: str,
    phone: str,
    fields: Sequence[AccountField],
) -> SendOutcome:
    """Send an OTP and record the pending verification.

    Returns "sent", "rate_limited", or "unavailable". Never returns or stores
    the code itself -- see app/core/otp_client.py.
    """
    if not otp_send_limiter.allow(phone):
        return "rate_limited"

    outcome = await otp_client.generate(phone, intent="ACCOUNT_INFO")
    if outcome != "sent":
        return outcome

    verification_store.start(
        session_id,
        phone=phone,
        intent="ACCOUNT_INFO",
        fields=tuple(f.value for f in fields),
    )
    return "sent"


async def resolve_customer_phone_by_identity(full_name: str, national_id: str) -> Optional[str]:
    """Resolve a customer-stated (full_name, national_id) to their Bank_db_oss
    phone-on-file. Returns None on no match; propagates BankDbUnavailable.

    This is the identity-first flow's ONLY read before OTP: it returns a
    phone, never account data. Account fields still only come from
    get_bank_account_fields, after that phone's OTP is verified -- see
    app/api/v1/webhook.py.
    """
    return await crud.get_bank_customer_phone_by_identity(full_name, national_id)


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
