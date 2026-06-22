"""
NLP engine — orchestrates language detection, intent classification and entity
extraction into a single structured :class:`NLPResult` produced *before* any
response generation.

Exposes a process-wide singleton ``nlp_engine`` whose :meth:`NLPEngine.analyze`
is the canonical entry point consumed by the decision engine and the API.
"""
from __future__ import annotations

import time
import logging
from typing import Optional

from app.models.nlp import (
    NLPResult,
    IntentLabel,
    LanguageLabel,
    LANGUAGE_CONFIRM_THRESHOLD,
    INTENT_LOW_CONFIDENCE_THRESHOLD,
)
from app.core.nlp.language_detect import detect_language
from app.core.nlp.intent_classifier import build_intent_classifier
from app.core.nlp.entity_extraction import EntityExtractor

logger = logging.getLogger(__name__)


def _get_setting(name: str, default=None):
    """Read a setting from app config if present, else fall back to env/default."""
    try:
        from app.core.config import settings

        if hasattr(settings, name):
            return getattr(settings, name)
    except Exception:  # pragma: no cover - config import issues
        pass
    import os

    return os.getenv(name, default)


class NLPEngine:
    """End-to-end NLP analysis pipeline."""

    def __init__(
        self,
        intent_model_path: Optional[str] = None,
        ner_model_path: Optional[str] = None,
        enable_ner: bool = False,
    ):
        self._intent = build_intent_classifier(intent_model_path)
        self._entities = EntityExtractor(ner_model_path=ner_model_path, enable_ner=enable_ner)

    def analyze(self, text: str) -> NLPResult:
        """Analyse a single user message into a structured NLPResult.

        Synchronous by design: classification/extraction are CPU-bound and the
        callers (decision engine) await around the whole pipeline.
        """
        start = time.perf_counter()
        text = text or ""

        # 1) Language detection.
        language, lang_conf, lang_version = detect_language(text)

        # 2) Intent classification.
        intent_pred = self._intent.predict(text)

        # 3) Entity extraction.
        entities = self._entities.extract(text)

        # 4) Control flags per SRS.
        #    - language confidence strictly below 0.70 -> confirm.
        #    - intent confidence at or below 0.60 -> low-confidence fallback.
        requires_confirmation = lang_conf < LANGUAGE_CONFIRM_THRESHOLD
        fallback_triggered = intent_pred.confidence <= INTENT_LOW_CONFIDENCE_THRESHOLD

        total_ms = (time.perf_counter() - start) * 1000.0

        return NLPResult(
            intent=intent_pred.label,
            intent_confidence=intent_pred.confidence,
            language=language,
            language_confidence=lang_conf,
            entities=entities,
            requires_confirmation=requires_confirmation,
            fallback_triggered=fallback_triggered,
            model_version=intent_pred.model_version,
            language_model_version=lang_version,
            inference_time_ms=round(total_ms, 3),
            raw_text=text,
        )


def _build_default_engine() -> NLPEngine:
    intent_path = _get_setting("INTENT_MODEL_PATH")
    ner_path = _get_setting("NER_MODEL_PATH")
    enable_ner = str(_get_setting("ENABLE_ARABIC_NER", "false")).lower() in {"1", "true", "yes"}
    return NLPEngine(
        intent_model_path=intent_path,
        ner_model_path=ner_path,
        enable_ner=enable_ner,
    )


# Process-wide singleton.
nlp_engine = _build_default_engine()
