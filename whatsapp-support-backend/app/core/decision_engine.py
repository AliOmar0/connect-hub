"""
Central Decision & Escalation Policy.

One function — :meth:`DecisionEngine.evaluate` — is the single authority that
turns a raw user message into exactly one :class:`ActionDecision`, so WhatsApp,
web chat, and voice all receive the **same** answer / clarify / escalate
decision for the same input.

It combines, in a fixed precedence:
  1. LLM safety (prompt-injection) -> BLOCK
  2. Language confidence (< 0.70) -> CLARIFY_LANGUAGE
  3. Explicit human-agent request -> ESCALATE
  4. Low intent confidence (< 0.50) -> ESCALATE
  5. Medium intent confidence (0.50 - 0.85) -> CLARIFY_INTENT
  6. High-risk / requires-escalation intent -> ESCALATE
  7. Sensitive transaction intent -> MOCK_TRANSACTION (never live)
  8. RAG grounding: no relevant KB document -> ESCALATE
  9. Otherwise -> RESPOND (grounded answer)

Confidence-based decision tiers:
  - High (> 0.85): ANSWER with grounded response
  - Medium (0.50 - 0.85): CLARIFY - request more information
  - Low (< 0.50): ESCALATE to human agent

The returned object is fully typed and every escalation carries a concise,
PII-masked summary (<= 100 characters).
"""
from __future__ import annotations

import logging
import re
from typing import List, Optional

from app.core.nlp.engine import nlp_engine
from app.core.rag import retrieve_with_audit
from app.core.prompts import DecisionMessages
from app.core.pii import PII_PATTERNS
from app.models.nlp import (
    NLPResult,
    IntentLabel,
    HIGH_RISK_INTENTS,
    SENSITIVE_TRANSACTION_INTENTS,
    INTENT_HIGH_CONFIDENCE_THRESHOLD,
    INTENT_MID_CONFIDENCE_THRESHOLD,
    INTENT_LOW_CONFIDENCE_THRESHOLD,
    LANGUAGE_CONFIRM_THRESHOLD,
)
from app.models.decision import ActionDecision, DecisionResult

logger = logging.getLogger(__name__)

ESCALATION_SUMMARY_MAX_LEN = 100

# Explicit "talk to a human" markers (normalised, Arabic + English).
_EXPLICIT_AGENT_PATTERNS = [
    "احكي مع حد", "احكي مع موظف", "بدي موظف", "اريد موظف", "اريد التحدث مع موظف",
    "تحويلي لموظف", "حولني لموظف", "ممثل خدمه", "خدمه العملاء البشريه",
    "اريد التحدث مع شخص", "احكي مع شخص",
    "talk to a human", "talk to a person", "talk to an agent", "speak to someone",
    "speak to a human", "real person", "human agent", "live agent",
    "customer representative", "talk to agent",
]


def _normalize(text: str) -> str:
    """Lightweight normalisation for keyword matching (Arabic + lower Latin)."""
    from app.core.nlp.normalize import normalize_text, strip_clitics_text

    norm = normalize_text(text or "")
    return norm + " " + strip_clitics_text(norm)


class DecisionEngine:
    """Channel-agnostic decision & escalation policy."""

    @staticmethod
    def _is_explicit_agent_request(text: str) -> bool:
        search = _normalize(text)
        return any(p in search for p in _EXPLICIT_AGENT_PATTERNS)

    @staticmethod
    def _is_injection(text: str) -> bool:
        try:
            from app.core.llm import LLMService

            return LLMService.detect_injection(text or "")
        except Exception:  # pragma: no cover - defensive
            return False

    @staticmethod
    def _mask(text: str) -> str:
        """Replace every PII match with a single ``[REDACTED]`` token."""
        masked = text or ""
        for pattern in PII_PATTERNS.values():
            masked = pattern.sub("[REDACTED]", masked)
        return masked

    @staticmethod
    def _generate_summary(message: str, reason: str) -> str:
        """Concise, PII-masked escalation summary, never exceeding 100 chars."""
        masked = DecisionEngine._mask(message or "")
        masked = re.sub(r"\s+", " ", masked).strip()
        summary = f"{reason}: {masked}" if masked else reason
        if len(summary) > ESCALATION_SUMMARY_MAX_LEN:
            summary = summary[: ESCALATION_SUMMARY_MAX_LEN - 1].rstrip() + "…"
        return summary

    @staticmethod
    def _scores(nlp: NLPResult, rag_top: Optional[float]) -> dict:
        return {
            "intent_confidence": round(nlp.intent_confidence, 4),
            "language_confidence": round(nlp.language_confidence, 4),
            "rag_top_score": round(rag_top, 4) if rag_top is not None else None,
        }

    @staticmethod
    def _docs_to_dicts(chunks: List) -> List[dict]:
        docs = []
        for c in chunks:
            chunk_id = getattr(c, "chunk_id", getattr(c, "id", None))
            docs.append({
                "chunk_id": chunk_id,
                "score": getattr(c, "score", None),
                "content": getattr(c, "content", ""),
            })
        return docs

    @classmethod
    async def evaluate(
        cls,
        text: str,
        history: Optional[list] = None,
        channel: Optional[str] = None,
        session_id: Optional[str] = None,
    ) -> DecisionResult:
        """Evaluate a single message into one channel-agnostic decision.
        
        Decision flow:
        1. BLOCK - Prompt injection detected
        2. CLARIFY_LANGUAGE - Language confidence < 0.70
        3. ESCALATE - Explicit human agent request
        4. ESCALATE - Intent confidence < 0.50 (low)
        5. CLARIFY_INTENT - Intent confidence 0.50 - 0.85 (medium)
        6. ESCALATE - High-risk intent
        7. MOCK_TRANSACTION - Sensitive transaction intent
        8. ESCALATE - No relevant RAG documents
        9. RESPOND - High confidence with grounded answer
        """
        nlp: NLPResult = nlp_engine.analyze(text)
        entities = [e.safe_dict() for e in nlp.entities]
        base_scores = cls._scores(nlp, None)

        def _result(decision: ActionDecision, message: str,
                    reason: Optional[str] = None,
                    top_documents: Optional[List[dict]] = None,
                    rag_top: Optional[float] = None) -> DecisionResult:
            summary = cls._generate_summary(text, reason) if reason else None
            return DecisionResult(
                decision=decision,
                localized_message=message,
                intent=nlp.intent,
                language=nlp.language,
                entities=entities,
                top_documents=top_documents or [],
                scores=cls._scores(nlp, rag_top),
                requires_confirmation=nlp.requires_confirmation,
                fallback_triggered=nlp.fallback_triggered,
                escalation_reason=reason,
                escalation_summary=summary,
            )

        # 1) LLM safety — block prompt-injection attempts outright.
        if cls._is_injection(text):
            logger.warning("DecisionEngine: blocked potential prompt injection")
            return _result(ActionDecision.BLOCK, DecisionMessages.blocked(nlp.language))

        # 2) Language confidence — cannot act if we don't know the language.
        if nlp.requires_confirmation or nlp.language_confidence < LANGUAGE_CONFIRM_THRESHOLD:
            return _result(
                ActionDecision.CLARIFY_LANGUAGE,
                DecisionMessages.clarify_language(nlp.language),
            )

        # 3) Explicit human-agent request.
        if cls._is_explicit_agent_request(text):
            return _result(
                ActionDecision.ESCALATE,
                DecisionMessages.escalate(nlp.language),
                reason="Explicit Agent Request",
            )

        # 4) Low intent confidence (< 0.50) — ESCALATE
        if nlp.intent_confidence < INTENT_MID_CONFIDENCE_THRESHOLD:
            return _result(
                ActionDecision.ESCALATE,
                DecisionMessages.escalate(nlp.language),
                reason=f"Low Intent Confidence ({nlp.intent_confidence:.2%})",
            )

        # 5) Medium intent confidence (0.50 - 0.85) — CLARIFY
        if nlp.intent_confidence < INTENT_HIGH_CONFIDENCE_THRESHOLD:
            return _result(
                ActionDecision.CLARIFY_INTENT,
                DecisionMessages.clarify_intent(nlp.language, nlp.intent),
                reason=f"Medium Intent Confidence ({nlp.intent_confidence:.2%})",
            )

        # 6) High-risk / requires-escalation intents.
        if nlp.intent in HIGH_RISK_INTENTS:
            return _result(
                ActionDecision.ESCALATE,
                DecisionMessages.escalate(nlp.language),
                reason=f"High Risk Intent ({nlp.intent.value})",
            )

        # 7) Sensitive transactions are mocked in a sandbox — never executed live.
        if nlp.intent in SENSITIVE_TRANSACTION_INTENTS:
            return _result(
                ActionDecision.MOCK_TRANSACTION,
                DecisionMessages.mock_transaction(nlp.language),
                reason=f"Sensitive Operation ({nlp.intent.value})",
            )

        # 8) RAG grounding — never answer a KB question without a relevant doc.
        chunks, fallback = retrieve_with_audit(text, session_id=session_id)
        if fallback or not chunks:
            return _result(
                ActionDecision.ESCALATE,
                DecisionMessages.escalate(nlp.language),
                reason="No KB documents found",
            )

        # 9) High confidence with grounded answer — RESPOND
        top_documents = cls._docs_to_dicts(chunks)
        rag_top = top_documents[0]["score"] if top_documents else None
        return _result(
            ActionDecision.RESPOND,
            "",  # the grounded answer is generated downstream by the LLM
            top_documents=top_documents,
            rag_top=rag_top,
        )
