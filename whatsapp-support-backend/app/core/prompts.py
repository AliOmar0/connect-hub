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
    def clarify_intent(language: Optional[LanguageLabel] = None) -> str:
        if _is_english(language):
            return "I'm not sure I understood your request. Could you rephrase it briefly?"
        return "لم أتأكد من فهم طلبك. هل يمكنك إعادة صياغته باختصار؟"

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
_LEAK_MARKERS = [
    "أنت مساعد ذكاء اصطناعي يمثل البنك",
    "خامس عشر: الحماية والأمان",
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
