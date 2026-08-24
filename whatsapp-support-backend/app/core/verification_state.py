"""
In-process state for pending OTP verifications.

Replaces the bare ``otp_sessions = {}`` dict that used to live in
``app/api/v1/webhook.py``. Three things changed:

* **The OTP itself is no longer stored.** Verification is delegated to the OTP
  service's ``/verify`` endpoint, so this process never holds the secret and
  there is no comparison here to get wrong.
* **TTL.** State expires with the code (``OTP_SESSION_TTL_SECONDS``), instead of
  living until process restart.
* **Attempt cap.** Wrong guesses are counted and the session is torn down at
  ``OTP_MAX_ATTEMPTS``, instead of allowing unlimited tries.

Still per-process: with multiple replicas a customer must stay on the instance
that started their verification. Same tradeoff the rate limiter already makes.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Dict, Literal, Optional, Tuple

from app.api.middleware.rate_limit import SlidingWindowCounter
from app.core.config import settings
from app.core.nlp.normalize import mask_identifier, normalize_msisdn

logger = logging.getLogger(__name__)


# What the caller should DO once the code checks out. Not the same axis as
# otp_client's own `intent`, which is only about how the message is worded.
VerificationIntent = Literal["ACCOUNT_INFO", "COMPLAINT"]


@dataclass
class PendingVerification:
    phone: str
    intent: VerificationIntent
    fields: Tuple[str, ...]  # AccountField values, allowlisted upstream
    expires_at: float  # time.monotonic() deadline
    attempts: int = 0
    # Carried so a COMPLAINT verification can name who filed it: by the time
    # the code arrives the customer stated this several turns ago, and the
    # complaint record must not fall back to asking again.
    national_id: str = ""


@dataclass
class VerificationStore:
    _pending: Dict[str, PendingVerification] = field(default_factory=dict)

    def start(
        self,
        session_id: str,
        *,
        phone: str,
        intent: VerificationIntent,
        fields: Tuple[str, ...],
        ttl: Optional[float] = None,
        national_id: str = "",
    ) -> PendingVerification:
        ttl = settings.OTP_SESSION_TTL_SECONDS if ttl is None else ttl
        entry = PendingVerification(
            phone=phone,
            intent=intent,
            fields=fields,
            expires_at=time.monotonic() + ttl,
            national_id=national_id,
        )
        self._pending[session_id] = entry
        return entry

    def get(self, session_id: str) -> Optional[PendingVerification]:
        """Return live state, evicting it first if the TTL has passed."""
        entry = self._pending.get(session_id)
        if entry is None:
            return None
        if time.monotonic() >= entry.expires_at:
            self._pending.pop(session_id, None)
            logger.info(f"Verification state expired for session {session_id}")
            return None
        return entry

    def record_failure(self, session_id: str) -> int:
        """Increment the attempt counter; returns the new count (0 if absent)."""
        entry = self._pending.get(session_id)
        if entry is None:
            return 0
        entry.attempts += 1
        return entry.attempts

    def clear(self, session_id: str) -> None:
        self._pending.pop(session_id, None)

    def purge_expired(self) -> int:
        now = time.monotonic()
        stale = [k for k, v in self._pending.items() if now >= v.expires_at]
        for k in stale:
            self._pending.pop(k, None)
        return len(stale)

    def clear_all(self) -> None:
        self._pending.clear()

    def __len__(self) -> int:
        return len(self._pending)

    def __contains__(self, session_id: object) -> bool:
        return self.get(str(session_id)) is not None


verification_store = VerificationStore()


@dataclass
class PendingIdentity:
    """State for a customer mid-way through the identity-first verification
    flow: they've asked an account question (or finished describing a
    complaint) but have not yet stated a (national_id, date_of_birth) pair
    that resolves to a Bank_db_oss phone.

    Deliberately does NOT hold the phone -- there isn't one yet, that's the
    point of this state. Once identity resolves, this is cleared and a
    PendingVerification (above) takes over, keyed by the SAME session_id.
    """

    fields: Tuple[str, ...]  # AccountField values the customer originally asked for
    expires_at: float
    attempts: int = 0
    # What the customer was doing when identity was demanded, so the OTP that
    # follows unlocks the right thing. "COMPLAINT" carries an empty `fields`:
    # a complaint discloses no account data, it just has to be filed by a
    # verified person.
    intent: VerificationIntent = "ACCOUNT_INFO"


@dataclass
class IdentityVerificationStore:
    """Mirrors VerificationStore's shape (TTL + attempt cap), for the identity
    step that now runs before OTP verification even starts."""

    _pending: Dict[str, PendingIdentity] = field(default_factory=dict)

    def start(
        self,
        session_id: str,
        *,
        fields: Tuple[str, ...],
        ttl: Optional[float] = None,
        intent: VerificationIntent = "ACCOUNT_INFO",
    ) -> PendingIdentity:
        ttl = settings.OTP_SESSION_TTL_SECONDS if ttl is None else ttl
        entry = PendingIdentity(
            fields=fields, expires_at=time.monotonic() + ttl, intent=intent
        )
        self._pending[session_id] = entry
        return entry

    def get(self, session_id: str) -> Optional[PendingIdentity]:
        entry = self._pending.get(session_id)
        if entry is None:
            return None
        if time.monotonic() >= entry.expires_at:
            self._pending.pop(session_id, None)
            logger.info(f"Identity verification state expired for session {session_id}")
            return None
        return entry

    def record_failure(self, session_id: str) -> int:
        entry = self._pending.get(session_id)
        if entry is None:
            return 0
        entry.attempts += 1
        return entry.attempts

    def clear(self, session_id: str) -> None:
        self._pending.pop(session_id, None)

    def purge_expired(self) -> int:
        now = time.monotonic()
        stale = [k for k, v in self._pending.items() if now >= v.expires_at]
        for k in stale:
            self._pending.pop(k, None)
        return len(stale)

    def __len__(self) -> int:
        return len(self._pending)


identity_pending_store = IdentityVerificationStore()


class OtpSendLimiter:
    """Per-phone send throttle: a cooldown plus a rolling cap.

    Stops an attacker (or a keyword-matching loop) from using our WhatsApp
    number to spam verification codes at an arbitrary phone.
    """

    def __init__(self) -> None:
        self._window = SlidingWindowCounter(settings.OTP_MAX_SENDS_PER_PHONE_PER_15MIN)
        self._window_seconds = 15 * 60
        self._last_send: Dict[str, float] = {}

    def allow(self, phone: str) -> bool:
        key = normalize_msisdn(phone)
        now = time.monotonic()

        last = self._last_send.get(key)
        if last is not None and now - last < settings.OTP_RESEND_COOLDOWN_SECONDS:
            logger.info(f"OTP send blocked by cooldown for {mask_identifier(key)}")
            return False

        # SlidingWindowCounter's window is 60s; emulate 15 min by bucketing the
        # key so each 15-minute period gets its own counter key.
        bucket = int(now // self._window_seconds)
        if not self._window.allow(f"{key}:{bucket}"):
            logger.warning(f"OTP send rate limit hit for {mask_identifier(key)}")
            return False

        self._last_send[key] = now
        return True

    def reset(self) -> None:
        self._window.reset()
        self._last_send.clear()


otp_send_limiter = OtpSendLimiter()
