"""
Decision policy API — the authoritative endpoint every channel calls.

WhatsApp (this backend), web chat, and voice all POST the user message here and
act on the single returned :class:`DecisionResult`, guaranteeing one consistent
answer / clarify / escalate decision for the same input across channels.

Endpoint:
    POST /api/v1/decision/evaluate
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.core.decision_engine import DecisionEngine
from app.core.nlp.engine import nlp_engine

logger = logging.getLogger(__name__)
router = APIRouter()


class DecisionRequest(BaseModel):
    text: str = Field(..., description="Raw user message")
    channel: Optional[str] = Field(None, description="whatsapp | web | voice")
    session_id: Optional[str] = None
    history: Optional[List[Dict[str, str]]] = None

    model_config = {
        "json_schema_extra": {
            "examples": [{"text": "بدي احول 500 شيكل لحساب صاحبي", "channel": "web"}]
        }
    }


@router.post("/decision/evaluate", responses={
    422: {"description": "Validation error (malformed request body)."},
    500: {"description": "Internal error."},
})
async def evaluate(req: DecisionRequest) -> Dict[str, Any]:
    """Return the channel-agnostic policy decision for a message.

    The response is masked (sensitive entity values and the escalation summary
    never contain raw identifiers).
    Includes NLP metadata for observability.
    """
    # Get NLP analysis for structured metadata
    nlp_result = nlp_engine.analyze(req.text)
    nlp_metadata = nlp_result.safe_dict()
    
    result = await DecisionEngine.evaluate(
        req.text,
        history=req.history,
        channel=req.channel,
        session_id=req.session_id,
    )
    
    # Build response with NLP metadata
    response = result.safe_dict()
    response["nlp"] = nlp_metadata
    
    # Add RAG metadata if available
    if result.top_documents:
        response["rag"] = {
            "top_score": result.scores.get("rag_top_score"),
            "documents_count": len(result.top_documents)
        }
    
    return response
