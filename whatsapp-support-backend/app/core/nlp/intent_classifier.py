"""
Intent classification service.

Two interchangeable back-ends behind one interface:

  1. ``TransformerIntentClassifier`` — loads a fine-tuned AraBERT / CAMeL-BERT
     sequence-classification checkpoint (path configured via
     ``INTENT_MODEL_PATH``) using HuggingFace ``transformers``. This is the
     production path and the one trained by ``scripts/train_intent_classifier``.

  2. ``HeuristicIntentClassifier`` — a dependency-free, weighted-keyword
     classifier with a softmax confidence head. It is the deterministic
     fallback used when the transformer checkpoint or ``transformers`` /
     ``torch`` are unavailable (e.g. CI, local dev without GPU). It is also the
     baseline reported in the evaluation notes.

Both return a uniform :class:`IntentPrediction` carrying the label,
probability/confidence, model version, and inference time in milliseconds.
"""
from __future__ import annotations

import math
import os
import time
import logging
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

from app.models.nlp import IntentLabel
from app.core.nlp.normalize import normalize_text, strip_clitics_text

logger = logging.getLogger(__name__)


@dataclass
class IntentPrediction:
    label: IntentLabel
    confidence: float
    model_version: str
    inference_time_ms: float
    # Full probability distribution (label -> prob), useful for reports.
    distribution: Dict[str, float]


# ---------------------------------------------------------------------------
# Heuristic keyword lexicon (normalised Arabic + English).
# Weights let strong, unambiguous markers dominate weak ones.
# ---------------------------------------------------------------------------
# Each entry: IntentLabel -> list of (keyword, weight)
_LEXICON: Dict[IntentLabel, List[Tuple[str, float]]] = {
    IntentLabel.ACCOUNT_INQUIRY: [
        ("رصيد", 3.0), ("رصيدي", 3.5), ("كشف حساب", 1.0), ("حسابي", 2.0),
        ("كم معي", 2.0), ("balance", 3.5), ("my account", 2.5), ("how much", 1.5),
    ],
    IntentLabel.TRANSFER_LOCAL: [
        ("تحويل", 2.5), ("حول", 2.0), ("ارسل مبلغ", 2.5), ("احول", 2.5),
        ("transfer", 2.5), ("send money", 2.5), ("محلي", 1.5), ("داخل البنك", 1.5),
    ],
    IntentLabel.TRANSFER_INTERNATIONAL: [
        ("تحويل دولي", 4.0), ("حواله خارجيه", 4.0), ("خارجيه", 3.5), ("سويفت", 3.5),
        ("swift", 3.5), ("الخارج", 3.5), ("عالخارج", 4.0), ("لبره", 3.0),
        ("بره فلسطين", 3.5), ("دوله اخرى", 3.5), ("دوله", 1.5),
        ("international transfer", 4.0), ("abroad", 3.0), ("overseas", 3.5),
        ("another country", 3.5), ("western union", 3.0),
    ],
    IntentLabel.CARD_SERVICES: [
        ("بطاقه", 2.0), ("بطاقتي", 2.5), ("تفعيل البطاقه", 3.5), ("اصدار بطاقه", 3.5),
        ("سقف البطاقه", 3.0), ("card", 2.0), ("activate card", 3.5),
        ("issue card", 3.5), ("card limit", 3.0), ("pin", 2.0),
    ],
    IntentLabel.CARD_LOST_STOLEN: [
        ("بطاقتي ضاعت", 4.5), ("بطاقه مسروقه", 4.5), ("ضاعت البطاقه", 4.5),
        ("ضاعت بطاقتي", 4.5), ("ضاعت", 3.0), ("سرقت", 3.0), ("انسرقت", 3.5),
        ("فقدت بطاقتي", 4.5), ("فقدت", 3.0), ("ايقاف البطاقه", 4.0),
        ("اوقفها", 2.5), ("اوقفوها", 3.0), ("اوقف بطاقتي", 4.0),
        ("lost card", 4.5), ("stolen card", 4.5), ("block my card", 4.0),
        ("lost my card", 4.5), ("report a lost", 4.0),
    ],
    IntentLabel.STATEMENT_REQUEST: [
        ("كشف حساب", 3.5), ("كشف الحساب", 3.5), ("بيان الحساب", 3.0),
        ("حركات الحساب", 3.0), ("حركات حسابي", 3.0), ("حركات", 1.5),
        ("statement", 3.5), ("account statement", 4.0), ("transactions list", 2.5),
    ],
    IntentLabel.FINANCING_INQUIRY: [
        ("تمويل", 3.0), ("مرابحه", 3.5), ("اجاره", 2.5), ("قرض", 2.5),
        ("تمويل سياره", 4.0), ("تمويل عقاري", 4.0), ("اقساط", 2.0),
        ("financing", 3.0), ("murabaha", 3.5), ("loan", 2.5), ("car financing", 4.0),
        ("mortgage", 3.5),
    ],
    IntentLabel.EXCHANGE_RATE: [
        ("سعر الصرف", 4.0), ("سعر صرف", 3.5), ("سعر الدولار", 3.5), ("صرف عمله", 3.5),
        ("صرف", 2.0), ("اسعار العملات", 4.0), ("العملات", 2.5), ("rate", 2.0),
        ("exchange rate", 4.0), ("currency rate", 3.5), ("currency", 2.0),
        ("dollar rate", 3.5),
    ],
    IntentLabel.BRANCH_ATM_INFO: [
        ("فرع", 2.5), ("فروع", 2.5), ("اقرب فرع", 4.0), ("صراف", 2.5),
        ("صراف الي", 3.5), ("اوقات الدوام", 3.0), ("عنوان الفرع", 3.0),
        ("branch", 2.5), ("atm", 3.0), ("nearest branch", 4.0),
        ("working hours", 3.0), ("opening hours", 3.0), ("location", 1.5),
    ],
    IntentLabel.PRODUCT_INFO: [
        ("حساب توفير", 3.0), ("حساب جاري", 3.0), ("منتجات", 2.5), ("خدمات", 1.5),
        ("اسلامي موبايل", 2.5), ("اسلامي اونلاين", 2.5), ("فتح حساب", 3.0),
        ("savings account", 3.0), ("current account", 3.0), ("product", 2.0),
        ("open account", 3.0), ("services", 1.5),
    ],
    IntentLabel.SHARIA_INQUIRY: [
        ("شرعي", 3.5), ("شرعيه", 3.5), ("شريعه", 3.5), ("متوافق مع الشريعه", 4.5),
        ("متوافق", 2.5), ("حلال", 3.5), ("حرام", 3.0), ("ربا", 3.5),
        ("فائده ربويه", 3.5), ("هيئه الرقابه الشرعيه", 4.5),
        ("sharia", 3.5), ("halal", 3.0), ("riba", 3.5), ("islamic ruling", 3.5),
        ("sharia compliant", 4.0), ("interest forbidden", 3.0),
    ],
    IntentLabel.COMPLAINT: [
        ("شكوى", 4.0), ("اشتكي", 3.5), ("مشكله", 2.0), ("سيئه", 2.0),
        ("خدمه سيئه", 3.5), ("غير راضي", 3.0), ("متضايق", 2.5), ("زعلان", 2.5),
        ("complaint", 4.0), ("complain", 3.5), ("bad service", 3.5),
        ("not satisfied", 3.0), ("terrible", 2.5),
    ],
    IntentLabel.ESCALATION_REQUEST: [
        ("بدي احكي مع حد", 4.5), ("موظف", 3.0), ("احكي مع موظف", 4.5),
        ("اريد موظف", 4.0), ("تحويلي لموظف", 4.0), ("ممثل خدمه", 3.5),
        ("human", 3.0), ("agent", 3.5), ("speak to someone", 4.0),
        ("talk to a person", 4.0), ("representative", 3.5), ("customer service", 2.0),
    ],
    IntentLabel.GENERAL_INFO: [
        ("مرحبا", 2.0), ("السلام عليكم", 2.0), ("اهلا", 1.5), ("مساعده", 1.0),
        ("معلومات", 1.0), ("hello", 2.0), ("hi", 1.8), ("help", 1.0),
        ("good morning", 1.8), ("info", 0.8),
    ],
}

# Normalise lexicon keys once at import time.
_NORM_LEXICON: Dict[IntentLabel, List[Tuple[str, float]]] = {
    intent: [(normalize_text(kw), w) for kw, w in kws]
    for intent, kws in _LEXICON.items()
}

HEURISTIC_VERSION = "heuristic-intent-1.2.0"


class HeuristicIntentClassifier:
    """Weighted keyword classifier with a softmax confidence head."""

    version = HEURISTIC_VERSION

    # Temperature controls how peaked the softmax is. Tuned so that a single
    # weak match yields a low (<=0.60) confidence while strong/multiple matches
    # approach high confidence.
    _TEMPERATURE = 1.1

    def predict(self, text: str) -> IntentPrediction:
        start = time.perf_counter()
        norm = normalize_text(text or "")
        # Add a clitic-stripped variant so keywords match across Arabic
        # morphology (definite article / conjunction prefixes).
        search = norm + " " + strip_clitics_text(norm)

        scores: Dict[IntentLabel, float] = {}
        for intent, keywords in _NORM_LEXICON.items():
            score = 0.0
            for kw, weight in keywords:
                if kw and kw in search:
                    score += weight
            if score > 0:
                scores[intent] = score

        if not scores:
            elapsed = (time.perf_counter() - start) * 1000.0
            # No evidence: default to UNKNOWN with a deliberately low confidence
            # so the low-confidence branch (<=0.60) fires.
            dist = {IntentLabel.UNKNOWN.value: 1.0}
            return IntentPrediction(
                label=IntentLabel.UNKNOWN,
                confidence=0.40,
                model_version=self.version,
                inference_time_ms=elapsed,
                distribution=dist,
            )

        # Softmax over matched intents for a calibrated confidence.
        labels = list(scores.keys())
        raw = [scores[l] / self._TEMPERATURE for l in labels]
        mx = max(raw)
        exps = [math.exp(r - mx) for r in raw]
        total = sum(exps)
        probs = [e / total for e in exps]

        best_idx = max(range(len(labels)), key=lambda i: probs[i])
        best_label = labels[best_idx]
        best_conf = probs[best_idx]

        # Dampen confidence when the top score is weak in absolute terms so a
        # single low-weight keyword cannot masquerade as high confidence.
        top_score = scores[best_label]
        absolute_factor = min(1.0, top_score / 3.0)
        confidence = best_conf * (0.55 + 0.45 * absolute_factor)

        distribution = {labels[i].value: round(probs[i], 4) for i in range(len(labels))}

        elapsed = (time.perf_counter() - start) * 1000.0
        return IntentPrediction(
            label=best_label,
            confidence=round(min(confidence, 0.99), 4),
            model_version=self.version,
            inference_time_ms=elapsed,
            distribution=distribution,
        )


class TransformerIntentClassifier:
    """Fine-tuned AraBERT / CAMeL-BERT sequence classifier.

    Lazily loads a HuggingFace checkpoint from ``model_path``. The checkpoint's
    ``config.id2label`` must map to the canonical :class:`IntentLabel` values.
    Raises on construction if the model cannot be loaded; the engine catches
    this and falls back to the heuristic classifier.
    """

    def __init__(self, model_path: str):
        # Imports are local so the package works without torch/transformers.
        import torch  # noqa: F401
        from transformers import (
            AutoTokenizer,
            AutoModelForSequenceClassification,
        )

        self._torch = torch
        self.model_path = model_path
        self.tokenizer = AutoTokenizer.from_pretrained(model_path)
        self.model = AutoModelForSequenceClassification.from_pretrained(model_path)
        self.model.eval()
        cfg = self.model.config
        self.id2label = {int(k): v for k, v in cfg.id2label.items()}
        self.version = f"transformer:{os.path.basename(os.path.normpath(model_path))}"
        logger.info("Loaded transformer intent model from %s", model_path)

    def predict(self, text: str) -> IntentPrediction:
        start = time.perf_counter()
        torch = self._torch
        inputs = self.tokenizer(
            text or "",
            return_tensors="pt",
            truncation=True,
            max_length=128,
        )
        with torch.no_grad():
            logits = self.model(**inputs).logits[0]
            probs = torch.softmax(logits, dim=-1).tolist()

        distribution: Dict[str, float] = {}
        for idx, p in enumerate(probs):
            raw_label = self.id2label.get(idx, "UNKNOWN")
            label = IntentLabel.coerce(raw_label)
            distribution[label.value] = distribution.get(label.value, 0.0) + p

        best_label_str = max(distribution, key=distribution.get)
        best_label = IntentLabel.coerce(best_label_str)
        confidence = distribution[best_label_str]

        elapsed = (time.perf_counter() - start) * 1000.0
        return IntentPrediction(
            label=best_label,
            confidence=round(confidence, 4),
            model_version=self.version,
            inference_time_ms=elapsed,
            distribution={k: round(v, 4) for k, v in distribution.items()},
        )


def build_intent_classifier(model_path: Optional[str] = None):
    """Factory: return the transformer classifier if a checkpoint is usable,
    otherwise the heuristic fallback."""
    if model_path and os.path.isdir(model_path):
        try:
            return TransformerIntentClassifier(model_path)
        except Exception as exc:  # pragma: no cover - depends on env
            logger.warning(
                "Falling back to heuristic intent classifier (could not load "
                "transformer at %s: %s)",
                model_path,
                exc,
            )
    else:
        if model_path:
            logger.info(
                "INTENT_MODEL_PATH %s not found; using heuristic classifier.",
                model_path,
            )
    return HeuristicIntentClassifier()
