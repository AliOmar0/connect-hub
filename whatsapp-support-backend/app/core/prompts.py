"""
Canonical prompt templates and response validators.

This module is the single, authoritative source of the user-facing policy
messages and the output validator. Keeping them here (in the FastAPI layer)
prevents bank facts / policy copy from being duplicated across channels
(WhatsApp, web chat, voice) or in the Node tier — every channel renders the
same localized text for the same decision.
"""
from __future__ import annotations

import re
from typing import Optional

from app.models.nlp import LanguageLabel
from app.core.pii import PII_PATTERNS


# ---------------------------------------------------------------------------
# Localized decision messages
# ---------------------------------------------------------------------------
def _is_english(language: Optional[LanguageLabel]) -> bool:
    return language == LanguageLabel.ENGLISH


class DecisionMessages:
    """Canonical, localized user-facing messages keyed by decision."""

    @staticmethod
    def clarify_language(language: Optional[LanguageLabel] = None) -> str:
        # Bilingual on purpose: we are unsure of the language, so we ask in both.
        return (
            "عذراً، لم أتمكن من تحديد لغتك بدقة. هل تفضل المتابعة بالعربية أم بالإنجليزية؟\n"
            "Sorry, I couldn't reliably detect your language. Would you like to continue in Arabic or English?"
        )

    @staticmethod
    def clarify_intent(language: Optional[LanguageLabel] = None, intent=None) -> str:
        """Request clarification when intent confidence is medium (0.50 - 0.85)."""
        intent_name = intent.value if intent else "unknown"
        if _is_english(language):
            return (
                f"I think you're asking about {intent_name.replace('_', ' ').lower()}, "
                "but I'm not entirely sure. Could you provide more details or rephrase your question?"
            )
        intent_arabic = {
            "ACCOUNT_INQUIRY": "استفسار عن الحساب",
            "TRANSFER_LOCAL": "تحويل محلي",
            "TRANSFER_INTERNATIONAL": "تحويل دولي",
            "CARD_SERVICES": "خدمات البطاقات",
            "CARD_LOST_STOLEN": "بطاقة مفقودة أو مسروقة",
            "STATEMENT_REQUEST": "طلب كشف حساب",
            "FINANCING_INQUIRY": "استفسار عن التمويل",
            "EXCHANGE_RATE": "سعر الصرف",
            "BRANCH_ATM_INFO": "معلومات الفرع أو الصراف",
            "PRODUCT_INFO": "معلومات المنتجات",
            "SHARIA_INQUIRY": "استفسار شرعي",
            "COMPLAINT": "شكوى",
            "ESCALATION_REQUEST": "طلب تحويل لموظف",
            "GENERAL_INFO": "معلومات عامة",
        }
        ar_intent = intent_arabic.get(intent_name, intent_name)
        return (
            f"أظن أنك تسأل عن \"{ar_intent}\"، لكنني غير متأكد تماماً. "
            "هل يمكنك تقديم مزيد من التفاصيل أو إعادة صياغة سؤالك؟"
        )

    @staticmethod
    def escalate(language: Optional[LanguageLabel] = None) -> str:
        if _is_english(language):
            return ("I'm connecting you with one of our customer service "
                    "specialists who will continue from here. Thank you for your patience.")
        return ("سأقوم بتحويلك الآن إلى أحد زملائي في خدمة العملاء لمتابعة طلبك "
                "مباشرة. شكراً لصبرك.")

    @staticmethod
    def mock_transaction(language: Optional[LanguageLabel] = None) -> str:
        # Must clearly state this is a sandbox and not a real transaction.
        if _is_english(language):
            return ("For your security, financial transactions run only in a safe "
                    "test environment (Mock Sandbox); no real operation is executed. "
                    "I'm transferring you to a specialist to complete it securely.")
        return ("لأمان بياناتك، تُنفَّذ العمليات المالية في بيئة اختبار آمنة فقط "
                "(Mock Sandbox) ولا يتم تنفيذ أي حركة فعلية. سأحوّلك الآن لموظف "
                "مختص لإتمامها بأمان.")

    @staticmethod
    def blocked(language: Optional[LanguageLabel] = None) -> str:
        if _is_english(language):
            return ("I can only assist with the Palestinian Islamic Bank's official "
                    "banking services. How can I help you with that?")
        return ("لا يمكنني تنفيذ هذا الطلب، ومهمتي محصورة في تقديم معلومات عن الخدمات "
                "المصرفية الإسلامية الرسمية للبنك. كيف يمكنني مساعدتك؟")


# ---------------------------------------------------------------------------
# Response validator
# ---------------------------------------------------------------------------
# Phrases that would indicate a system-prompt / policy leak.
# NOTE: these must be phrases that actually appear in the LIVE SYSTEM_PROMPT.
# The previous list was stale -- all three strings had been edited out of the
# prompt long ago, so this check silently matched nothing. Verified against
# app/core/system_prompt.py; there is a test that re-checks the linkage.
_LEAK_MARKERS = [
    # section 1 heading + persona line
    "أنت إيمان، المساعدة الذكية للبنك الإسلامي الفلسطيني",
    # section 14 heading (anti-manipulation rules)
    "مقاومة التلاعب واستخراج التعليمات",
    # section 18 heading (internal pre-reply checklist)
    "فحص داخلي قبل كل رد",
    # section 2 heading (priority ordering)
    "ترتيب الأولويات",
    "system prompt",
]


def validate_response(text: str, max_words: int = 150) -> str:
    """Validate and sanitise an outbound AI response.

    - Strips disallowed formatting (** and ") per the WhatsApp formatting rules.
    - Redacts any PII that leaked into the output.
    - Replaces the whole response if it appears to leak the system prompt.
    - Enforces a maximum word count.
    """
    if not text:
        return ""

    for marker in _LEAK_MARKERS:
        if marker in text:
            return DecisionMessages.blocked()

    cleaned = text.replace("**", "").replace('"', "")

    # Redact any leaked PII (defence in depth).
    for pii_type, pattern in PII_PATTERNS.items():
        cleaned = pattern.sub(f"[{pii_type.upper()}]", cleaned)

    words = cleaned.split()
    if len(words) > max_words:
        cleaned = " ".join(words[:max_words]) + " …"

    return cleaned.strip()
