# -*- coding: utf-8 -*-
"""
Deterministic, allowlist-only matching for customer account questions.

Nothing here consults the LLM. The set of things a customer can learn about
their own account over WhatsApp is fixed by ``AccountField``; anything that does
not match falls through to the normal assistant path.

This replaces the ad-hoc keyword lists that used to live inline in
``app/api/v1/webhook.py`` and, critically, replaces ``ai_mentions_otp`` -- model
output must never be able to initiate a real OTP send.
"""

from __future__ import annotations

import re
from enum import Enum
from typing import Optional, Tuple

from app.core.nlp.normalize import (
    normalize_digits,
    normalize_text,
    strip_clitics_text,
)


class AccountField(str, Enum):
    """The only fields that may ever be disclosed to a verified customer.

    These map 1:1 onto the OUT parameters of ``get_bank_account_by_phone`` in
    the bank project (scripts/sql/bank_db_oss_readonly.sql). IBAN is absent on
    purpose: that schema has no IBAN column. IBAN questions are still
    recognised, but by :func:`mentions_unavailable_field` -- see the comment
    there for why they must not simply fall through.
    """

    BALANCE = "balance"
    ACCOUNT_NUMBER = "account_number"
    CURRENCY = "currency"


ALLOWED_FIELDS = frozenset(AccountField)

# Never answer more than this many fields from one message; a broad question
# should escalate rather than dump the whole account.
MAX_FIELDS_PER_REQUEST = 2

# Field lexicon. Matched against normalised text, so alef/ya/ta-marbuta variants
# and Arabic-Indic digits are already folded.
_RAW_FIELD_KEYWORDS: dict[AccountField, tuple[str, ...]] = {
    AccountField.BALANCE: (
        "رصيد",
        "الرصيد",
        "كم معي",
        "كم لدي",
        "balance",
    ),
    AccountField.ACCOUNT_NUMBER: (
        "رقم حساب",
        "رقم الحساب",
        "account number",
        "account no",
    ),
    AccountField.CURRENCY: (
        "عملة حساب",
        "عملة الحساب",
        "account currency",
    ),
}

# A personal marker is REQUIRED. Without it "كيف افتح حساب" (how do I open an
# account) would match ACCOUNT_NUMBER and trigger an OTP.
_RAW_PERSONAL_MARKERS = (
    "حسابي",
    "رصيدي",
    "بطاقتي",
    "حدودي",
    "لدي",
    "عندي",
    "معي",
    "my ",
    "mine",
    "i have",
)

# Generic how/where questions are product enquiries, not account enquiries.
_RAW_GENERAL_INQUIRY_MARKERS = (
    "كيف",
    "اين",
    "وين",
    "طريقة",
    "شروط",
    "ماهي",
    "ما هي",
    "how ",
    "where ",
    "what is",
    "location",
)

# Account attributes customers do ask about but that Bank_db_oss does not hold.
# IBAN is the live example: the bank schema has no IBAN column anywhere.
#
# These get their OWN answer rather than falling through to the assistant. A
# fall-through would hand "ما هو رقم الآيبان الخاص بي؟" to the LLM, which has no
# account data and would either refuse vaguely or invent a plausible PS.. string.
# They must also never reach the OTP path: verifying identity and then having
# nothing to disclose is the worst of both.
_RAW_UNAVAILABLE_FIELD_KEYWORDS = (
    "ايبان",
    "الايبان",
    "رقم دولي",
    "iban",
)

# Actions this assistant cannot perform. These ESCALATE to a human; they must
# never trigger an OTP, because an OTP that gates nothing just trains customers
# to type verification codes into chat.
_RAW_CRITICAL_KEYWORDS = (
    "تحويل اموال",
    "تحويل مبلغ",
    "احول",
    "تغيير كلمة المرور",
    "تغيير الرقم السري",
    "اغلاق حسابي",
    "ايقاف بطاقتي",
    "money transfer",
    "reset password",
    "close my account",
    "block my card",
)


def _canon(text: str) -> str:
    """Normalise once, for every matcher in this module."""
    return strip_clitics_text(normalize_text(text or ""))


def _canon_all(keywords):
    """Canonicalise a lexicon so it matches canonicalised input.

    Written out because it is easy to get wrong: normalize_text folds the
    trailing hamza, so a literal "الغاء" in a keyword list never matches the
    normalised message text (which reads "الغا"). Running the lexicon through
    the same normaliser keeps the two sides in step, so keywords can be written
    in natural Arabic here.
    """
    return tuple(dict.fromkeys(_canon(k) for k in keywords if _canon(k)))


_FIELD_KEYWORDS = {f: _canon_all(ks) for f, ks in _RAW_FIELD_KEYWORDS.items()}
_PERSONAL_MARKERS = _canon_all(_RAW_PERSONAL_MARKERS)
_GENERAL_INQUIRY_MARKERS = _canon_all(_RAW_GENERAL_INQUIRY_MARKERS)
_CRITICAL_KEYWORDS = _canon_all(_RAW_CRITICAL_KEYWORDS)
_UNAVAILABLE_FIELD_KEYWORDS = _canon_all(_RAW_UNAVAILABLE_FIELD_KEYWORDS)
_STRONG_PERSONAL = _canon_all(("حسابي", "رصيدي", "بطاقتي"))
_CANCEL_KEYWORDS = _canon_all(("إلغاء", "الغاء", "cancel", "stop", "توقف"))


def match_account_intent(text: str) -> Tuple[AccountField, ...]:
    """Return the allowlisted fields this message is asking for.

    Returns an empty tuple when the message is not a personal account question,
    which means "hand it to the normal assistant path". Never returns a field
    outside :data:`ALLOWED_FIELDS`.
    """
    canon = _canon(text)
    if not canon:
        return ()

    has_personal = any(m in canon for m in _PERSONAL_MARKERS)
    if not has_personal:
        return ()

    # "كيف اعرف رصيد حسابي" is still a how-to; only a strong possessive wins.
    has_general = any(m in canon for m in _GENERAL_INQUIRY_MARKERS)
    strong_personal = any(m in canon for m in _STRONG_PERSONAL)
    if has_general and not strong_personal:
        return ()

    matched = [
        field for field, keywords in _FIELD_KEYWORDS.items() if any(k in canon for k in keywords)
    ]
    if not matched:
        return ()

    # Stable, declaration order; capped.
    ordered = [f for f in AccountField if f in matched]
    return tuple(ordered[:MAX_FIELDS_PER_REQUEST])


def mentions_unavailable_field(text: str) -> bool:
    """True when the customer asks for an account attribute Bank_db_oss lacks.

    Requires the same personal marker as :func:`match_account_intent`, so
    "ما هو الآيبان؟" as a general product question still goes to the assistant;
    only "ما هو رقم الآيبان الخاص بحسابي؟" takes this branch.
    """
    canon = _canon(text)
    if not canon:
        return False
    if not any(m in canon for m in _PERSONAL_MARKERS):
        return False
    return any(k in canon for k in _UNAVAILABLE_FIELD_KEYWORDS)


def is_critical_request(text: str) -> bool:
    """True when the customer is asking for an action we cannot perform."""
    canon = _canon(text)
    return any(k in canon for k in _CRITICAL_KEYWORDS)


def extract_otp_code(text: str, length: int = 6) -> Optional[str]:
    r"""Pull a plausible verification code out of a customer message.

    Returns the last contiguous run of exactly ``length`` ASCII digits after
    Arabic-Indic normalisation, or None when the message contains no such run.

    Returning None matters: the old code did ``"".join(re.findall(r'\d+', msg))``,
    which (a) missed Arabic-Indic digits entirely -- the digits an Arabic
    keyboard produces -- and (b) welded unrelated runs together, so
    "ارسلت 12 رسالة و 3456" became "123456" and burned a verification attempt.
    """
    if not text:
        return None
    matches = re.findall(rf"(?<!\d)(\d{{{length}}})(?!\d)", normalize_digits(text))
    return matches[-1] if matches else None


def mentions_cancel(text: str) -> bool:
    """True when the customer wants to abandon verification."""
    canon = _canon(text)
    return any(k in canon for k in _CANCEL_KEYWORDS)
