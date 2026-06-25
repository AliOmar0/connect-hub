"""
Intent classification evaluation: top-1 accuracy, macro/weighted P/R/F1, and a
confusion matrix. Reuses the runtime classifier so the evidence reflects what
actually ships.
"""
from __future__ import annotations

import os
from collections import defaultdict

from evaluation import config
from evaluation.utils import read_jsonl, base_record, write_csv
from app.models.nlp import IntentLabel
from app.core.nlp.intent_classifier import build_intent_classifier

COMMAND = "python -m evaluation.run_all intent"


def run() -> dict:
    classifier = build_intent_classifier(os.getenv("INTENT_MODEL_PATH"))
    rows = read_jsonl(config.INTENT_TEST)
    labels = IntentLabel.values()
    index = {l: i for i, l in enumerate(labels)}
    cm = [[0] * len(labels) for _ in labels]

    correct = 0
    tp = defaultdict(int)
    fp = defaultdict(int)
    fn = defaultdict(int)
    support = defaultdict(int)

    for r in rows:
        gold = r["intent"]
        pred = classifier.predict(r["text"]).label.value
        if gold in index and pred in index:
            cm[index[gold]][index[pred]] += 1
        support[gold] += 1
        if pred == gold:
            correct += 1
            tp[gold] += 1
        else:
            fp[pred] += 1
            fn[gold] += 1

    n = len(rows)
    accuracy = correct / n if n else 0.0

    per_label = {}
    macro_f = weighted_f = 0.0
    counted = 0
    for l in labels:
        p = tp[l] / (tp[l] + fp[l]) if (tp[l] + fp[l]) else 0.0
        rc = tp[l] / (tp[l] + fn[l]) if (tp[l] + fn[l]) else 0.0
        f = 2 * p * rc / (p + rc) if (p + rc) else 0.0
        per_label[l] = {"precision": round(p, 4), "recall": round(rc, 4),
                        "f1": round(f, 4), "support": support[l]}
        if support[l] > 0:
            macro_f += f
            weighted_f += f * support[l]
            counted += 1

    # Confusion matrix CSV.
    cm_rows = []
    for i, gold in enumerate(labels):
        row = {"gold\\pred": gold}
        row.update({labels[j]: cm[i][j] for j in range(len(labels))})
        cm_rows.append(row)
    write_csv("intent_confusion_matrix.csv", cm_rows, ["gold\\pred"] + labels)

    threshold = config.THRESHOLDS["intent_top1_accuracy"]
    record = base_record(
        metric="intent_top1_accuracy",
        command=COMMAND,
        dataset={
            "name": "intents_test.jsonl",
            "path": os.path.relpath(config.INTENT_TEST, config.BACKEND_ROOT),
            "size": n,
            "description": "Held-out intent test split (MSA + Palestinian Levantine + English) over 15 canonical intents.",
        },
        thresholds={"top1_accuracy": threshold},
        model_versions={"intent_model": classifier.version},
    )
    record["results"] = {
        "top1_accuracy": round(accuracy, 4),
        "macro_f1": round(macro_f / counted, 4) if counted else 0.0,
        "weighted_f1": round(weighted_f / n, 4) if n else 0.0,
        "per_label": per_label,
        "confusion_matrix_file": "intent_confusion_matrix.csv",
    }
    record["status"] = "pass" if accuracy >= threshold else "fail"
    record["limitations"] = (
        "Synthetic, template-generated data; lexical overlap between train/test "
        "makes this an optimistic upper bound vs production traffic."
    )
    return record
