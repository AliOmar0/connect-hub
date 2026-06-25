"""
NLP analysis API.

Exposes the intent / language / entity pipeline as a service so other
components (and ops/debugging) can obtain the structured, confidence-scored
:class:`NLPResult` for a message.

Endpoints:
    POST /nlp/analyze   - analyse a single message
    GET  /nlp/labels    - list canonical intent / language / entity labels

Security: responses use :meth:`NLPResult.safe_dict`, so all sensitive entity
values (account / card / transaction identifiers) are masked before leaving
the service.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.core.nlp.engine import nlp_engine
from app.models.nlp import IntentLabel, LanguageLabel, EntityType

logger = logging.getLogger(__name__)
router = APIRouter()


class AnalyzeRequest(BaseModel):
    text: str = Field(..., description="Raw user message to analyse")


class AnalyzeResponse(BaseModel):
    intent: str
    intent_confidence: float
    language: str
    language_confidence: float
    entities: List[Dict[str, Any]]
    requires_confirmation: bool
    fallback_triggered: bool
    model_version: str
    language_model_version: str
    inference_time_ms: float


@router.post("/nlp/analyze", response_model=AnalyzeResponse)
def analyze(req: AnalyzeRequest) -> AnalyzeResponse:
    """Analyse a message into a masked, confidence-scored NLP result."""
    result = nlp_engine.analyze(req.text)
    return AnalyzeResponse(**result.safe_dict())


@router.get("/nlp/labels")
def labels() -> Dict[str, List[str]]:
    """Return the canonical label sets used by the pipeline."""
    return {
        "intents": IntentLabel.values(),
        "languages": LanguageLabel.values(),
        "entities": EntityType.values(),
    }
