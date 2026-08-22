# -*- coding: utf-8 -*-
"""Deterministic severity floor — the safety net under the LLM classifier.

Mirrors the ``_canon``/``_canon_all`` idiom in ``app/core/bank/intents.py`` so
lexicons can be written in natural Arabic and still match text that has been
through ``normalize_text``/``strip_clitics_text``.

Why this exists alongside the model: fraud and theft are exactly the cases where
a classifier outage, a rate-limit, or a bad completion is least acceptable. These
lexicons run with no network call, so "someone withdrew money from my account"
routes to a human even when every LLM provider is down.

**Raise-only.** :func:`apply_severity_floor` takes the max of the model's
judgement and the lexicon's. The lexicon can escalate a message the model
underrated; it can never calm one the model rated worse. A keyword list is a
blunt instrument and must not be allowed to overrule a model that understood
more context than a substring match could.
"""

from __future__ import annotations

from typing import Optional, Tuple

from app.core.nlp.normalize import normalize_text, strip_clitics_text
from app.core.triage.schema import Severity


def _canon(text: str) -> str:
    return strip_clitics_text(normalize_text(text or ""))


def _canon_all(keywords) -> Tuple[str, ...]:
    """Canonicalise a lexicon so it matches canonicalised input.

    Written out because it is easy to get wrong: normalize_text folds the
    trailing hamza, so a literal "احتيال" style keyword list has to go through
    the same normaliser as the message text or the two sides never meet.
    """
    return tuple(dict.fromkeys(_canon(k) for k in keywords if _canon(k)))


# ---------------------------------------------------------------------------
# CRITICAL — the customer's money or account is actively at risk. Straight to a
# human, no intake form: making a fraud victim answer a five-slot questionnaire
# is the wrong response, and every minute matters.
# ---------------------------------------------------------------------------
_RAW_CRITICAL = (
    # Fraud / theft
    "احتيال",
    "نصب",
    "سرقه",
    "سرقو",
    "سرقوا",
    "انسرقت",
    "مسروقه",
    "بطاقتي مسروقه",
    "بطاقتي انسرقت",
    "حسابي مخترق",
    "اخترقو حسابي",
    "اخترق حسابي",
    "تم اختراق",
    "دخلو على حسابي",
    "حدا دخل على حسابي",
    # Money moved without consent
    "سحب من حسابي",
    "سحبو من حسابي",
    "خصم من حسابي بدون",
    "بدون علمي",
    "بدون اذني",
    "ما عملت هاي العمليه",
    "ما عملت هذه العمليه",
    "عمليه مش الي",
    "عمليه ما بعرفها",
    "تحويل ما عملته",
    "حواله ما عملتها",
    # English
    "fraud",
    "scam",
    "stolen",
    "unauthorized",
    "unauthorised",
    "hacked",
    "without my knowledge",
    "i did not make this transaction",
    "identity theft",
)

# ---------------------------------------------------------------------------
# HIGH — the customer has a concrete loss or a blocked asset. A complaint record
# AND a human, because a reference number alone does not get their card back.
# ---------------------------------------------------------------------------
_RAW_HIGH = (
    # ATM captured the card -- the case that started all of this
    "بلع بطاقتي",
    "بلعت بطاقتي",
    "بلع البطاقه",
    "الصراف بلع",
    "احتجز بطاقتي",
    "سحب بطاقتي الصراف",
    "بطاقتي علقت",
    "علقت بطاقتي",
    "ماكينه اخذت بطاقتي",
    "الصراف اخذ بطاقتي",
    "بطاقتي جوا الصراف",
    "بطاقتي داخل الصراف",
    "بطاقتي عند الصراف",
    "سحبت البطاقه",
    "سحب البطاقه",
    # ATM debited but dispensed nothing
    "ما طلع المبلغ",
    "ما طلعت المصاري",
    "انخصم المبلغ ولم",
    "خصم ولم اتسلم",
    "الصراف ما اعطاني",
    "ما نزلت المصاري",
    # Duplicate / wrong debit
    "انخصم مرتين",
    "خصم مرتين",
    "خصمو مرتين",
    "مبلغ زياده",
    "رسوم ما بعرفها",
    # Transfer that vanished
    "التحويل ما وصل",
    "الحواله ما وصلت",
    "حولت وما وصل",
    "بطاقتي متوقفه",
    "بطاقتي مش شغاله",
    "حسابي متوقف",
    "حسابي مجمد",
    # English
    "atm ate my card",
    "atm took my card",
    "card is stuck",
    "machine kept my card",
    "money was deducted",
    "did not dispense",
    "charged twice",
    "double charged",
    "transfer did not arrive",
    "card is blocked",
    "account is frozen",
)

# ---------------------------------------------------------------------------
# MEDIUM — genuine dissatisfaction, no asset at risk. Worth a tracked complaint
# so it is not just a transcript nobody can filter, but not worth interrupting a
# human mid-shift.
# ---------------------------------------------------------------------------
_RAW_MEDIUM = (
    "غير راضي",
    "مش راضي",
    "خدمه سيئه",
    "الخدمه سيئه",
    "معامله سيئه",
    # Standalone, NOT "موظف غير متعاون": these lexicons are plain substring
    # matches, so a multi-word phrase only fires when the words are adjacent.
    # "الموظف بالفرع كان غير متعاون" has four words between them and would miss.
    "غير متعاون",
    "مش متعاون",
    "ما تعاون",
    "اسلوب سيء",
    "تعامل سيء",
    "انتظرت كتير",
    "انتظرت طويلا",
    "طولت كتير",
    "تاخير",
    "متضايق",
    "زعلان",
    "مستاء",
    "اشتكي",
    "شكوى",
    "شكوي",
    "poor service",
    "bad service",
    "rude",
    "unhelpful",
    "waited too long",
    "disappointed",
    "not satisfied",
    "complaint",
)

# An ATM word AND a capture word in the same message, in any order and at any
# distance. This is what catches the phrasings the literal lists cannot:
# "عند مشكلة في بطاقة تم سحبها صراف الي" -- passive, no possessive, verb and
# machine separated by three words.
#
# Both halves are required, so it does not fire on "كم حد السحب من الصراف؟"
# (an ATM word, but "حد السحب" is a limit question, not a capture) -- see
# _CAPTURE_EXCLUSIONS below.
_RAW_ATM_WORDS = ("صراف", "الصراف", "ماكينه", "ماكينة", "atm", "cash machine", "cashpoint")
_RAW_CAPTURE_WORDS = (
    "بلع", "بلعت", "احتجز", "احتجزت", "اخذت", "اخذ", "سحبها", "سحبت", "سحب",
    "علقت", "عالقه", "ما رجعت", "ما ردت", "لم ترجع", "لم تخرج", "جوا", "داخل",
    "ate", "took", "kept", "stuck", "retained", "swallowed", "did not return",
)
# A card word is required too, so "الصراف بلع المبلغ" is not read as a captured
# card (that is the dispense-failure case, which the literal list already
# covers at HIGH anyway).
_RAW_CARD_WORDS = ("بطاقه", "بطاقتي", "البطاقه", "كرت", "card")

# Limit / fee questions mention an ATM and the word "سحب" without anything being
# captured. Without this, "شو حد السحب اليومي من الصراف؟" would be filed as a
# HIGH-severity complaint and handed to a human.
_RAW_CAPTURE_EXCLUSIONS = (
    "حد السحب", "حدود السحب", "رسوم السحب", "عموله السحب", "كم اسحب",
    "withdrawal limit", "withdrawal fee",
)

_ATM_WORDS = _canon_all(_RAW_ATM_WORDS)
_CAPTURE_WORDS = _canon_all(_RAW_CAPTURE_WORDS)
_CARD_WORDS = _canon_all(_RAW_CARD_WORDS)
_CAPTURE_EXCLUSIONS = _canon_all(_RAW_CAPTURE_EXCLUSIONS)


def mentions_card_capture(text: str) -> bool:
    """True when an ATM appears to have retained the customer's card.

    Co-occurrence, not adjacency: the three signals (an ATM, a card, a capture
    verb) may be anywhere in the message and in any order.
    """
    canon = _canon(text)
    if not canon:
        return False
    if any(x in canon for x in _CAPTURE_EXCLUSIONS):
        return False
    return (
        any(w in canon for w in _ATM_WORDS)
        and any(w in canon for w in _CARD_WORDS)
        and any(w in canon for w in _CAPTURE_WORDS)
    )


_CRITICAL = _canon_all(_RAW_CRITICAL)
_HIGH = _canon_all(_RAW_HIGH)
_MEDIUM = _canon_all(_RAW_MEDIUM)


# Category hints for the messages the lexicons catch, so a rules-only result
# (LLM down) can still pre-fill the intake form's first slot instead of asking.
# Keys are the six in app/core/complaints/intents.py -- no new taxonomy.
_CATEGORY_HINTS = (
    (
        "cards",
        _canon_all(
            (
                "بطاقه",
                "بطاقتي",
                "صراف",
                "ماكينه",
                "atm",
                "card",
            )
        ),
    ),
    (
        "accounts",
        _canon_all(
            (
                "حسابي",
                "رسوم",
                "عموله",
                "خصم",
                "تحويل",
                "حواله",
                "account",
                "fees",
                "transfer",
                "charged",
            )
        ),
    ),
    (
        "digital",
        _canon_all(
            (
                "تطبيق",
                "موبايل",
                "اونلاين",
                "app",
                "online",
            )
        ),
    ),
    (
        "service",
        _canon_all(
            (
                "موظف",
                "فرع",
                "انتظار",
                "معامله",
                "خدمه",
                "service",
                "branch",
                "staff",
            )
        ),
    ),
)


def lexicon_severity(text: str) -> Severity:
    """Severity implied by keywords alone. Never raises, never calls out."""
    canon = _canon(text)
    if not canon:
        return Severity.LOW
    if any(k in canon for k in _CRITICAL):
        return Severity.CRITICAL
    if any(k in canon for k in _HIGH):
        return Severity.HIGH
    # Checked after the literal lists so an explicitly worded fraud report still
    # wins, and before MEDIUM so a captured card is never filed as ordinary
    # dissatisfaction.
    if mentions_card_capture(text):
        return Severity.HIGH
    if any(k in canon for k in _MEDIUM):
        return Severity.MEDIUM
    return Severity.LOW


def lexicon_category(text: str) -> Optional[str]:
    """Best-guess complaint category from keywords, or None.

    Ordered most-specific first: "الصراف بلع بطاقتي" mentions a card and should
    land on `cards`, not on `service` because the word "فرع" appeared too.
    """
    canon = _canon(text)
    if not canon:
        return None
    for key, keywords in _CATEGORY_HINTS:
        if any(k in canon for k in keywords):
            return key
    return None


def apply_severity_floor(text: str, severity: Severity) -> Severity:
    """Raise ``severity`` to the lexicon's floor when the lexicon reads worse.

    This is the whole point of the safety net: the model may return LOW for a
    message it misread, or may not have run at all, but "حدا سحب من حسابي بدون
    علمي" is CRITICAL either way.
    """
    return max(severity, lexicon_severity(text))
