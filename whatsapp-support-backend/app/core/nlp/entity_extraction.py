"""
Entity extraction service.

Extracts the 8 required entity types:
    AMOUNT, DATE, CARD_TYPE, BRANCH_NAME, ACCOUNT_ID, TRANSACTION_ID,
    PRODUCT_NAME, USER_INTENT

Approach
--------
- Rule/lexicon extractors for the structured, high-precision entities
  (amounts, dates, card types, branch names, account/transaction ids,
  product names). Patterns cover Arabic (MSA + Palestinian colloquial) and
  English surface forms and Arabic-Indic digits.
- Lexicon matching is token-based and tolerant of the Arabic definite article
  ("ال") and prefers the longest match, so "الإجارة المنتهية بالتمليك" wins
  over "الإجارة".
- An optional Arabic NER model (CAMeL-Tools / HuggingFace token-classification)
  augments BRANCH_NAME / PRODUCT_NAME recall when available; the extractor
  degrades gracefully to rules-only if the model is missing.
- All values are normalised, and sensitive identifiers (ACCOUNT_ID,
  TRANSACTION_ID) are masked here so raw values never leave the NLP layer.
"""
from __future__ import annotations

import re
import logging
from typing import List, Optional, Tuple

from app.models.nlp import Entity, EntityType
from app.core.nlp.normalize import (
    normalize_arabic,
    normalize_text,
    normalize_digits,
    normalize_amount,
    mask_identifier,
    mask_ref,
    mask_iban,
)

logger = logging.getLogger(__name__)

ENTITY_EXTRACTOR_VERSION = "rule-ner-1.2.0"


# ---------------------------------------------------------------------------
# Lexicons (raw surface -> canonical display). Keys are normalised at import.
# ---------------------------------------------------------------------------
_BRANCH_NAMES = {
    "رام الله": "رام الله", "البيرة": "البيرة", "نابلس": "نابلس",
    "الخليل": "الخليل", "غزة": "غزة", "جنين": "جنين", "طولكرم": "طولكرم",
    "قلقيلية": "قلقيلية", "بيت لحم": "بيت لحم", "أريحا": "أريحا",
    "سلفيت": "سلفيت", "طوباس": "طوباس", "برافو مول": "برافو مول",
    "بلازا مول": "بلازا مول",
    "ramallah": "رام الله", "nablus": "نابلس", "hebron": "الخليل",
    "gaza": "غزة", "jenin": "جنين", "bethlehem": "بيت لحم", "jericho": "أريحا",
}

_PRODUCT_NAMES = {
    "إسلامي موبايل": "إسلامي موبايل",
    "إسلامي أونلاين": "إسلامي أونلاين",
    "المرابحة": "المرابحة",
    "مرابحة": "المرابحة",
    "الإجارة المنتهية بالتمليك": "الإجارة المنتهية بالتمليك",
    "الإجارة": "الإجارة",
    "إجارة": "الإجارة",
    "المضاربة": "المضاربة",
    "المشاركة": "المشاركة",
    "تمويل السيارات": "تمويل السيارات",
    "تمويل سيارة": "تمويل السيارات",
    "التمويل العقاري": "التمويل العقاري",
    "تمويل عقاري": "التمويل العقاري",
    "حساب التوفير": "حساب التوفير",
    "حساب توفير": "حساب التوفير",
    "الحساب الجاري": "الحساب الجاري",
    "حساب جاري": "الحساب الجاري",
    "islami mobile": "إسلامي موبايل",
    "islami online": "إسلامي أونلاين",
    "murabaha": "المرابحة",
    "ijara": "الإجارة",
    "savings account": "حساب التوفير",
    "current account": "الحساب الجاري",
    "car financing": "تمويل السيارات",
    "mortgage": "التمويل العقاري",
}

# Card types that are unambiguous and always extracted.
_CARD_TYPES_STRONG = {
    "بطاقة الدفع المسبق": "بطاقة الدفع المسبق",
    "مسبقة الدفع": "بطاقة الدفع المسبق",
    "بطاقة مسبقة الدفع": "بطاقة الدفع المسبق",
    "prepaid": "بطاقة الدفع المسبق",
    "credit card": "بطاقة ائتمان",
    "debit card": "بطاقة خصم",
    "visa": "Visa",
    "mastercard": "Mastercard",
}
# Card types that are ambiguous bare words (e.g. خصم = "deduction") and are
# only emitted when a card context word is present in the message.
_CARD_TYPES_WEAK = {
    "ائتمانية": "بطاقة ائتمان",
    "ائتمان": "بطاقة ائتمان",
    "خصم": "بطاقة خصم",
    "مدى": "بطاقة خصم",
    "credit": "بطاقة ائتمان",
    "debit": "بطاقة خصم",
}
_CARD_CONTEXT_TOKENS = {"بطاقة", "بطاقتي", "بطاقه", "بطاقات", "card"}


def _normalize_lexicon(lex: dict) -> List[Tuple[List[str], str]]:
    """Return list of (al-stripped token list, canonical), sorted longest-first."""
    items = []
    for key, canonical in lex.items():
        toks = _al_strip_tokens(_tokenize_norm(key))
        if toks:
            items.append((toks, canonical))
    items.sort(key=lambda x: len(x[0]), reverse=True)
    return items


def _al_strip_tokens(tokens: List[str]) -> List[str]:
    out = []
    for t in tokens:
        # Strip a leading conjunction "و" then a definite article "ال" when
        # doing so still leaves a real word. This makes lexicon matching
        # tolerant of "وحساب" / "الحساب" surface forms.
        if t.startswith("و") and len(t) > 4:
            t = t[1:]
        if t.startswith("ال") and len(t) > 4:
            t = t[2:]
        out.append(t)
    return out


_WORD_RE = re.compile(r"[0-9A-Za-z\u0621-\u064A\u0660-\u0669\u066E-\u06D3]+")


def _tokenize_norm(text: str) -> List[str]:
    """Tokenise normalised text, dropping punctuation."""
    return _WORD_RE.findall(normalize_text(text))


_NORM_BRANCHES = _normalize_lexicon(_BRANCH_NAMES)
_NORM_PRODUCTS = _normalize_lexicon(_PRODUCT_NAMES)
_NORM_CARD_STRONG = _normalize_lexicon(_CARD_TYPES_STRONG)
_NORM_CARD_WEAK = _normalize_lexicon(_CARD_TYPES_WEAK)


# ---------------------------------------------------------------------------
# Regex patterns (run on digit-normalised text)
# ---------------------------------------------------------------------------
# Palestinian IBAN is 29 chars; allow a tolerant range.
_IBAN_RE = re.compile(r"\bPS\d{2}[A-Z0-9]{18,25}\b", re.IGNORECASE)
_CARD_NUM_RE = re.compile(r"\b(?:\d[ -]?){15}\d\b")
_ACCOUNT_RE = re.compile(r"\b\d{10,14}\b")

# Transaction keyword markers; the reference is located by proximity.
_TXN_KEYWORD_RE = re.compile(
    r"(?:رقم\s+(?:العملية|الحركة|المعاملة)|المعاملة|العملية|مرجع|"
    r"transaction|txn|ref(?:erence)?)",
    re.IGNORECASE,
)
_REF_TOKEN_RE = re.compile(r"[A-Za-z0-9\-]{6,20}")

_CURRENCY_WORDS = (
    r"\$|₪|دولارات|دولارا|دولار|شيكل|شيقل|شواقل|دينار|دنانير|يورو|"
    r"usd|ils|nis|jod|eur|dollars|dollar|shekels|shekel|dinars|dinar|euros|euro"
)
_AMOUNT_RE = re.compile(
    r"(?P<pre>(?:" + _CURRENCY_WORDS + r")\s*)?"
    r"(?P<num>\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)"
    r"(?P<post>\s*(?:" + _CURRENCY_WORDS + r"))?",
    re.IGNORECASE,
)

_DATE_NUM_RE = re.compile(r"\b(\d{1,2}[/\-\.]\d{1,2}(?:[/\-\.]\d{2,4})?)\b")
_REL_DATES = {
    "اليوم": "today", "بكرة": "tomorrow", "بكرا": "tomorrow", "غدا": "tomorrow",
    "مبارح": "yesterday", "امبارح": "yesterday", "البارحة": "yesterday",
    "الاسبوع القادم": "next_week", "الاسبوع الجاي": "next_week",
    "الشهر القادم": "next_month", "الشهر الجاي": "next_month",
    "today": "today", "tomorrow": "tomorrow", "yesterday": "yesterday",
    "next week": "next_week", "next month": "next_month",
}
_MONTHS = (
    r"يناير|فبراير|مارس|ابريل|مايو|يونيو|يوليو|اغسطس|سبتمبر|اكتوبر|نوفمبر|ديسمبر|"
    r"كانون|شباط|اذار|نيسان|ايار|حزيران|تموز|ايلول|تشرين|"
    r"january|february|march|april|may|june|july|august|september|october|november|december"
)
_DATE_MONTH_RE = re.compile(r"\b(\d{1,2}\s+(?:" + _MONTHS + r"))\b", re.IGNORECASE)


def _match_lexicon(text: str, norm_lex: List[Tuple[List[str], str]]):
    """Token-based, article-tolerant longest-match against a normalised lexicon.

    Returns list of (canonical, surface) where overlapping shorter matches are
    suppressed in favour of longer ones.
    """
    norm_tokens = _tokenize_norm(text)
    al_tokens = _al_strip_tokens(norm_tokens)
    n = len(al_tokens)
    covered = [False] * n
    matches = []

    for key_tokens, canonical in norm_lex:  # already sorted longest-first
        k = len(key_tokens)
        if k == 0 or k > n:
            continue
        for i in range(0, n - k + 1):
            if al_tokens[i : i + k] == key_tokens:
                if any(covered[i : i + k]):
                    continue
                for j in range(i, i + k):
                    covered[j] = True
                surface = " ".join(norm_tokens[i : i + k])
                matches.append((canonical, surface))
    return matches


class EntityExtractor:
    """Rule + optional NER entity extractor."""

    version = ENTITY_EXTRACTOR_VERSION

    def __init__(self, ner_model_path: Optional[str] = None, enable_ner: bool = False):
        self._ner = None
        self._ner_loaded = False
        self._ner_model_path = ner_model_path
        self._enable_ner = enable_ner

    # -- optional NER ----------------------------------------------------
    def _maybe_load_ner(self):
        if self._ner_loaded or not self._enable_ner:
            return
        self._ner_loaded = True
        try:  # pragma: no cover - depends on env
            from transformers import pipeline

            model = self._ner_model_path or "CAMeL-Lab/bert-base-arabic-camelbert-msa-ner"
            self._ner = pipeline("token-classification", model=model, aggregation_strategy="simple")
            logger.info("Loaded Arabic NER model: %s", model)
        except Exception as exc:  # pragma: no cover
            logger.info("Arabic NER unavailable, using rules only (%s)", exc)
            self._ner = None

    # -- public API ------------------------------------------------------
    def extract(self, text: str) -> List[Entity]:
        if not text:
            return []

        digit_text = normalize_digits(text)
        norm = normalize_arabic(text)
        entities: List[Entity] = []
        consumed: List[Tuple[int, int]] = []

        # 1) IBAN (sensitive account id)
        for m in _IBAN_RE.finditer(digit_text):
            entities.append(Entity(
                type=EntityType.ACCOUNT_ID, value=m.group(0),
                masked=mask_iban(m.group(0)), confidence=0.97,
                start=m.start(), end=m.end(), source="rule"))
            consumed.append((m.start(), m.end()))

        # 2) Card numbers (sensitive account id)
        for m in _CARD_NUM_RE.finditer(digit_text):
            if any(s <= m.start() < e for s, e in consumed):
                continue
            entities.append(Entity(
                type=EntityType.ACCOUNT_ID, value=m.group(0),
                masked=mask_identifier(m.group(0), visible=4), confidence=0.9,
                start=m.start(), end=m.end(), source="rule"))
            consumed.append((m.start(), m.end()))

        # 3) Transaction ids (sensitive) — keyword proximity
        for km in _TXN_KEYWORD_RE.finditer(digit_text):
            window = digit_text[km.end(): km.end() + 30]
            rm = _REF_TOKEN_RE.search(window)
            if not rm:
                continue
            ref = rm.group(0)
            abs_start = km.end() + rm.start()
            abs_end = km.end() + rm.end()
            if any(s <= abs_start < e for s, e in consumed):
                continue
            entities.append(Entity(
                type=EntityType.TRANSACTION_ID, value=ref,
                masked=mask_ref(ref, visible=4), confidence=0.86,
                start=abs_start, end=abs_end, source="rule"))
            consumed.append((abs_start, abs_end))

        # 4) Account numbers (sensitive)
        for m in _ACCOUNT_RE.finditer(digit_text):
            if any(s <= m.start() < e for s, e in consumed):
                continue
            entities.append(Entity(
                type=EntityType.ACCOUNT_ID, value=m.group(0),
                masked=mask_identifier(m.group(0), visible=4), confidence=0.82,
                start=m.start(), end=m.end(), source="rule"))
            consumed.append((m.start(), m.end()))

        # 5) Amounts — require a currency marker
        for m in _AMOUNT_RE.finditer(digit_text):
            if any(s <= m.start("num") < e for s, e in consumed):
                continue
            currency = ((m.group("pre") or "") + (m.group("post") or "")).strip()
            if not currency:
                continue
            entities.append(Entity(
                type=EntityType.AMOUNT, value=m.group(0).strip(),
                normalized=normalize_amount(m.group("num"), currency),
                confidence=0.9, start=m.start(), end=m.end(), source="rule"))

        # 6) Dates
        for m in _DATE_NUM_RE.finditer(digit_text):
            entities.append(Entity(
                type=EntityType.DATE, value=m.group(1),
                normalized=m.group(1).replace(".", "/").replace("-", "/"),
                confidence=0.85, start=m.start(1), end=m.end(1), source="rule"))
        for m in _DATE_MONTH_RE.finditer(digit_text):
            entities.append(Entity(
                type=EntityType.DATE, value=m.group(1),
                normalized=m.group(1).strip(), confidence=0.8, source="rule"))
        for key, canonical in _REL_DATES.items():
            nkey = normalize_arabic(key) if any("\u0600" <= c <= "\u06FF" for c in key) else key
            idx = norm.find(nkey)
            if idx != -1:
                entities.append(Entity(
                    type=EntityType.DATE, value=key, normalized=canonical,
                    confidence=0.7, start=idx, end=idx + len(nkey), source="rule"))

        # 7) Card types — strong (always) + weak (require card context)
        for canonical, surface in _match_lexicon(text, _NORM_CARD_STRONG):
            entities.append(Entity(
                type=EntityType.CARD_TYPE, value=surface, normalized=canonical,
                confidence=0.88, source="rule"))
        norm_token_set = set(_al_strip_tokens(_tokenize_norm(text)))
        has_card_ctx = bool(norm_token_set & {_al_strip_tokens([t])[0] for t in _CARD_CONTEXT_TOKENS})
        if has_card_ctx:
            for canonical, surface in _match_lexicon(text, _NORM_CARD_WEAK):
                entities.append(Entity(
                    type=EntityType.CARD_TYPE, value=surface, normalized=canonical,
                    confidence=0.8, source="rule"))

        # 8) Branch names
        for canonical, surface in _match_lexicon(text, _NORM_BRANCHES):
            entities.append(Entity(
                type=EntityType.BRANCH_NAME, value=surface, normalized=canonical,
                confidence=0.85, source="rule"))

        # 9) Product names
        for canonical, surface in _match_lexicon(text, _NORM_PRODUCTS):
            entities.append(Entity(
                type=EntityType.PRODUCT_NAME, value=surface, normalized=canonical,
                confidence=0.85, source="rule"))

        # 10) Optional NER augmentation for branches / products
        self._maybe_load_ner()
        if self._ner is not None:  # pragma: no cover - depends on env
            try:
                for ent in self._ner(text):
                    group = ent.get("entity_group", "")
                    word = ent.get("word", "").strip()
                    if not word or group not in {"LOC", "ORG"}:
                        continue
                    nword = normalize_arabic(word)
                    if any(e.normalized and nword in normalize_arabic(e.normalized) for e in entities):
                        continue
                    etype = EntityType.BRANCH_NAME if group == "LOC" else EntityType.PRODUCT_NAME
                    entities.append(Entity(
                        type=etype, value=word, normalized=word,
                        confidence=float(ent.get("score", 0.6)), source="ner"))
            except Exception as exc:  # pragma: no cover
                logger.debug("NER augmentation failed: %s", exc)

        # 11) USER_INTENT — concise, PII-safe paraphrase of the request
        user_intent = self._build_user_intent(text)
        if user_intent:
            entities.append(Entity(
                type=EntityType.USER_INTENT, value=user_intent,
                normalized=user_intent, confidence=0.6, source="rule"))

        return self._dedupe(entities)

    @staticmethod
    def _build_user_intent(text: str) -> str:
        from app.core.pii import redact_pii

        cleaned = re.sub(r"\s+", " ", text).strip()
        cleaned = redact_pii(cleaned)
        words = cleaned.split()
        if len(words) > 20:
            cleaned = " ".join(words[:20]) + " …"
        return cleaned

    @staticmethod
    def _dedupe(entities: List[Entity]) -> List[Entity]:
        best: dict = {}
        order: List[tuple] = []
        for e in entities:
            key = (e.type, (e.normalized or e.value or "").lower())
            if key not in best:
                order.append(key)
                best[key] = e
            elif e.confidence > best[key].confidence:
                best[key] = e
        return [best[k] for k in order]
