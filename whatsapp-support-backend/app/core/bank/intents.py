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


# Date of birth as written in a free-text message. Year-first (ISO) is tried
# before day-first so "1990-05-15" isn't read as day 19. Both require
# separators: a bare "15051990" is genuinely ambiguous about where the day
# ends, so it is refused and re-prompted rather than guessed at.
_ISO_DATE_IN_TEXT = re.compile(r"(?<!\d)(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})(?!\d)")
_DAY_FIRST_DATE_IN_TEXT = re.compile(r"(?<!\d)(\d{1,2}[-/.]\d{1,2}[-/.]\d{4})(?!\d)")


def extract_identity_claim(text: str) -> Optional[Tuple[str, str]]:
    """Pull a (national_id, date_of_birth) pair out of a free-text reply.

    Returns the date as the RAW matched string -- parsing and validating it is
    app.core.bank.identity_input.normalize_identity_input's job, so WhatsApp
    and the voice agent (which receives the two values as separate tool
    arguments) apply exactly the same rules.

    Returns None when either half is missing; the caller re-prompts rather
    than guessing, and does NOT count that as a failed attempt (only a
    resolved-but-not-found identity should).
    """
    if not text:
        return None
    digits_text = normalize_digits(text)

    # The date is found FIRST, on separator-intact text, and cut out before
    # the ID is looked for. Order matters both ways: the separator-collapsing
    # below would turn "15-05-1990" into the 8-digit run "15051990", and a
    # date left in place can donate digits to the ID search.
    date_match = _ISO_DATE_IN_TEXT.search(digits_text) or _DAY_FIRST_DATE_IN_TEXT.search(
        digits_text
    )
    if not date_match:
        return None
    date_of_birth = date_match.group(1)
    id_source = digits_text[: date_match.start()] + " " + digits_text[date_match.end() :]

    # "123-456-789" / "123.456.789" are still one ID -- collapse a '-' or '.'
    # only when BOTH neighbours are digits, so separators elsewhere in the
    # message are left alone. Safe to do now that the date is out of the way.
    id_source = re.sub(r"(?<=\d)[-.](?=\d)", "", id_source)
    matches = re.findall(rf"(?<!\d)(\d{{{NATIONAL_ID_LENGTH}}})(?!\d)", id_source)
    if not matches:
        return None

    return matches[-1], date_of_birth
