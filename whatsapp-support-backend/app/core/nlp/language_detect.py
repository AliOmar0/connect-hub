"""
Language / dialect detection.

Distinguishes three target languages required by the SRS:
  * Modern Standard Arabic (MSA)
  * Palestinian Levantine colloquial Arabic (LEVANTINE_PS)
  * English (ENGLISH)

Strategy
--------
Script detection (Arabic vs Latin) is reliable and cheap. The harder problem
is MSA vs Palestinian Levantine, which share script. We use a curated lexicon
of high-signal Palestinian/Levantine colloquial markers (e.g. ``بدي``, ``هلأ``,
``مش``, ``شو``, ``كيفك``) versus MSA markers (e.g. ``أريد``, ``الآن``, ``ليس``,
``ماذا``, ``كيف حالك``). The decision and a calibrated confidence are derived
from the relative marker evidence and message length.

Confidence semantics
---------------------
A confidence strictly below ``LANGUAGE_CONFIRM_THRESHOLD`` (0.70) signals the
caller to request user confirmation before continuing (SRS low-language-
confidence branch). Very short or mixed-script messages naturally yield low
confidence and therefore trigger confirmation.
"""
from __future__ import annotations

import re
from typing import Tuple

from app.models.nlp import LanguageLabel
from app.core.nlp.normalize import normalize_arabic

LANGUAGE_MODEL_VERSION = "lexicon-langid-1.0.0"

_ARABIC_CHAR = re.compile(r"[\u0600-\u06FF]")
_LATIN_CHAR = re.compile(r"[A-Za-z]")

# High-signal Palestinian / Levantine colloquial markers (normalised form).
_LEVANTINE_MARKERS = {
    "بدي", "بدك", "بدنا", "بده", "بدها", "هلق", "هلا", "هسا", "هيك", "مش",
    "شو", "ليش", "وين", "كيفك", "كيفكم", "عنجد", "كمان", "هاد", "هاي", "هدول",
    "بدي اسال", "في عنا", "زلمه", "كتير", "تمام", "احكي", "بحكي", "منيح",
    "اشي", "بتعرف", "بعرف", "لسا", "عشان", "علشان", "مبارح", "بكره", "يلا",
    "خلص", "بسيطه", "معلش", "طيب", "اه", "ايوه", "لأ",
}

# High-signal MSA markers (normalised form).
_MSA_MARKERS = {
    "أريد", "اريد", "الان", "ليس", "ماذا", "لماذا", "أين", "اين", "كيف",
    "حال", "كذلك", "ايضا", "هذا", "هذه", "هؤلاء", "الذي", "التي", "سوف",
    "يرجى", "نرجو", "حضرتك", "الرجاء", "بشأن", "بخصوص", "استفسار", "أرغب",
    "ارغب", "كم", "هل", "متى", "عبر", "حول", "يمكنني", "أود", "اود",
}


def _tokenize(text: str) -> list[str]:
    return [t for t in re.split(r"\s+", text) if t]


def detect_language(text: str) -> Tuple[LanguageLabel, float, str]:
    """Detect language/dialect.

    Returns ``(label, confidence, model_version)``.
    """
    if not text or not text.strip():
        return LanguageLabel.UNKNOWN, 0.0, LANGUAGE_MODEL_VERSION

    arabic_chars = len(_ARABIC_CHAR.findall(text))
    latin_chars = len(_LATIN_CHAR.findall(text))
    total_script = arabic_chars + latin_chars

    if total_script == 0:
        # Only digits / punctuation / emoji — undecidable.
        return LanguageLabel.UNKNOWN, 0.30, LANGUAGE_MODEL_VERSION

    arabic_ratio = arabic_chars / total_script

    # --- English path -----------------------------------------------------
    if arabic_ratio < 0.30:
        # Predominantly Latin script.
        purity = 1.0 - arabic_ratio  # how Latin it is
        # Short strings are less certain.
        length_factor = min(1.0, len(_tokenize(text)) / 3.0)
        confidence = 0.55 + 0.40 * purity * length_factor
        return LanguageLabel.ENGLISH, round(min(confidence, 0.99), 4), LANGUAGE_MODEL_VERSION

    # Mixed script with substantial Latin -> low confidence, ask to confirm.
    if 0.30 <= arabic_ratio < 0.55:
        return LanguageLabel.MSA, 0.50, LANGUAGE_MODEL_VERSION

    # --- Arabic: MSA vs Palestinian Levantine -----------------------------
    norm = normalize_arabic(text)
    tokens = _tokenize(norm)

    lev_hits = sum(1 for t in tokens if t in _LEVANTINE_MARKERS)
    msa_hits = sum(1 for t in tokens if t in _MSA_MARKERS)
    # Multi-word levantine phrases.
    for phrase in ("بدي اسال", "في عنا"):
        if phrase in norm:
            lev_hits += 1

    total_hits = lev_hits + msa_hits

    if total_hits == 0:
        # No dialect markers — default to MSA but with moderate confidence.
        # Longer messages with no colloquial markers are more likely MSA.
        n_tokens = len(tokens)
        confidence = 0.60 + min(0.15, 0.03 * n_tokens)
        return LanguageLabel.MSA, round(min(confidence, 0.80), 4), LANGUAGE_MODEL_VERSION

    if lev_hits > msa_hits:
        label = LanguageLabel.LEVANTINE_PS
        dominant, other = lev_hits, msa_hits
    else:
        label = LanguageLabel.MSA
        dominant, other = msa_hits, lev_hits

    # Confidence grows with marker evidence and margin.
    margin = (dominant - other) / total_hits  # 0..1
    evidence = min(1.0, dominant / 2.0)        # saturate at 2 markers
    confidence = 0.60 + 0.35 * (0.5 * margin + 0.5 * evidence)
    return label, round(min(confidence, 0.99), 4), LANGUAGE_MODEL_VERSION
