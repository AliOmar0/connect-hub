"""
In-process OTP generation, delivery, and verification.

This used to call out to a standalone ``otp-service`` process over HTTP. That
service has been merged into this backend -- one process, one ``.env``, one
ngrok tunnel -- so this module now does the work itself:

1. Generates a CSPRNG code and writes it to ``bank_otps`` via the existing
   service-role ``supabase`` client (the **OPS** project -- same one this
   backend already reads/writes sessions and messages in; see
   scripts/sql/bank_otps_hardening.sql for that table's RLS lockdown).
2. Sends it over a WhatsApp number **dedicated to security messages**
   (``SECURITY_WHATSAPP_PHONE_NUMBER_ID`` / ``SECURITY_WHATSAPP_ACCESS_TOKEN``),
   deliberately separate from the customer-support number in
   ``api_configurations`` -- a leaked support-agent WhatsApp token must not be
   usable to read or send verification codes.
3. Verifies a submitted code against the stored row.

The public interface (``otp_client.generate`` / ``otp_client.verify``, and the
``SendOutcome`` / ``VerifyOutcome`` return values) is unchanged from the old
HTTP-based client, so ``app/core/bank/verification_flow.py`` needed no changes.

The important invariant is also unchanged: **this backend never returns the
code to its caller.** ``generate()`` reports only whether a code was sent;
``verify()`` reports only whether the submitted code was right.
"""

from __future__ import annotations

import hmac
import logging
import secrets
import time
from collections import deque
from datetime import datetime, timedelta, timezone
from typing import Deque, Dict

from app.core.config import settings
from app.core.nlp.normalize import mask_identifier
from app.core.whatsapp import WhatsAppClient
from app.database import supabase

logger = logging.getLogger(__name__)

# "sent" / "rate_limited" / "unavailable"
SendOutcome = str
# "valid" / "invalid" / "error"
VerifyOutcome = str


def _digits(phone: str) -> str:
    return "".join(ch for ch in (phone or "") if ch.isdigit())


class _PhoneRateLimiter:
    """Per-phone sliding window, independent of any one chat session.

    ``verification_state.py``'s ``OtpSendLimiter`` and ``VerificationStore``
    already guard the normal chat path per-session; this is the
    defense-in-depth layer the standalone otp-service used to provide at its
    own trust boundary. Kept so a caller reaching generate()/verify() by any
    other route -- the voice tools, a future channel -- still cannot send or
    brute-force codes for one phone number without bound.
    """

    def __init__(self, limit: int, window_seconds: float) -> None:
        self._limit = limit
        self._window = window_seconds
        self._hits: Dict[str, Deque[float]] = {}

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        bucket = self._hits.setdefault(key, deque())
        while bucket and now - bucket[0] > self._window:
            bucket.popleft()
        if len(bucket) >= self._limit:
            return False
        bucket.append(now)
        return True


class LocalOtpService:
    def __init__(self) -> None:
        # Same limits the standalone otp-service enforced: 3 codes per phone
        # per 15 min, 10 verify attempts per phone per 5 min.
        self._generate_limiter = _PhoneRateLimiter(3, 15 * 60)
        self._verify_limiter = _PhoneRateLimiter(10, 5 * 60)

    @property
    def configured(self) -> bool:
        return bool(
            supabase
            and settings.SECURITY_WHATSAPP_PHONE_NUMBER_ID
            and settings.SECURITY_WHATSAPP_ACCESS_TOKEN
        )

    def _whatsapp_client(self) -> WhatsAppClient:
        return WhatsAppClient(
            phone_number_id=settings.SECURITY_WHATSAPP_PHONE_NUMBER_ID,
            access_token=settings.SECURITY_WHATSAPP_ACCESS_TOKEN,
        )

    async def generate(self, phone: str, intent: str = "ACCOUNT_INFO") -> SendOutcome:
        """Generate a code, store it, and send it. Never returns the code."""
        if not self.configured:
            logger.error(
                "OTP delivery is not configured: set SECURITY_WHATSAPP_PHONE_NUMBER_ID "
                "and SECURITY_WHATSAPP_ACCESS_TOKEN."
            )
            return "unavailable"

        key = _digits(phone)
        if not self._generate_limiter.allow(key):
            return "rate_limited"

        # CSPRNG, not a plain PRNG -- a guessable code defeats the whole point
        # of gating account access behind one.
        upper = 10**settings.OTP_CODE_LENGTH
        lower = 10 ** (settings.OTP_CODE_LENGTH - 1)
        code = str(secrets.randbelow(upper - lower) + lower)
        # SECURITY: never log the code itself.
        logger.info(f"Generating OTP for {mask_identifier(phone)}")

        expires_at = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()
        try:
            # Retire any outstanding codes for this phone first, so only the
            # one row this call is about to insert is ever live.
            supabase.table("bank_otps").update(
                {"consumed_at": datetime.now(timezone.utc).isoformat()}
            ).eq("phone_number", phone).is_("consumed_at", "null").execute()

            supabase.table("bank_otps").insert(
                {"phone_number": phone, "otp_code": code, "expires_at": expires_at}
            ).execute()
        except Exception as e:
            logger.error(f"[OTP] failed to store code for {mask_identifier(phone)}: {e}")
            return "unavailable"

        try:
            if intent == "CRITICAL_ACTION":
                message = (
                    f"رمز التحقق الخاص بك لإتمام العملية الحساسة هو: {code}. "
                    "يرجى عدم مشاركته مع أحد لحماية حسابك."
                )
            else:
                message = (
                    "الرمز الخاص بك للتحقق من بيانات الحساب في البنك الإسلامي الفلسطيني هو: "
                    f"{code}. يرجى عدم مشاركته مع أحد."
                )
            await self._whatsapp_client().send_text_message(phone, message)
        except Exception as e:
            logger.error(f"[OTP] WhatsApp delivery failed for {mask_identifier(phone)}: {e}")
            # A delivery failure MUST fail the whole request: leaving the code
            # live in the DB when nobody received it only widens the window
            # for a blind guess against verify(), and the caller would
            # otherwise wait on a code that can never arrive.
            try:
                supabase.table("bank_otps").update(
                    {"consumed_at": datetime.now(timezone.utc).isoformat()}
                ).eq("phone_number", phone).is_("consumed_at", "null").execute()
            except Exception as cleanup_error:
                logger.error(f"[OTP] failed to retire undelivered code: {cleanup_error}")
            return "unavailable"

        try:
            from app.crud import crud

            await crud.create_notification(
                None,
                title="🔑 PIB WhatsApp OTP",
                message=f"A verification OTP was sent to {mask_identifier(phone)}.",
                type="info",
            )
        except Exception:
            pass  # Audit trail only -- must never block delivery.

        return "sent"

    async def verify(self, phone: str, code: str) -> VerifyOutcome:
        """Check a submitted code against the newest live one for this phone.

        Returns "error" (never "invalid") on our own failures, so the caller
        does not charge the customer an attempt for an outage that was not
        their mistake -- see app/core/bank/verification_flow.py.
        """
        if not self.configured:
            logger.error("OTP delivery is not configured")
            return "error"

        key = _digits(phone)
        if not self._verify_limiter.allow(key):
            return "error"

        try:
            response = (
                supabase.table("bank_otps")
                .select("*")
                .eq("phone_number", phone)
                .eq("verified", False)
                .is_("consumed_at", "null")
                .gt("expires_at", datetime.now(timezone.utc).isoformat())
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )

            rows = response.data or []
            if not rows:
                return "invalid"

            row = rows[0]
            attempts = (row.get("attempts") or 0) + 1

            if attempts > settings.OTP_MAX_VERIFY_ATTEMPTS:
                supabase.table("bank_otps").update(
                    {"consumed_at": datetime.now(timezone.utc).isoformat()}
                ).eq("id", row["id"]).execute()
                logger.warning(f"[OTP] burned after too many attempts for {mask_identifier(phone)}")
                return "invalid"

            # Compared with hmac.compare_digest -- not ``==`` -- so a wrong
            # guess cannot be timed to learn how many leading digits matched.
            if hmac.compare_digest(str(row.get("otp_code") or ""), str(code)):
                supabase.table("bank_otps").update(
                    {
                        "verified": True,
                        "attempts": attempts,
                        "consumed_at": datetime.now(timezone.utc).isoformat(),
                    }
                ).eq("id", row["id"]).execute()
                return "valid"

            supabase.table("bank_otps").update({"attempts": attempts}).eq("id", row["id"]).execute()
            return "invalid"
        except Exception as e:
            # Never log `code`.
            logger.error(f"[OTP] verify failed for {mask_identifier(phone)}: {e}")
            return "error"


otp_client = LocalOtpService()
