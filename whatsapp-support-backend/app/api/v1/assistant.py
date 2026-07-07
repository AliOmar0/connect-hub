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
from app.core.nlp.engine import nlp_engine
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

# "Soft" escalation reasons: the decision engine escalates when the intent
# classifier was merely unsure (Low Intent Confidence) or the vector KB had no
# matching document (No KB documents found). On a LIVE VOICE call that makes the
# assistant hand the caller to an agent on the very first turn, which feels
# broken. For voice we instead answer normally — the LLM already carries the
# bank system prompt + JSON knowledge base, so it can respond in a grounded way.
# HARD escalations (explicit agent request, high-risk intents, prompt-injection
# BLOCK, sensitive-transaction MOCK) are unaffected and still take over/mock.
_SOFT_ESCALATION_REASONS = ("Low Intent Confidence", "No KB documents found")


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
    nlp: Optional[Dict[str, Any]] = Field(None, description="Structured NLP analysis: intent, language, entities, confidence scores")
    rag: Optional[Dict[str, Any]] = Field(None, description="RAG retrieval metadata: top_score, documents_count")

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
                    "nlp": {
                        "intent": "ESCALATION_REQUEST",
                        "intent_confidence": 0.97,
                        "language": "LEVANTINE_PS",
                        "language_confidence": 0.95,
                        "entities": [],
                        "requires_confirmation": False,
                        "fallback_triggered": False
                    },
                    "rag": {
                        "top_score": None,
                        "documents_count": 0
                    }
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
    
    # Get NLP analysis first for structured metadata
    nlp_result = nlp_engine.analyze(req.text)
    nlp_metadata = nlp_result.safe_dict()
    
    result = await DecisionEngine.evaluate(
        req.text, history=history, channel=req.channel, session_id=req.session_id
    )

    is_voice = (req.channel or "").lower() == "voice"
    decision = result.decision

    # Voice: degrade a "soft" escalation (unsure intent / empty vector KB) into a
    # normal grounded answer instead of dumping the caller to a human on turn one.
    downgraded = False
    if (
        is_voice
        and decision == ActionDecision.ESCALATE
        and result.escalation_reason
        and result.escalation_reason.startswith(_SOFT_ESCALATION_REASONS)
    ):
        decision = ActionDecision.RESPOND
        downgraded = True
        logger.info(
            "Voice: softened escalation (%s) into a direct answer",
            result.escalation_reason,
        )

    if decision == ActionDecision.RESPOND:
        extra = _VOICE_STYLE if is_voice else None
        max_words = 60 if extra else 150
        raw = await LLMService.get_ai_response(req.text, history, extra_system=extra)
        message = validate_response(raw, max_words=max_words)
    else:
        message = result.localized_message

    escalate = decision in _ESCALATING
    
    # Build RAG metadata from decision result
    rag_metadata = None
    if result.top_documents:
        rag_metadata = {
            "top_score": result.scores.get("rag_top_score"),
            "documents_count": len(result.top_documents)
        }
    
    return ReplyResponse(
        decision=decision.value,
        message=message,
        escalate=escalate,
        intent=result.intent.value if result.intent else None,
        language=result.language.value if result.language else None,
        # Keep the internal reason for observability, but flag that voice chose
        # to answer instead of escalating.
        escalation_reason=(
            None if downgraded else result.escalation_reason
        ),
        escalation_summary=(
            None if downgraded else result.escalation_summary
        ),
        scores=result.scores,
        nlp=nlp_metadata,
        rag=rag_metadata,
    )
