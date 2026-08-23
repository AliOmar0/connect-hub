"""
In-process state for pending satisfaction ratings.

`sessions.satisfaction_score` has existed since the first migration, with a
working setter in `crud.update_session_satisfaction` that nothing ever called.
The closing message asked "هل تم حل مشكلتك بشكل كامل؟" and then threw the answer
away: by the time the customer replied their session was already `completed`, so
the webhook opened a brand-new one and the reply became the first message of an
unrelated conversation. The Satisfaction column was empty for every session ever
recorded, and Analytics reported an average of 0.0.

This remembers, for a short window after a session closes, which session that
customer was just rating -- so a bare "4" can be attributed to the right row
before any new session is created.

Keyed by phone, NOT by session id: the rating arrives after the session has
ended, and the phone number is the only thing the inbound message carries that
still points back to it.

Still per-process, like verification_state and complaints.flow: with multiple
replicas the rating has to land on the instance that closed the session. Same
tradeoff those already make, and the cost of missing it is one blank rating.
"""
from __future__ import annotations

import logging
import re
import time
from dataclasses import dataclass, field
from typing import Dict, Optional
from uuid import UUID

from app.core.config import settings

logger = logging.getLogger(__name__)

# A rating is the whole message and nothing else. "4" counts; "4 حسابات مغلقة"
# is a new question that happens to start with a digit, and swallowing it as a
# rating would cost the customer a reply. Arabic-Indic digits included because
# customers type on Arabic keyboards.
_RATING_RE = re.compile(r"^[\s\u200f\u200e]*([1-5\u0661-\u0665])[\s.\u200f\u200e]*$")
_ARABIC_INDIC = {"\u0661": 1, "\u0662": 2, "\u0663": 3, "\u0664": 4, "\u0665": 5}


def parse_rating(message: str) -> Optional[int]:
    """The 1-5 score in `message`, or None if it is not purely a rating."""
    if not message:
        return None
    match = _RATING_RE.match(message)
    if not match:
        return None
    digit = match.group(1)
    return _ARABIC_INDIC.get(digit) or int(digit)


@dataclass
class PendingRating:
    session_id: UUID
    expires_at: float  # time.monotonic() deadline


@dataclass
class CsatStore:
    _pending: Dict[str, PendingRating] = field(default_factory=dict)

    def start(
        self, phone: str, session_id: UUID, *, ttl: Optional[float] = None
    ) -> PendingRating:
        ttl = settings.CSAT_WINDOW_SECONDS if ttl is None else ttl
        entry = PendingRating(session_id=session_id, expires_at=time.monotonic() + ttl)
        self._pending[phone] = entry
        return entry

    def get(self, phone: str) -> Optional[PendingRating]:
        """Return live state, evicting it first if the window has passed."""
        entry = self._pending.get(phone)
        if entry is None:
            return None
        if time.monotonic() >= entry.expires_at:
            self._pending.pop(phone, None)
            return None
        return entry

    def clear(self, phone: str) -> None:
        self._pending.pop(phone, None)

    def purge_expired(self) -> int:
        now = time.monotonic()
        stale = [k for k, v in self._pending.items() if now >= v.expires_at]
        for k in stale:
            self._pending.pop(k, None)
        return len(stale)

    def __len__(self) -> int:
        return len(self._pending)


csat_store = CsatStore()
