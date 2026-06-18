from enum import Enum
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from app.models.nlp import NLPEntity, IntentLabel

class ActionDecision(str, Enum):
    RESPOND = "RESPOND"
    CLARIFY_LANGUAGE = "CLARIFY_LANGUAGE"
    ESCALATE = "ESCALATE"
    MOCK_TRANSACTION = "MOCK_TRANSACTION"
    WAIT_FOR_OTP = "WAIT_FOR_OTP"

class DecisionResult(BaseModel):
    decision: ActionDecision
    localized_message: str
    intent: IntentLabel
    entities: List[NLPEntity]
    escalation_reason: Optional[str] = None
    escalation_summary: Optional[str] = None # Masked, max 100 chars
    top_documents: List[Dict[str, Any]] = []
    scores: Dict[str, float] = {}
