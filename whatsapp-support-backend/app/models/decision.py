"""
Decision / escalation policy schemas.

The decision engine collapses every channel's input into one of a small set of
:class:`ActionDecision` outcomes and returns a typed :class:`DecisionResult`
carrying the user-facing localized message plus all the evidence behind the
decision (intent, entities, retrieved documents, scores, escalation reason).
"""
from __future__ import annotations

import enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from app.models.nlp import IntentLabel, LanguageLabel


class ActionDecision(str, enum.Enum):
    """The single, channel-agnostic set of outcomes."""

    RESPOND = "RESPOND"                    # High confidence (> 0.85): answer from the knowledge base
    CLARIFY_LANGUAGE = "CLARIFY_LANGUAGE"  # Language confidence < 0.70: ask user to confirm language
    CLARIFY_INTENT = "CLARIFY_INTENT"       # Medium confidence (0.50-0.85): ask user for clarification
    MOCK_TRANSACTION = "MOCK_TRANSACTION"  # Sensitive operation -> sandbox, never live
    ESCALATE = "ESCALATE"                  # Low confidence (< 0.50) or high-risk: hand over to human agent
    BLOCK = "BLOCK"                        # Unsafe input (e.g. prompt injection)

    @classmethod
    def values(cls) -> List[str]:
        return [m.value for m in cls]


class DecisionResult(BaseModel):
    """Typed decision returned to every channel for a single input."""

    decision: ActionDecision
    localized_message: str = ""

    # Evidence / context.
    intent: Optional[IntentLabel] = None
    language: Optional[LanguageLabel] = None
    entities: List[Dict[str, Any]] = Field(default_factory=list)
    top_documents: List[Dict[str, Any]] = Field(default_factory=list)
    scores: Dict[str, Optional[float]] = Field(default_factory=dict)

    # Control flags + escalation metadata.
    requires_confirmation: bool = False
    fallback_triggered: bool = False
    escalation_reason: Optional[str] = None
    escalation_summary: Optional[str] = None

    def safe_dict(self) -> Dict[str, Any]:
        data = self.model_dump()
        data["decision"] = self.decision.value
        if self.intent is not None:
            data["intent"] = self.intent.value
        if self.language is not None:
            data["language"] = self.language.value
        return data
