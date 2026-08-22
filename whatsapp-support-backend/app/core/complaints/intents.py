# -*- coding: utf-8 -*-
"""
Deterministic matching for complaint filing.

Mirrors ``app/core/bank/intents.py`` -- same ``_canon``/``_canon_all`` idiom, so
lexicons can be written in natural Arabic and still match text that has been
through ``normalize_text``/``strip_clitics_text``.

Nothing here consults the LLM. Whether a message opens a complaint, and which
category the customer picked, are both decided by these functions; the model's
job is only to explain what is happening (system_prompt.py section 12).
"""

from __future__ import annotations

import re
from typing import Optional, Tuple

from app.core.nlp.normalize import normalize_digits, normalize_text, strip_clitics_text


def _canon(text: str) -> str:
    return strip_clitics_text(normalize_text(text or ""))


def _canon_all(keywords):
    return tuple(dict.fromkeys(_canon(k) for k in keywords if _canon(k)))


# The customer must be asking to FILE a complaint, not merely expressing
# annoyance. "الخدمة سيئة" alone is dissatisfaction and belongs to the assistant
# (which empathises, and escalates if needed); "بدي اقدم شكوى" is a filing.
#
# This is narrower than IntentLabel.COMPLAINT in app/core/nlp/intent_classifier.py
# on purpose: that classifier drives escalation, and a false positive there costs
# a handover. A false positive here drops the customer into a four-step form they
# did not ask for.
_RAW_COMPLAINT_KEYWORDS = (
    "شكوى",
    "شكوي",
    "اشتكي",
    "بدي اشتكي",
    "اريد تقديم شكوى",
    "تقديم شكوى",
    "رفع شكوى",
    "اقدم شكوى",
    "complaint",
    "file a complaint",
    "submit a complaint",
    "i want to complain",
)

# A customer chasing an EXISTING complaint is not filing a new one. Without this
# "وين وصلت شكواي" would open a second ticket for the same problem.
_RAW_FOLLOWUP_MARKERS = (
    "شكواي",
    "شكوتي",
    "متابعة شكوى",
    "وضع شكوى",
    "حالة شكوى",
    "رقم الشكوى",
    "my complaint",
    "complaint status",
)

_COMPLAINT_KEYWORDS = _canon_all(_RAW_COMPLAINT_KEYWORDS)
_FOLLOWUP_MARKERS = _canon_all(_RAW_FOLLOWUP_MARKERS)
_CONFIRM_KEYWORDS = _canon_all(
    ("نعم", "اكيد", "تمام", "موافق", "أرسل", "ارسل", "ok", "yes", "confirm", "send")
)

# Only the optional location slot honours these. A customer who genuinely
# cannot remember which ATM ate their card must not be stuck in the form --
# staff can still work the complaint without a location. Deliberately NOT
# accepted for description or identity, which the record cannot do without.
_SKIP_KEYWORDS = _canon_all(
    ("تخطي", "تخطى", "لا اعرف", "ما بعرف", "مش متذكر", "لا اتذكر", "skip", "dont know",
     "don't know", "not sure", "no idea")
)


# Fixed set, in display order. The customer picks by number; free text is matched
# against the keywords as a fallback so "مشكلة ببطاقتي" lands on CARDS without
# them having to count.
COMPLAINT_CATEGORIES: Tuple[Tuple[str, str, Tuple[str, ...]], ...] = (
    ("service", "الخدمة والمعاملة", ("خدمة", "معاملة", "موظف", "فرع", "انتظار", "service")),
    ("cards", "البطاقات والصراف الآلي", ("بطاقة", "بطاقتي", "صراف", "atm", "card")),
    ("accounts", "الحسابات والرسوم", ("حساب", "رسوم", "عمولة", "خصم", "fees", "account")),
    ("financing", "التمويل والأقساط", ("تمويل", "قرض", "قسط", "اقساط", "loan", "financing")),
    ("digital", "التطبيق والخدمات الرقمية", ("تطبيق", "موبايل", "اونلاين", "app", "online")),
    ("other", "أخرى", ()),
)

_CATEGORY_KEYWORDS = {key: _canon_all(words) for key, _, words in COMPLAINT_CATEGORIES}

CATEGORY_LABELS = {key: label for key, label, _ in COMPLAINT_CATEGORIES}

# Shortest description we will accept. Below this the customer has typed
# something like "مشكلة" and the record would be useless to whoever picks it up.
MIN_DESCRIPTION_LENGTH = 10


def match_complaint_intent(text: str) -> bool:
    """True when the customer is asking to file a NEW complaint."""
    canon = _canon(text)
    if not canon:
        return False
    if any(m in canon for m in _FOLLOWUP_MARKERS):
        return False
    return any(k in canon for k in _COMPLAINT_KEYWORDS)


def mentions_complaint_followup(text: str) -> bool:
    """True when the customer is chasing a complaint they already filed.

    Handled by escalation, not by opening another record.
    """
    canon = _canon(text)
    return bool(canon) and any(m in canon for m in _FOLLOWUP_MARKERS)


def match_category(text: str) -> Optional[str]:
    """Resolve a category reply to a category key, or None to re-prompt.

    Accepts the displayed number first (including Arabic-Indic digits), then
    falls back to the per-category keywords.
    """
    if not text:
        return None

    digits = re.findall(r"(?<!\d)(\d{1,2})(?!\d)", normalize_digits(text))
    if digits:
        index = int(digits[0])
        if 1 <= index <= len(COMPLAINT_CATEGORIES):
            return COMPLAINT_CATEGORIES[index - 1][0]

    canon = _canon(text)
    if not canon:
        return None
    for key, keywords in _CATEGORY_KEYWORDS.items():
        if keywords and any(k in canon for k in keywords):
            return key
    return None


def is_valid_description(text: str) -> bool:
    return len((text or "").strip()) >= MIN_DESCRIPTION_LENGTH


def mentions_confirm(text: str) -> bool:
    canon = _canon(text)
    return bool(canon) and any(k in canon for k in _CONFIRM_KEYWORDS)


def mentions_skip(text: str) -> bool:
    """True when the customer is declining to answer an OPTIONAL slot."""
    canon = _canon(text)
    return bool(canon) and any(k in canon for k in _SKIP_KEYWORDS)


def describes_an_incident(text: str) -> bool:
    """True when ``text`` says what went wrong, not merely that they want to file.

    "بدي أقدم شكوى" is a REQUEST to open a complaint; it contains no problem.
    Storing it as the description produces a record a staff member cannot act
    on, and skips the question that would have got the real story. "الصراف بلع
    بطاقتي" is the opposite: it IS the description, and asking the customer to
    retype it reads as though nobody listened.

    The test is what survives after the filing phrases are removed.
    """
    canon = _canon(text)
    if not canon:
        return False
    for keyword in _COMPLAINT_KEYWORDS:
        canon = canon.replace(keyword, " ")
    # Verbs that only ever attach to the filing request itself.
    for filler in ("بدي", "اريد", "ابغى", "ممكن", "لو سمحت", "من فضلك",
                   "i want", "i would like", "please", "to file", "to submit"):
        canon = canon.replace(_canon(filler), " ")
    return len(" ".join(canon.split())) >= MIN_DESCRIPTION_LENGTH
