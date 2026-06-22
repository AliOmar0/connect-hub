"""
Language detection evaluation: accuracy + per-class precision/recall/F1 over the
MSA / Palestinian Levantine / English gold set, plus the rate at which the
detector falls below the 0.70 confirmation threshold.
"""
from __future__ import annotations

import os
from collections import defaultdict

from evaluation import config
from evaluation.utils import read_jsonl, base_record, write_csv
from app.core.nlp.language_detect import detect_language, LANGUAGE_MODEL_VERSION

COMMAND = "python -m evaluation.run_all language"
CLASSES = ["MSA", "LEVANTINE_PS", "ENGLISH"]


def run() -> dict:
    rows = read_jsonl(config.LANGUAGE_TEST)

    correct = 0
    below_threshold = 0
    tp = defaultdict(int)
    fp = defaultdict(int)
    fn = defaultdict(int)
    support = defaultdict(int)
    csv_rows = []

    for r in rows:
        gold = r["language"]
        label, conf, _ = detect_language(r["text"])
        pred = label.value
        support[gold] += 1
        if conf < config.LANGUAGE_CONFIRM_THRESHOLD:
            below_threshold += 1
        if pred == gold:
            correct += 1
            tp[gold] += 1
        else:
            fp[pred] += 1
            fn[gold] += 1
        csv_rows.append({
            "text": r["text"], "gold": gold, "predicted": pred,
            "confidence": conf,
            "below_confirm_threshold": conf < config.LANGUAGE_CONFIRM_THRESHOLD,
        })

    n = len(rows)
    accuracy = correct / n if n else 0.0

    per_class = {}
    for c in CLASSES:
        p = tp[c] / (tp[c] + fp[c]) if (tp[c] + fp[c]) else 0.0
        rc = tp[c] / (tp[c] + fn[c]) if (tp[c] + fn[c]) else 0.0
        f = 2 * p * rc / (p + rc) if (p + rc) else 0.0
        per_class[c] = {"precision": round(p, 4), "recall": round(rc, 4),
                        "f1": round(f, 4), "support": support[c]}

    write_csv("language_predictions.csv", csv_rows,
              ["text", "gold", "predicted", "confidence", "below_confirm_threshold"])

    threshold = config.THRESHOLDS["language_accuracy"]
    record = base_record(
        metric="language_accuracy",
        command=COMMAND,
        dataset={
            "name": "language_test.jsonl",
            "path": os.path.relpath(config.LANGUAGE_TEST, config.BACKEND_ROOT),
            "size": n,
            "description": "Balanced language gold set: MSA, Palestinian Levantine, English banking utterances.",
        },
        thresholds={"accuracy": threshold,
                    "confirm_threshold": config.LANGUAGE_CONFIRM_THRESHOLD},
        model_versions={"language_model": LANGUAGE_MODEL_VERSION},
    )
    record["results"] = {
        "accuracy": round(accuracy, 4),
        "per_class": per_class,
        "below_confirm_threshold_count": below_threshold,
        "below_confirm_threshold_rate": round(below_threshold / n, 4) if n else 0.0,
        "predictions_file": "language_predictions.csv",
    }
    record["status"] = "pass" if accuracy >= threshold else "fail"
    record["limitations"] = (
        "MSA vs Palestinian Levantine relies on a colloquial-marker lexicon; "
        "code-switched or very short messages yield low confidence by design "
        "(triggering the confirmation branch)."
    )
    return record
