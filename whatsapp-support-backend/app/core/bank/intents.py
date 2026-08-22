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

# Palestinian national ID: 9 digits. Used to pull the ID out of a free-text
# identity claim the same way extract_otp_code pulls out a 6-digit code.
NATIONAL_ID_LENGTH = 9

# Stripped off the start of an identity claim before whatever's left is taken
# as the name, so "الاسم محمد احمد" and "محمد احمد" both yield "محمد احمد".
# Order matters: longer/more specific phrases first, so a prefix match doesn't
# eat part of a shorter one it also contains.
_RAW_IDENTITY_LABELS = (
    "رقم الهوية الوطنية",
    "رقم الهوية",
    "الهوية الوطنية",
    "الهوية",
    "اسمي",
    "الاسم الكامل",
    "الاسم",
    "اسم",
    "name",
    "id number",
    "national id",
)


class AccountField(str, Enum):
    """The only fields that may ever be disclosed to a verified customer.

    The scalar members map onto the OUT parameters of
    ``get_bank_account_profile_by_phone``; the three SECTION_FIELDS members each
    map onto their own RPC. Both live in the bank project -- see
    scripts/sql/bank_db_oss_readonly.sql and
    scripts/sql/bank_db_oss_account_details.sql.

    IBAN is absent on purpose: that schema has no IBAN column. IBAN questions
    are still recognised, but by :func:`mentions_unavailable_field` -- see the
    comment there for why they must not simply fall through.
    """

    BALANCE = "balance"
    AVAILABLE_BALANCE = "available_balance"
    ACCOUNT_NUMBER = "account_number"
    CURRENCY = "currency"
    ACCOUNT_TYPE = "account_type"
    ACCOUNT_STATUS = "account_status"
    TRANSACTIONS = "transactions"
    CARDS = "cards"
    LOANS = "loans"


ALLOWED_FIELDS = frozenset(AccountField)

# Fields whose value is a LIST of rows rather than a scalar. They come from
# their own RPC (one call each), and their renderers emit a multi-line block --
# so ``field.value in account`` still gates them, but the value is a list.
SECTION_FIELDS = frozenset({AccountField.TRANSACTIONS, AccountField.CARDS, AccountField.LOANS})

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
    AccountField.AVAILABLE_BALANCE: (
        "الرصيد المتاح",
        "رصيد متاح",
        "available balance",
    ),
    AccountField.ACCOUNT_TYPE: (
        "نوع حسابي",
        "نوع الحساب",
        "account type",
    ),
    AccountField.ACCOUNT_STATUS: (
        "حالة حسابي",
        "حالة الحساب",
        "حسابي مفعل",
        "account status",
    ),
    AccountField.TRANSACTIONS: (
        "اخر حركات",
        "اخر الحركات",
        "حركاتي",
        "الحركات الاخيرة",
        "اخر العمليات",
        "كشف حساب",
        "كشف الحساب",
        "transactions",
        "statement",
    ),
    AccountField.CARDS: (
        "بطاقاتي",
        "بطاقتي",
        "my cards",
        "my card",
    ),
    AccountField.LOANS: (
        "تمويلي",
        "تمويلاتي",
        "قرضي",
        "اقساطي",
        "my loan",
        "my financing",
    ),
}

# A personal marker is REQUIRED. Without it "كيف افتح حساب" (how do I open an
# account) would match ACCOUNT_NUMBER and trigger an OTP.
_RAW_PERSONAL_MARKERS = (
    "حسابي",
    "رصيدي",
    "بطاقتي",
    "بطاقاتي",
    "تمويلي",
    "تمويلاتي",
    "قرضي",
    "اقساطي",
    "حركاتي",
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

# Personal limits (card limit, transfer limit, ...). system_prompt.py section
# 11.1 routes these to a human: Bank_db_oss holds no limit column, so there is
# nothing to disclose after an OTP.
#
# This list exists because the CARDS and TRANSACTIONS lexicons above are broad
# enough to swallow a limit question -- "ما هي حدود بطاقتي" contains "بطاقتي".
# Before those keywords existed the message matched no field and fell through
# to the assistant, which escalated; suppressing here preserves exactly that.
_RAW_LIMIT_MARKERS = (
    "حدود",
    "حد السحب",
    "حد التحويل",
    "سقف",
    "limit",
)

# Actions this assistant cannot perform. These ESCALATE to a human; they must
# never trigger an OTP, because an OTP that gates nothing just trains customers
# to type verification codes into chat.
#
# "ايقاف بطاقتي" and "كشف حساب رسمي" overlap the CARDS / TRANSACTIONS lexicons
# on purpose: is_critical_request is evaluated BEFORE match_account_intent in
# app/api/v1/webhook.py, so these keep escalating instead of being answered.
_RAW_CRITICAL_KEYWORDS = (
    "تحويل اموال",
    "تحويل مبلغ",
    "احول",
    "تغيير كلمة المرور",
    "تغيير الرقم السري",
    "اغلاق حسابي",
    "ايقاف بطاقتي",
    "كشف حساب رسمي",
    "كشف الحساب الرسمي",
    "money transfer",
    "reset password",
    "close my account",
    "block my card",
    "official statement",
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
_LIMIT_MARKERS = _canon_all(_RAW_LIMIT_MARKERS)
_STRONG_PERSONAL = _canon_all(("حسابي", "رصيدي", "بطاقتي", "بطاقاتي", "تمويلي", "قرضي"))
_CANCEL_KEYWORDS = _canon_all(("إلغاء", "الغاء", "cancel", "stop", "توقف"))

# NOT run through _canon() like the other lexicons: _canon() strips clitics
# and folds letters aggressively (built for matching short keywords against
# normalised text), which would mangle a label before it's stripped back out
# of a name. Matched case-sensitively-normalised-lowercase only, in
# _strip_identity_labels below.
_IDENTITY_LABELS = tuple(dict.fromkeys(_RAW_IDENTITY_LABELS))


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

    # Personal limits go to a human (system_prompt.py 11.1) -- there is no limit
    # column to disclose, so an OTP here would gate nothing. Checked before the
    # field lexicon because "حدود بطاقتي" would otherwise match CARDS.
    if any(m in canon for m in _LIMIT_MARKERS):
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


def _strip_identity_labels(text: str) -> str:
    """Remove leading/embedded field labels ("الاسم:", "name:", ...) and
    stray punctuation, leaving just the name text."""
    stripped = text
    for label in _IDENTITY_LABELS:
        stripped = re.sub(re.escape(label), " ", stripped, flags=re.IGNORECASE)
    # Labels are often followed by ":" or "："; digits are pulled out by the
    # caller before this runs, so any leftover punctuation is just noise.
    stripped = re.sub(r"[:：,،\-.]+", " ", stripped)
    return re.sub(r"\s+", " ", stripped).strip()


def extract_identity_claim(text: str) -> Optional[Tuple[str, str]]:
    """Pull a (full_name, national_id) pair out of a free-text reply.

    Mirrors extract_otp_code: looks for exactly NATIONAL_ID_LENGTH digits (not
    part of a longer run) after Arabic-Indic normalisation, and treats
    whatever text is left -- once known field labels and punctuation are
    stripped -- as the name. Returns None when no plausible ID run is found,
    or when nothing recognisable as a name is left; the caller re-prompts
    rather than guessing, and does NOT count that as a failed attempt (only a
    resolved-but-not-found identity should).
    """
    if not text:
        return None
    digits_text = normalize_digits(text)
    # "123-456-789" / "123.456.789" are still one ID -- collapse a '-' or '.'
    # only when BOTH neighbours are digits, so hyphens/periods elsewhere in the
    # message (including inside the name) are left alone.
    digits_text = re.sub(r"(?<=\d)[-.](?=\d)", "", digits_text)
    matches = re.findall(rf"(?<!\d)(\d{{{NATIONAL_ID_LENGTH}}})(?!\d)", digits_text)
    if not matches:
        return None
    national_id = matches[-1]

    # Drop every run of NATIONAL_ID_LENGTH+ digits (not just the matched one)
    # so a longer adjacent run -- which failed the exact-length match above --
    # doesn't get left behind in the "name".
    name_source = re.sub(rf"\d{{{NATIONAL_ID_LENGTH},}}", " ", digits_text)
    name = _strip_identity_labels(name_source)
    # A bare single word ("محمد") is too weak to treat as a full name claim --
    # re-prompt instead of sending an RPC that is certain to miss.
    if len(name) < 4 or " " not in name:
        return None
    return name, national_id
