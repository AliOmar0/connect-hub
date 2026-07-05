"""
Canonical NLP schemas for the Intent / Language / Entity pipeline.

This module is the single source of truth for:
  * The 15 SRS intent labels (closed set, unregistered labels are rejected).
  * The supported language labels (MSA, Palestinian Levantine, English).
  * The 8 required entity types.
  * The structured, confidence-scored NLPResult produced before any
    response generation step.

Design rules
------------
- Labels are modelled as ``str`` Enums so they serialise cleanly to JSON and
  Supabase while still rejecting any value outside the registered set.
- ``NLPResult`` carries the full inference metadata required by the SRS:
  intent label + probability, model version, inference time, detected
  language + confidence, extracted entities, and the two control flags
  (``requires_confirmation`` for low language confidence and
  ``fallback_triggered`` for low intent confidence).
- Sensitive entity values are masked at the schema boundary via
  :meth:`NLPResult.safe_dict` so raw account / card / transaction numbers
  never leave the NLP layer.
"""
from __future__ import annotations

import enum
from typing import List, Optional, Dict, Any

from pydantic import BaseModel, Field, field_validator


# ---------------------------------------------------------------------------
# Decision thresholds (SRS)
# ---------------------------------------------------------------------------
# Language confidence strictly below this value forces a confirmation turn.
LANGUAGE_CONFIRM_THRESHOLD: float = 0.70

# Intent confidence thresholds for omnichannel decision engine
# High confidence (> 0.85): ANSWER with grounded response
# Medium confidence (0.50 - 0.85): CLARIFY - ask user for more information
# Low confidence (< 0.50): ESCALATE to human agent
INTENT_HIGH_CONFIDENCE_THRESHOLD: float = 0.85
INTENT_MID_CONFIDENCE_THRESHOLD: float = 0.50
INTENT_LOW_CONFIDENCE_THRESHOLD: float = 0.60  # Legacy threshold for fallback


# ---------------------------------------------------------------------------
# Intent labels — the 15 canonical SRS labels (closed set)
# ---------------------------------------------------------------------------
class IntentLabel(str, enum.Enum):
    """The 15 canonical intents recognised by the assistant.

    The set is closed: any classifier output outside these members must be
    coerced to :attr:`UNKNOWN` rather than introducing an unregistered label.
    """

    ACCOUNT_INQUIRY = "ACCOUNT_INQUIRY"            # balances, account details
    TRANSFER_LOCAL = "TRANSFER_LOCAL"              # local/domestic transfer
    TRANSFER_INTERNATIONAL = "TRANSFER_INTERNATIONAL"  # cross-border transfer
    CARD_SERVICES = "CARD_SERVICES"                # issue / activate / limits
    CARD_LOST_STOLEN = "CARD_LOST_STOLEN"          # report lost or stolen card
    STATEMENT_REQUEST = "STATEMENT_REQUEST"        # account statement request
    FINANCING_INQUIRY = "FINANCING_INQUIRY"        # murabaha / ijara financing
    EXCHANGE_RATE = "EXCHANGE_RATE"                # currency exchange rates
    BRANCH_ATM_INFO = "BRANCH_ATM_INFO"            # branch / ATM locations, hours
    PRODUCT_INFO = "PRODUCT_INFO"                  # product & service details
    SHARIA_INQUIRY = "SHARIA_INQUIRY"              # Islamic-banking / sharia Q&A
    COMPLAINT = "COMPLAINT"                        # complaints / dissatisfaction
    ESCALATION_REQUEST = "ESCALATION_REQUEST"      # explicit human-agent request
    GENERAL_INFO = "GENERAL_INFO"                  # greetings / general info
    UNKNOWN = "UNKNOWN"                            # out-of-scope / unclassifiable

    @classmethod
    def values(cls) -> List[str]:
        return [m.value for m in cls]

    @classmethod
    def is_registered(cls, label: str) -> bool:
        return label in cls._value2member_map_

    @classmethod
    def coerce(cls, label: Optional[str]) -> "IntentLabel":
        """Map an arbitrary string to a registered label.

        Unregistered or empty values fall back to :attr:`UNKNOWN` so the
        pipeline can never emit a label outside the canonical set.
        """
        if not label:
            return cls.UNKNOWN
        normalized = str(label).strip().upper()
        return cls._value2member_map_.get(normalized, cls.UNKNOWN)  # type: ignore[return-value]


# Intents that always require a human / sandboxed handover regardless of
# confidence. Consumed by the decision engine; defined here to keep the
# risk policy next to the label definitions.
HIGH_RISK_INTENTS = frozenset(
    {
        IntentLabel.COMPLAINT,
        IntentLabel.CARD_LOST_STOLEN,
        IntentLabel.ESCALATION_REQUEST,
    }
)

# Intents that, in this MVP, are executed against a mock/sandbox transaction
# flow rather than a live core-banking system.
SENSITIVE_TRANSACTION_INTENTS = frozenset(
    {
        IntentLabel.TRANSFER_LOCAL,
        IntentLabel.TRANSFER_INTERNATIONAL,
    }
)


# ---------------------------------------------------------------------------
# Language labels
# ---------------------------------------------------------------------------
class LanguageLabel(str, enum.Enum):
    """Supported languages / dialects."""

    MSA = "MSA"                  # Modern Standard Arabic
    LEVANTINE_PS = "LEVANTINE_PS"  # Palestinian Levantine colloquial Arabic
    ENGLISH = "ENGLISH"
    UNKNOWN = "UNKNOWN"

    @classmethod
    def values(cls) -> List[str]:
        return [m.value for m in cls]


# ---------------------------------------------------------------------------
# Entity types — the 8 required entities
# ---------------------------------------------------------------------------
class EntityType(str, enum.Enum):
    """The 8 entity types extracted by the pipeline."""

    AMOUNT = "AMOUNT"                  # monetary amounts (with currency)
    DATE = "DATE"                      # absolute / relative dates
    CARD_TYPE = "CARD_TYPE"            # prepaid / debit / credit, etc.
    BRANCH_NAME = "BRANCH_NAME"        # PIB branch / city
    ACCOUNT_ID = "ACCOUNT_ID"          # account number / IBAN (masked)
    TRANSACTION_ID = "TRANSACTION_ID"  # transaction reference (masked)
    PRODUCT_NAME = "PRODUCT_NAME"      # named bank product
    USER_INTENT = "USER_INTENT"        # short free-form intent phrase

    @classmethod
    def values(cls) -> List[str]:
        return [m.value for m in cls]


# Entity types whose raw values are sensitive and must be masked before
# leaving the NLP layer.
SENSITIVE_ENTITY_TYPES = frozenset(
    {
        EntityType.ACCOUNT_ID,
        EntityType.TRANSACTION_ID,
    }
)


class Entity(BaseModel):
    """A single extracted entity with normalisation and masking metadata."""

    type: EntityType
    # Raw surface form as it appeared in the message. For sensitive types this
    # is kept only for in-process use and is never exposed by ``safe_dict``.
    value: str
    # Canonical / normalised representation (e.g. "1000 USD", "2026-06-22").
    normalized: Optional[str] = None
    # Masked representation for sensitive values (e.g. "****6789").
    masked: Optional[str] = None
    confidence: float = Field(0.0, ge=0.0, le=1.0)
    start: Optional[int] = None
    end: Optional[int] = None
    source: str = "rule"  # "rule" | "ner" | "model"

    @property
    def is_sensitive(self) -> bool:
        return self.type in SENSITIVE_ENTITY_TYPES

    def display_value(self) -> str:
        """Value safe to surface outside the NLP layer."""
        if self.is_sensitive:
            return self.masked or "[REDACTED]"
        return self.normalized or self.value

    def safe_dict(self) -> Dict[str, Any]:
        """Serialised form with sensitive raw/normalised values stripped."""
        data: Dict[str, Any] = {
            "type": self.type.value,
            "value": self.display_value(),
            "confidence": round(self.confidence, 4),
            "source": self.source,
        }
        if self.is_sensitive:
            data["masked"] = self.masked or "[REDACTED]"
        else:
            if self.normalized is not None:
                data["normalized"] = self.normalized
        if self.start is not None:
            data["start"] = self.start
            data["end"] = self.end
        return data


class NLPResult(BaseModel):
    """Structured, confidence-scored NLP analysis of one user message."""

    intent: IntentLabel
    intent_confidence: float = Field(0.0, ge=0.0, le=1.0)

    language: LanguageLabel
    language_confidence: float = Field(0.0, ge=0.0, le=1.0)

    entities: List[Entity] = Field(default_factory=list)

    # Control flags (SRS branches).
    requires_confirmation: bool = False  # language confidence < 0.70
    fallback_triggered: bool = False     # intent confidence <= 0.60

    # Inference metadata.
    model_version: str = "unknown"
    language_model_version: str = "unknown"
    inference_time_ms: float = 0.0
    raw_text: Optional[str] = None

    @field_validator("intent", mode="before")
    @classmethod
    def _coerce_intent(cls, v: Any) -> Any:
        """Never accept an unregistered intent label."""
        if isinstance(v, IntentLabel):
            return v
        return IntentLabel.coerce(v if v is None else str(v))

    @property
    def is_high_risk(self) -> bool:
        return self.intent in HIGH_RISK_INTENTS

    @property
    def is_sensitive_transaction(self) -> bool:
        return self.intent in SENSITIVE_TRANSACTION_INTENTS

    def safe_dict(self) -> Dict[str, Any]:
        """JSON-serialisable result with all sensitive values masked."""
        return {
            "intent": self.intent.value,
            "intent_confidence": round(self.intent_confidence, 4),
            "language": self.language.value,
            "language_confidence": round(self.language_confidence, 4),
            "entities": [e.safe_dict() for e in self.entities],
            "requires_confirmation": self.requires_confirmation,
            "fallback_triggered": self.fallback_triggered,
            "model_version": self.model_version,
            "language_model_version": self.language_model_version,
            "inference_time_ms": round(self.inference_time_ms, 2),
        }
