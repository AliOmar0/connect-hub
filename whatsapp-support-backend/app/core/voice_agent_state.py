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
    customer_id: UUID
    phone: str
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
        customer_id: UUID,
        phone: str,
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
