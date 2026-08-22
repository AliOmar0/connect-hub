# -*- coding: utf-8 -*-
"""Typed result of understanding one customer message.

The WhatsApp path used to route on ~15 hardcoded keywords, so a customer who
wrote "الصراف بلع بطاقتي في فرع رام الله" matched nothing at all: not critical,
not an account question, not a complaint. It fell through to the free-text LLM,
and when that provider hiccuped they got an apology. This is the structured
understanding that branch was missing.

Two rules hold this module together:

1. **No new taxonomy.** ``intent`` reuses the closed 15-label set in
   ``app/models/nlp.py`` and ``complaint_category`` reuses the six keys in
   ``app/core/complaints/intents.py``. A third vocabulary would have to be kept
   in sync with both, and would drift.
2. **Advisory, never authoritative.** A ``TriageResult`` decides routing and
   pre-fills form slots. It never grants access, never unlocks account data, and
   never initiates a verification -- those stay keyword-gated upstream.
"""

from __future__ import annotations

import enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator

from app.core.complaints.intents import CATEGORY_LABELS
from app.models.nlp import IntentLabel


class Severity(str, enum.Enum):
    """How much harm the customer is exposed to right now.

    Ordered, and the order is load-bearing: ``rules.py`` takes the max of the
    model's judgement and the lexicon's, so a hard keyword hit can only ever
    raise severity, never lower it.
    """

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

    @property
    def rank(self) -> int:
        return _SEVERITY_RANK[self]

    # All four are spelled out on purpose. Severity subclasses `str`, so without
    # these it would inherit str's ALPHABETICAL comparisons -- and "low" > "high"
    # is True as a string. max(Severity.LOW, Severity.HIGH) would then return LOW
    # and quietly downgrade a fraud report. functools.total_ordering is no help
    # here either: it only fills in operators the class does not already inherit.
    def __lt__(self, other: object) -> bool:
        if not isinstance(other, Severity):
            return NotImplemented
        return self.rank < other.rank

    def __le__(self, other: object) -> bool:
        if not isinstance(other, Severity):
            return NotImplemented
        return self.rank <= other.rank

    def __gt__(self, other: object) -> bool:
        if not isinstance(other, Severity):
            return NotImplemented
        return self.rank > other.rank

    def __ge__(self, other: object) -> bool:
        if not isinstance(other, Severity):
            return NotImplemented
        return self.rank >= other.rank

    @classmethod
    def coerce(cls, value: Optional[str]) -> "Severity":
        """Map arbitrary model output to a registered member.

        Anything unrecognised becomes MEDIUM, not LOW: an unparseable severity
        means we do not know how bad this is, and the safe reading of "unknown"
        is "worth a human looking", not "ignore it".
        """
        if isinstance(value, cls):
            return value
        if not value:
            return cls.MEDIUM
        return _SEVERITY_BY_VALUE.get(str(value).strip().lower(), cls.MEDIUM)


_SEVERITY_RANK: Dict[Severity, int] = {
    Severity.LOW: 0,
    Severity.MEDIUM: 1,
    Severity.HIGH: 2,
    Severity.CRITICAL: 3,
}

_SEVERITY_BY_VALUE = {m.value: m for m in Severity}


class TriageResult(BaseModel):
    """What the customer needs, and how urgently."""

    intent: IntentLabel = IntentLabel.UNKNOWN
    severity: Severity = Severity.LOW

    # Routing flags.
    is_complaint: bool = False
    needs_human: bool = False

    # One of the six existing complaint category keys, or None.
    complaint_category: Optional[str] = None

    # Details worth extracting so the intake form does not ask for what the
    # customer already told us. All optional -- an absent field means "ask".
    description: Optional[str] = None
    full_name: Optional[str] = None
    location: Optional[str] = None
    atm_identifier: Optional[str] = None
    incident_at_text: Optional[str] = None
    amount: Optional[str] = None

    # PII-masked, <= SUMMARY_MAX_LEN chars. Shown to staff, never to the customer.
    summary: str = ""

    confidence: float = 0.0

    # Provenance, for debugging a bad route after the fact.
    source: str = "llm"

    SUMMARY_MAX_LEN: int = Field(default=200, exclude=True)

    @field_validator("complaint_category")
    @classmethod
    def _known_category(cls, v: Optional[str]) -> Optional[str]:
        """Drop a category the intake form cannot actually render."""
        if v is None:
            return None
        key = str(v).strip().lower()
        return key if key in CATEGORY_LABELS else None

    @field_validator("confidence")
    @classmethod
    def _clamp_confidence(cls, v: float) -> float:
        try:
            return max(0.0, min(1.0, float(v)))
        except (TypeError, ValueError):
            return 0.0

    def log_data(self) -> Dict[str, Any]:
        """Fields safe to put in a structured log line (no free customer text)."""
        return {
            "event": "triage",
            "intent": self.intent.value,
            "severity": self.severity.value,
            "is_complaint": self.is_complaint,
            "needs_human": self.needs_human,
            "complaint_category": self.complaint_category,
            "confidence": round(self.confidence, 3),
            "source": self.source,
        }

    def missing_complaint_fields(self) -> List[str]:
        """Which intake slots triage could NOT fill."""
        missing = []
        if not self.complaint_category:
            missing.append("category")
        if not self.description:
            missing.append("description")
        if not self.full_name:
            missing.append("identity")
        return missing
