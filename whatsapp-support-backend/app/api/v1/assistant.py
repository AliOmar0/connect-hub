"""
Authoritative assistant-reply endpoint.

This is the single entry point every channel (WhatsApp, web chat, voice) calls
to obtain BOTH the central policy decision and the ready-to-send message for a
user turn. It guarantees one consistent decision and one canonical, validated
response across channels, with all bank facts/policy living only here in
FastAPI.

Flow:
    1. DecisionEngine.evaluate -> one ActionDecision.
    2. RESPOND  -> grounded answer via the authoritative LLM, then validated.
       anything else -> the canonical localized policy message.

Endpoint:
    POST /api/v1/assistant/reply
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.core.decision_engine import DecisionEngine
from app.core.llm import LLMService
from app.core.prompts import validate_response
from app.models.decision import ActionDecision

logger = logging.getLogger(__name__)
router = APIRouter()

# Voice channel brevity / dialect instruction appended to the authoritative
# prompt (the policy itself is unchanged — only delivery style differs).
_VOICE_STYLE = (
    "ملاحظة هامة: أنت تتحدث في اتصال صوتي مباشر. اجعل ردك قصيراً جداً (جملة إلى "
    "ثلاث جمل) بلهجة فلسطينية محكية ودودة، بدون قوائم نقطية أو روابط طويلة."
)

# Decisions that mean a human must take over.
_ESCALATING = {ActionDecision.ESCALATE}


class ReplyRequest(BaseModel):
    text: str = Field(..., description="Raw user message")
    channel: Optional[str] = Field("whatsapp", description="whatsapp | web | voice")
    session_id: Optional[str] = None
    history: Optional[List[Dict[str, str]]] = None

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "text": "بدي احكي مع موظف",
                    "channel": "whatsapp",
                    "session_id": "b1d3...",
                    "history": [],
                }
            ]
        }
    }


class ReplyResponse(BaseModel):
    decision: str = Field(..., description="One of RESPOND, CLARIFY_LANGUAGE, CLARIFY_INTENT, MOCK_TRANSACTION, ESCALATE, BLOCK")
    message: str = Field(..., description="Ready-to-send, validated, PII-masked text")
    escalate: bool = Field(..., description="True when a human agent must take over")
    intent: Optional[str] = None
    language: Optional[str] = None
    escalation_reason: Optional[str] = Field(None, description="Internal reason (not user-facing)")
    escalation_summary: Optional[str] = Field(None, description="<=100 chars, PII-masked")
    scores: Dict[str, Optional[float]] = {}

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "decision": "ESCALATE",
                    "message": "سأقوم بتحويلك الآن إلى أحد زملائي في خدمة العملاء...",
                    "escalate": True,
                    "intent": "ESCALATION_REQUEST",
                    "language": "LEVANTINE_PS",
                    "escalation_reason": "Explicit Agent Request",
                    "escalation_summary": "Explicit Agent Request: بدي احكي مع موظف",
                    "scores": {"intent_confidence": 0.97, "language_confidence": 0.95, "rag_top_score": None},
                }
            ]
        }
    }


_RESPONSES = {
    422: {"description": "Validation error (malformed request body)."},
    500: {"description": "Internal error (model/backend failure)."},
}


@router.post("/assistant/reply", response_model=ReplyResponse, responses=_RESPONSES)
async def reply(req: ReplyRequest) -> ReplyResponse:
    history = req.history or []
    result = await DecisionEngine.evaluate(
        req.text, history=history, channel=req.channel, session_id=req.session_id
    )

    if result.decision == ActionDecision.RESPOND:
        extra = _VOICE_STYLE if (req.channel or "").lower() == "voice" else None
        max_words = 60 if extra else 150
        raw = await LLMService.get_ai_response(req.text, history, extra_system=extra)
        message = validate_response(raw, max_words=max_words)
    else:
        message = result.localized_message

    return ReplyResponse(
        decision=result.decision.value,
        message=message,
        escalate=result.decision in _ESCALATING,
        intent=result.intent.value if result.intent else None,
        language=result.language.value if result.language else None,
        escalation_reason=result.escalation_reason,
        escalation_summary=result.escalation_summary,
        scores=result.scores,
    )
