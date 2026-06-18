import logging
import re
from typing import List, Dict, Any
from app.models.decision import DecisionResult, ActionDecision
from app.models.nlp import NLPResult, IntentLabel
from app.core.nlp_engine import nlp_engine
from app.core.rag import retrieve_with_audit

logger = logging.getLogger(__name__)

class DecisionEngine:
    """
    Authoritative logic engine guaranteeing consistent AI policy behavior across all channels.
    Combines NLP constraints, RAG limits, and sensitive trigger rules.
    """

    EXPLICIT_ESCALATE_KEYWORDS = [
        "موظف", "مساعد بشري", "بدي احكي مع حد", "agent", "human", "representative"
    ]
    
    HIGH_RISK_INTENTS = [
        IntentLabel.COMPLAINT,
        IntentLabel.FRAUD_REPORT
    ]
    
    SENSITIVE_OPERATIONS = [
        IntentLabel.TRANSFER_LOCAL,
        IntentLabel.TRANSFER_INTERNATIONAL,
        IntentLabel.ACCOUNT_OPENING,
        IntentLabel.LOAN_APPLICATION
    ]

    @staticmethod
    async def evaluate(user_message: str, session_id: str = None) -> DecisionResult:
        """Evaluate input and compute definitive policy decision."""
        # 1. NLP Inference
        nlp_res: NLPResult = nlp_engine.analyze(user_message)
        
        scores = {
            "intent_confidence": nlp_res.intent_confidence,
            "language_confidence": nlp_res.language_confidence
        }
        
        # 2. Language Clarification Rule
        if nlp_res.requires_confirmation:
            return DecisionResult(
                decision=ActionDecision.CLARIFY_LANGUAGE,
                localized_message="عذراً، لم أتمكن من تحديد لغتك/لهجتك بوضوح. هل تفضل التحدث باللغة العربية الفصحى، اللهجة الفلسطينية، أم الإنجليزية؟",
                intent=nlp_res.intent,
                entities=nlp_res.entities,
                scores=scores
            )
        
        # 3. Explicit Agent Request
        if any(kw in user_message.lower() for kw in DecisionEngine.EXPLICIT_ESCALATE_KEYWORDS):
            summary = DecisionEngine._generate_summary(user_message, "Explicit agent request")
            return DecisionResult(
                decision=ActionDecision.ESCALATE,
                localized_message="بناءً على طلبك، سيتم تحويلك إلى موظف خدمة العملاء.",
                intent=nlp_res.intent,
                entities=nlp_res.entities,
                escalation_reason="Explicit Agent Request",
                escalation_summary=summary,
                scores=scores
            )
            
        # 4. Low Intent Confidence Rule (<= 0.60 boundary)
        if nlp_res.fallback_triggered: # nlp_res sets this if conf <= 0.60
            summary = DecisionEngine._generate_summary(user_message, "Low intent confidence")
            return DecisionResult(
                decision=ActionDecision.ESCALATE,
                localized_message=f"عذراً، لم أفهم طلبك بوضوح. سيتم تحويلك إلى موظف لمساعدتك بشكل أفضل.",
                intent=nlp_res.intent,
                entities=nlp_res.entities,
                escalation_reason="Low Intent Confidence (<= 0.60)",
                escalation_summary=summary,
                scores=scores
            )

        # 5. High Risk / Requires Escalation Rule
        if nlp_res.intent in DecisionEngine.HIGH_RISK_INTENTS:
            summary = DecisionEngine._generate_summary(user_message, "High risk intent")
            return DecisionResult(
                decision=ActionDecision.ESCALATE,
                localized_message="نظراً لطبيعة طلبك، سأقوم بتحويلك فوراً إلى القسم المختص.",
                intent=nlp_res.intent,
                entities=nlp_res.entities,
                escalation_reason=f"High Risk Intent: {nlp_res.intent.value}",
                escalation_summary=summary,
                scores=scores
            )
            
        # 6. Sensitive Transactions (Mock Sandbox)
        if nlp_res.intent in DecisionEngine.SENSITIVE_OPERATIONS:
            return DecisionResult(
                decision=ActionDecision.MOCK_TRANSACTION,
                localized_message="[Mock Sandbox] هذا الإجراء يتطلب توثيق مالي متقدم. في النسخة النهائية، سيتم تحويلك إلى بوابة الدفع/المصادقة الآمنة.",
                intent=nlp_res.intent,
                entities=nlp_res.entities,
                scores=scores
            )
            
        # 7. RAG Knowledge Retrieval (For RESPOND path)
        chunks, rag_fallback = await retrieve_with_audit(user_message, session_id=session_id)
        if chunks:
            scores["rag_max_score"] = chunks[0].score
            top_documents = [{"id": c.chunk_id, "score": c.score, "content": c.content} for c in chunks]
        else:
            scores["rag_max_score"] = 0.0
            top_documents = []
            
        if rag_fallback:
            # RAG yielded nothing, if it's an inquiry, we escalate
            summary = DecisionEngine._generate_summary(user_message, "No knowledge base answers")
            return DecisionResult(
                decision=ActionDecision.ESCALATE,
                localized_message="عذراً، لا أملك معلومات دقيقة حول هذا الموضوع. سأقوم بتحويلك لموظف.",
                intent=nlp_res.intent,
                entities=nlp_res.entities,
                escalation_reason="No KB documents found (RAG Fallback)",
                escalation_summary=summary,
                top_documents=top_documents,
                scores=scores
            )

        # 8. All safe, proceed to LLM Response
        return DecisionResult(
            decision=ActionDecision.RESPOND,
            localized_message="", # LLM will generate this
            intent=nlp_res.intent,
            entities=nlp_res.entities,
            top_documents=top_documents,
            scores=scores
        )

    @staticmethod
    def _generate_summary(user_message: str, fallback_reason: str) -> str:
        """Generates a <100 char masked summary for escalation."""
        # Clean specific PII via basic regex (NLP engine does it cleanly per entity, but this guarantees safe text)
        masked = re.sub(r'\b\d{6,}\b', '[REDACTED]', user_message)
        summary = f"{fallback_reason}: {masked}"
        if len(summary) > 100:
            summary = summary[:97] + "..."
        return summary

decision_engine = DecisionEngine()
