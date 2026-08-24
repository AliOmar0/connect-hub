"""In-process state linking an ElevenLabs `conversation_id` to our DB records.

Mirrors the pattern in app/core/verification_state.py (module-level store, TTL
eviction, purge_expired()). This does NOT reimplement OTP send/verify -- that
stays in verification_store/otp_client, keyed by the same session_id string.
This store only tracks the conversation<->session/customer linkage voice needs
that WhatsApp doesn't, because WhatsApp already has a stable phone-keyed
session per inbound webhook call.

Durability note: the post-call webhook does NOT depend on this store surviving
(it resolves the session via sessions.external_conversation_id in the DB, see
scripts/sql/sessions_add_external_conversation_id.sql). This store only needs
to live for the duration of one active call, on whichever process handled it.

Identity lifecycle: `start()` now seeds an entry with no customer/phone at
all -- the DB session (and this store's entry) is created as soon as the call
begins, BEFORE identity is known, so a caller who never gets past
verify-identity still has a loggable, escalatable session
(see app/api/v1/voice_agent.py's verify_identity). `mark_identity_verified`
fills in customer_id/phone once the (national_id, date_of_birth) claim
resolves to a phone-on-file in Bank_db_oss; `mark_verified` then flips
otp_verified once that phone's OTP is confirmed. Three-stage progression,
one entry.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Dict, Optional
from uuid import UUID

_DEFAULT_TTL_SECONDS = 30 * 60  # generous: a voice call can run long


@dataclass
class VoiceConversation:
    db_session_id: UUID
    customer_id: Optional[UUID] = None
    phone: str = ""
    identity_verified: bool = False
    verified_full_name: str = ""
    verified_national_id: str = ""
    identity_attempts: int = 0
    otp_verified: bool = False
    expires_at: float = 0.0


@dataclass
class VoiceConversationStore:
    _conversations: Dict[str, VoiceConversation] = field(default_factory=dict)

    def start(
        self,
        conversation_id: str,
        *,
        db_session_id: UUID,
        customer_id: Optional[UUID] = None,
        phone: str = "",
        ttl: Optional[float] = None,
    ) -> VoiceConversation:
        ttl = _DEFAULT_TTL_SECONDS if ttl is None else ttl
        entry = VoiceConversation(
            db_session_id=db_session_id,
            customer_id=customer_id,
            phone=phone,
            expires_at=time.monotonic() + ttl,
        )
        self._conversations[conversation_id] = entry
        return entry

    def get(self, conversation_id: str) -> Optional[VoiceConversation]:
        entry = self._conversations.get(conversation_id)
        if entry is None:
            return None
        if time.monotonic() >= entry.expires_at:
            self._conversations.pop(conversation_id, None)
            return None
        return entry

    def record_identity_failure(self, conversation_id: str) -> int:
        """Increment the identity-attempt counter; returns the new count (0 if absent).

        Mirrors IdentityVerificationStore.record_failure in
        app/core/verification_state.py -- kept as a separate counter from
        otp attempts (verification_store handles those once OTP starts),
        since the two steps have independent budgets
        (IDENTITY_MAX_ATTEMPTS vs OTP_MAX_ATTEMPTS).
        """
        entry = self._conversations.get(conversation_id)
        if entry is None:
            return 0
        entry.identity_attempts += 1
        return entry.identity_attempts

    def mark_identity_verified(
        self,
        conversation_id: str,
        *,
        customer_id: UUID,
        phone: str,
        national_id: str,
    ) -> None:
        """Attach the resolved customer + phone-on-file once identity passes.

        national_id is the CLEANED value that actually matched -- stored so
        /tools/file-complaint can use it without re-asking, and so it can never
        be fed an identity that never passed this gate. The caller's NAME is
        deliberately absent here: it is not a verification factor any more
        (see scripts/sql/bank_db_oss_identity_lookup_v3.sql), and the name that
        ends up on a complaint comes from the bank's own record via
        record_owner_name below -- never from anything the caller stated.
        """
        entry = self._conversations.get(conversation_id)
        if entry is not None:
            entry.customer_id = customer_id
            entry.phone = phone
            entry.identity_verified = True
            entry.verified_national_id = national_id

    def record_owner_name(self, conversation_id: str, owner_name: str) -> None:
        """Store the account holder's name as Bank_db_oss has it.

        Filled from the owner_name /tools/send-otp already fetches to prove the
        account exists -- it used to be discarded. This is what a filed
        complaint is recorded under, so the record carries the authoritative
        name rather than whatever was spoken and transcribed.
        """
        entry = self._conversations.get(conversation_id)
        if entry is not None and owner_name:
            entry.verified_full_name = owner_name

    def mark_verified(self, conversation_id: str) -> None:
        entry = self._conversations.get(conversation_id)
        if entry is not None:
            entry.otp_verified = True

    def clear(self, conversation_id: str) -> None:
        self._conversations.pop(conversation_id, None)

    def purge_expired(self) -> int:
        now = time.monotonic()
        stale = [k for k, v in self._conversations.items() if now >= v.expires_at]
        for k in stale:
            self._conversations.pop(k, None)
        return len(stale)


voice_conversation_store = VoiceConversationStore()
