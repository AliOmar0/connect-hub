"""
Structured field extraction for the Bank Scraper Vector Knowledge Base
feature.

Uses regex over a page's already-extracted main text to identify
currency-tagged numeric amounts (e.g. ``50 ILS``, ``$20``, ``JOD 15.5``,
``20 دينار``) and classifies each one by inspecting nearby Arabic/English
fee, service, or price keywords. These are pure functions operating on a
plain string (no I/O), which makes them a primary target for property-based
testing (design.md Correctness Properties 9 and 10).

See design.md -> "6. `StructuredFieldExtractor` (`app/core/scraper/fields.py`)".

Regex/keyword reference (kept here so property tests can generate inputs
that this implementation is guaranteed to recognize):

Currency amount patterns (numeric amount adjacent to a currency token,
either order):
    - Currency code/word after the amount: ``50 ILS``, ``20 دينار``,
      ``100 شيكل``, ``15.5 JOD``, ``100 USD``, ``100 NIS``
    - Currency symbol/code before the amount: ``$20``, ``JOD 15.5``,
      ``ILS 50``, ``USD 100``, ``NIS 100``
    - Recognized currency tokens: ``ILS``, ``JOD``, ``USD``, ``NIS``, ``$``,
      ``دينار``, ``شيكل``
    - Amount format: one or more digits, optionally followed by a decimal
      point and one or more digits (``\\d+(?:\\.\\d+)?``)

Proximity keyword classification (checked within 50 characters before/after
the matched currency span, in priority order):
    1. Fee/commission keywords -> ``kind="fee"``:
       English: "fee", "fees", "commission", "charge", "charges"
       Arabic: "رسوم", "عمولة"
    2. Service keywords (checked only if no fee keyword matched) ->
       ``kind="service"``:
       English: "service", "services"
       Arabic: "خدمة", "خدمات"
    3. Price keywords (checked only if neither fee nor service matched) ->
       ``kind="price"``:
       English: "price", "prices", "cost", "costs"
       Arabic: "سعر", "أسعار", "ثمن", "تكلفة"
    4. No nearby keyword of any kind -> ``kind="currency"``
"""

import re
from dataclasses import dataclass
from typing import List, Literal, Pattern

# Number of characters of context checked before/after a matched currency
# span when looking for a fee/service/price keyword. This is a heuristic for
# "nearby" association, not perfect NLP.
_PROXIMITY_WINDOW = 50

_CURRENCY_CODES = ("ILS", "JOD", "USD", "NIS")
_CURRENCY_SYMBOLS = ("$",)
_CURRENCY_AR_WORDS = ("دينار", "شيكل")

_AMOUNT = r"\d+(?:\.\d+)?"
_CODE_ALT = "|".join(_CURRENCY_CODES)
_AR_ALT = "|".join(_CURRENCY_AR_WORDS)
_SYMBOL_ALT = "|".join(re.escape(symbol) for symbol in _CURRENCY_SYMBOLS)

# Matches either "<amount> <currency code/word>" (e.g. "50 ILS", "20 دينار")
# or "<currency symbol/code> <amount>" (e.g. "$20", "JOD 15.5").
_CURRENCY_PATTERN = re.compile(
    rf"(?:(?P<amount_first>{_AMOUNT})\s*(?P<currency_after>{_CODE_ALT}|{_AR_ALT})"
    rf"|(?P<currency_before>{_SYMBOL_ALT}|{_CODE_ALT})\s*(?P<amount_second>{_AMOUNT}))"
)

_FEE_KEYWORDS = ("fee", "fees", "commission", "charge", "charges", "رسوم", "عمولة")
_SERVICE_KEYWORDS = ("service", "services", "خدمة", "خدمات")
_PRICE_KEYWORDS = ("price", "prices", "cost", "costs", "سعر", "أسعار", "ثمن", "تكلفة")


def _build_keyword_pattern(keywords: tuple) -> Pattern:
    escaped = [re.escape(keyword) for keyword in keywords]
    return re.compile("(?:" + "|".join(escaped) + ")", re.IGNORECASE)


_FEE_PATTERN = _build_keyword_pattern(_FEE_KEYWORDS)
_SERVICE_PATTERN = _build_keyword_pattern(_SERVICE_KEYWORDS)
_PRICE_PATTERN = _build_keyword_pattern(_PRICE_KEYWORDS)


@dataclass
class StructuredField:
    kind: Literal["service", "fee", "price", "currency"]
    value: str
    raw_span: str


def _has_nearby(pattern: Pattern, text: str, start: int, end: int) -> bool:
    """True if `pattern` matches anywhere within `_PROXIMITY_WINDOW`
    characters before `start` or after `end` in `text`."""
    window_start = max(0, start - _PROXIMITY_WINDOW)
    window_end = min(len(text), end + _PROXIMITY_WINDOW)
    return pattern.search(text[window_start:window_end]) is not None


def extract_structured_fields(text: str) -> List[StructuredField]:
    """Regex-based extraction of currency-tagged numeric amounts (e.g. '50
    ILS', '$20', 'JOD 15.5') and nearby service/fee keywords (Arabic +
    English: 'رسوم', 'عمولة', 'fee', 'commission', 'service')."""
    if not text:
        return []

    fields: List[StructuredField] = []
    for match in _CURRENCY_PATTERN.finditer(text):
        start, end = match.span()
        raw_span = match.group(0)
        value = raw_span.strip()
        if not value:
            continue

        if _has_nearby(_FEE_PATTERN, text, start, end):
            kind: Literal["service", "fee", "price", "currency"] = "fee"
        elif _has_nearby(_SERVICE_PATTERN, text, start, end):
            kind = "service"
        elif _has_nearby(_PRICE_PATTERN, text, start, end):
            kind = "price"
        else:
            kind = "currency"

        fields.append(StructuredField(kind=kind, value=value, raw_span=raw_span))

    return fields
