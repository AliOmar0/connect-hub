"""
In-process state for a complaint being collected turn by turn.

Mirrors ``IdentityVerificationStore`` in ``app/core/verification_state.py``:
TTL-evicted on read, purged on the same 60s tick from ``app/main.py``, and
per-process (with multiple replicas the customer must stay on the instance that
started their complaint -- the same tradeoff the OTP flow already makes).

The slot order is fixed and lives here, not in the webhook, so the branch in
``process_ai_response`` stays a dispatch rather than a state machine.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Dict, Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

# Slots in the order they are asked. CONFIRM is a slot too: the customer sees a
# summary and has one clear chance to abandon before anything is written.
SLOT_CATEGORY = "category"
SLOT_DESCRIPTION = "description"
# Where it happened. Asked only for the categories where a location is what makes
# the report actionable -- staff cannot chase a captured card without knowing
# which machine ate it. Skipped entirely for the rest, and skipped whenever
# triage already read a branch or city out of the customer's own message.
SLOT_LOCATION = "location"
SLOT_CONTACT = "contact"
SLOT_CONFIRM = "confirm"

# There is no identity slot. Who filed the complaint is no longer something
# the customer types: the form now ends in the same national-ID + date-of-birth
# + OTP gate an account question goes through (app/api/v1/webhook.py's
# _advance_or_submit), and the name on the record comes from Bank_db_oss's own
# owner_name. Asking for a name here would only invite a second, unverified
# answer that contradicts it.
SLOT_ORDER = (
    SLOT_CATEGORY,
    SLOT_DESCRIPTION,
    SLOT_LOCATION,
    SLOT_CONTACT,
    SLOT_CONFIRM,
)

# Categories where SLOT_LOCATION earns its turn. Asking "which branch?" about a
# mobile-app bug just adds a round trip.
LOCATION_RELEVANT_CATEGORIES = frozenset({"cards", "service"})

# How many unparseable replies to a single slot before we give up and hand over
# to a human. Without it a customer who keeps typing something we cannot parse
# is stuck in the form forever.
MAX_SLOT_RETRIES = 3


@dataclass
class PendingComplaint:
    slot: str
    expires_at: float
    retries: int = 0
    category: Optional[str] = None
    description: Optional[str] = None
    preferred_contact: Optional[str] = None

    # Filled by app/core/triage before the first question is asked, so the form
    # only asks for what the customer has not already said.
    location: Optional[str] = None
    atm_identifier: Optional[str] = None
    incident_at_text: Optional[str] = None
    severity: str = "medium"
    intent: Optional[str] = None
    ai_summary: Optional[str] = None
    # True when triage (not the customer answering a prompt) supplied the slots.
    prefilled: bool = False

    def is_filled(self, slot: str) -> bool:
        """Whether ``slot`` already has an answer worth keeping."""
        if slot == SLOT_CATEGORY:
            return bool(self.category)
        if slot == SLOT_DESCRIPTION:
            return bool(self.description)
        if slot == SLOT_LOCATION:
            # Two ways to be done: we know the location, or it does not apply.
            if self.category not in LOCATION_RELEVANT_CATEGORIES:
                return True
            return bool(self.location or self.atm_identifier)
        if slot == SLOT_CONTACT:
            return bool(self.preferred_contact)
        return False  # SLOT_CONFIRM is always asked: nothing is written unseen.

    def first_unfilled_slot(self) -> str:
        """The first slot still needing an answer, in SLOT_ORDER."""
        for slot in SLOT_ORDER:
            if not self.is_filled(slot):
                return slot
        return SLOT_CONFIRM


@dataclass
class ComplaintStore:
    _pending: Dict[str, PendingComplaint] = field(default_factory=dict)

    def start(self, session_id: str, *, ttl: Optional[float] = None) -> PendingComplaint:
        ttl = settings.COMPLAINT_SESSION_TTL_SECONDS if ttl is None else ttl
        entry = PendingComplaint(slot=SLOT_CATEGORY, expires_at=time.monotonic() + ttl)
        self._pending[session_id] = entry
        return entry

    def get(self, session_id: str) -> Optional[PendingComplaint]:
        """Return live state, evicting it first if the TTL has passed."""
        entry = self._pending.get(session_id)
        if entry is None:
            return None
        if time.monotonic() >= entry.expires_at:
            self._pending.pop(session_id, None)
            logger.info(f"Complaint collection state expired for session {session_id}")
            return None
        return entry

    def start_prefilled(
        self,
        session_id: str,
        *,
        category: Optional[str] = None,
        description: Optional[str] = None,
        location: Optional[str] = None,
        atm_identifier: Optional[str] = None,
        incident_at_text: Optional[str] = None,
        severity: str = "medium",
        intent: Optional[str] = None,
        ai_summary: Optional[str] = None,
        ttl: Optional[float] = None,
    ) -> PendingComplaint:
        """Open a complaint that already knows what the customer told us.

        The old flow always started at SLOT_CATEGORY, so someone who wrote
        "الصراف بلع بطاقتي في فرع رام الله" was still asked to pick a category
        from a numbered menu and then describe the problem they had just
        described. This starts at the first slot triage could NOT fill.
        """
        ttl = settings.COMPLAINT_SESSION_TTL_SECONDS if ttl is None else ttl
        entry = PendingComplaint(
            slot=SLOT_CATEGORY,
            expires_at=time.monotonic() + ttl,
            category=category,
            description=description,
            location=location,
            atm_identifier=atm_identifier,
            incident_at_text=incident_at_text,
            severity=severity,
            intent=intent,
            ai_summary=ai_summary,
            prefilled=True,
        )
        entry.slot = entry.first_unfilled_slot()
        self._pending[session_id] = entry
        return entry

    def advance(self, session_id: str) -> Optional[PendingComplaint]:
        """Move to the next slot still needing an answer, and reset retries.

        Skips slots triage already filled, so the customer is never asked for
        something they have said. Also refreshes the TTL: the deadline is meant
        to catch an abandoned form, not to time out someone still answering.
        """
        entry = self._pending.get(session_id)
        if entry is None:
            return None
        index = SLOT_ORDER.index(entry.slot)
        for slot in SLOT_ORDER[index + 1 :]:
            if not entry.is_filled(slot):
                entry.slot = slot
                break
        else:
            entry.slot = SLOT_CONFIRM
        entry.retries = 0
        entry.expires_at = time.monotonic() + settings.COMPLAINT_SESSION_TTL_SECONDS
        return entry

    def record_retry(self, session_id: str) -> int:
        """Count an unparseable reply to the current slot; returns the new count."""
        entry = self._pending.get(session_id)
        if entry is None:
            return 0
        entry.retries += 1
        return entry.retries

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


complaint_store = ComplaintStore()
