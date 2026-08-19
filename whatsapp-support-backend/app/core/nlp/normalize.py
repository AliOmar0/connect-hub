"""
Text normalisation and value-masking helpers for the NLP layer.

Two responsibilities:
  1. Normalise Arabic/English text and extracted values to a canonical form
     so downstream comparison and storage are consistent.
  2. Mask sensitive extracted values (account / card / transaction numbers)
     so raw identifiers never leave the NLP layer.
"""
from __future__ import annotations

import re
from typing import Optional


# Arabic-Indic and extended Arabic-Indic digits -> ASCII digits.
_ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩"
_EXT_ARABIC_DIGITS = "۰۱۲۳۴۵۶۷۸۹"
_DIGIT_TRANS = {ord(c): str(i) for i, c in enumerate(_ARABIC_DIGITS)}
_DIGIT_TRANS.update({ord(c): str(i) for i, c in enumerate(_EXT_ARABIC_DIGITS)})

# Arabic diacritics (tashkeel) and tatweel.
_TASHKEEL = re.compile(r"[\u0617-\u061A\u064B-\u0652\u0670\u0640]")


def normalize_digits(text: str) -> str:
    """Convert Arabic-Indic digits to ASCII digits."""
    if not text:
        return text
    return text.translate(_DIGIT_TRANS)


def normalize_arabic(text: str) -> str:
    """Normalise Arabic text for robust matching.

    - Convert Arabic-Indic digits to ASCII.
    - Strip diacritics and tatweel.
    - Unify alef/hamza/ya/ta-marbuta variants.
    - Collapse whitespace.
    """
    if not text:
        return ""
    text = normalize_digits(text)
    text = _TASHKEEL.sub("", text)
    # Unify alef variants.
    text = re.sub(r"[إأآا]", "ا", text)
    # Unify ya / alef-maqsura.
    text = text.replace("ى", "ي")
    # Ta marbuta -> ha.
    text = text.replace("ة", "ه")
    # Hamza on waw / ya.
    text = text.replace("ؤ", "و").replace("ئ", "ي").replace("ء", "")
    text = re.sub(r"\s+", " ", text).strip()
    return text


def normalize_text(text: str) -> str:
    """General-purpose normalisation (Arabic + lowercase Latin)."""
    if not text:
        return ""
    text = normalize_arabic(text)
    return text.lower()


def strip_clitics(token: str) -> str:
    """Strip a leading conjunction "و" and/or definite article "ال".

    Used to make keyword/lexicon matching tolerant of Arabic morphology
    (e.g. ``الحساب`` -> ``حساب``, ``وحساب`` -> ``حساب``).
    """
    if token.startswith("و") and len(token) > 4:
        token = token[1:]
    if token.startswith("ال") and len(token) > 4:
        token = token[2:]
    return token


def strip_clitics_text(text: str) -> str:
    """Apply :func:`strip_clitics` to every whitespace token."""
    return " ".join(strip_clitics(t) for t in (text or "").split())


# ---------------------------------------------------------------------------
# Masking
# ---------------------------------------------------------------------------
def normalize_msisdn(phone: str) -> str:
    r"""Reduce a phone number to bare digits for cross-system matching.

    WhatsApp delivers the sender as ``970599123456`` (no ``+``) while
    ``customers.phone`` in Bank_db_oss is typically stored ``+970 59 912 3456``.
    Comparing the raw strings never matches, so both sides are digit-normalised
    (the bank-side RPC does the same with ``regexp_replace(.., '\D', '', 'g')``).

    A leading international prefix (``00``) is stripped so ``00970..`` and
    ``+970..`` collapse to the same value.
    """
    if not phone:
        return ""
    digits = re.sub(r"\D", "", normalize_digits(phone))
    if digits.startswith("00"):
        digits = digits[2:]
    return digits


def mask_identifier(value: str, visible: int = 4) -> str:
    """Mask all but the last ``visible`` digits of an identifier.

    Non-digit characters are dropped before masking so that spacing/dashes in
    card or account numbers don't leak structure.
    """
    if not value:
        return "[REDACTED]"
    digits = re.sub(r"\D", "", value)
    if not digits:
        return "[REDACTED]"
    if len(digits) <= visible:
        return "*" * len(digits)
    return "*" * (len(digits) - visible) + digits[-visible:]


def mask_ref(value: str, visible: int = 4) -> str:
    """Mask an alphanumeric reference keeping the last ``visible`` characters.

    Unlike :func:`mask_identifier`, non-digit characters are *not* stripped, so
    transaction references like ``ABC123456`` keep a stable length.
    """
    if not value:
        return "[REDACTED]"
    cleaned = re.sub(r"\s+", "", value)
    if len(cleaned) <= visible:
        return "*" * len(cleaned)
    return "*" * (len(cleaned) - visible) + cleaned[-visible:]


def mask_iban(value: str) -> str:
    """Mask an IBAN keeping the country prefix and last 4 chars."""
    cleaned = re.sub(r"\s+", "", value or "")
    if len(cleaned) <= 8:
        return mask_identifier(cleaned)
    return f"{cleaned[:4]}{'*' * (len(cleaned) - 8)}{cleaned[-4:]}"


# ---------------------------------------------------------------------------
# Amount normalisation
# ---------------------------------------------------------------------------
_CURRENCY_MAP = {
    "$": "USD", "usd": "USD", "dollar": "USD", "dollars": "USD",
    "دولار": "USD", "دولارا": "USD", "دولارات": "USD",
    "₪": "ILS", "ils": "ILS", "شيكل": "ILS", "شيقل": "ILS", "شواقل": "ILS", "nis": "ILS",
    "jod": "JOD", "dinar": "JOD", "دينار": "JOD", "دنانير": "JOD",
    "eur": "EUR", "euro": "EUR", "يورو": "EUR",
}


def normalize_currency(token: Optional[str]) -> Optional[str]:
    if not token:
        return None
    key = token.strip().lower()
    return _CURRENCY_MAP.get(key)


def normalize_amount(number: str, currency: Optional[str]) -> str:
    """Return a canonical ``<number> <ISO currency>`` string."""
    number = normalize_digits(number or "").replace(",", "").strip()
    iso = normalize_currency(currency)
    if iso:
        return f"{number} {iso}"
    return number
