"""
Evaluation harness for the NLP pipeline.

Produces three artefacts under ``app/dataset/nlp/reports/``:
  1. ``intent_metrics.json``  — top-1 accuracy, macro/weighted P/R/F1.
  2. ``confusion_matrix.csv``  — gold (rows) vs predicted (cols).
  3. ``entity_metrics.json``   — per-type and micro precision/recall/F1.

It evaluates whichever intent classifier the engine resolves (fine-tuned
transformer if ``INTENT_MODEL_PATH`` is set and loadable, otherwise the
heuristic baseline) so the same command reports both honestly.

Usage:
    python -m scripts.eval_nlp
"""
from __future__ import annotations

import json
import os
from collections import defaultdict
from typing import Dict, List, Tuple

from app.models.nlp import IntentLabel, EntityType
from app.core.nlp.intent_classifier import build_intent_classifier
from app.core.nlp.entity_extraction import EntityExtractor

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, "..", "app", "dataset", "nlp")
REPORTS_DIR = os.path.join(DATA_DIR, "reports")


def _read_jsonl(path: str) -> List[dict]:
    rows = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


# ---------------------------------------------------------------------------
# Intent evaluation
# ---------------------------------------------------------------------------
def evaluate_intents(classifier) -> Tuple[dict, List[List[int]], List[str]]:
    test = _read_jsonl(os.path.join(DATA_DIR, "intents_test.jsonl"))
    labels = IntentLabel.values()
    index = {l: i for i, l in enumerate(labels)}
    cm = [[0 for _ in labels] for _ in labels]

    correct = 0
    tp = defaultdict(int)
    fp = defaultdict(int)
    fn = defaultdict(int)
    support = defaultdict(int)

    for row in test:
        gold = row["intent"]
        pred = classifier.predict(row["text"]).label.value
        cm[index[gold]][index[pred]] += 1
        support[gold] += 1
        if pred == gold:
            correct += 1
            tp[gold] += 1
        else:
            fp[pred] += 1
            fn[gold] += 1

    n = len(test)
    accuracy = correct / n if n else 0.0

    per_label = {}
    macro_p = macro_r = macro_f = 0.0
    weighted_f = 0.0
    counted = 0
    for l in labels:
        p = tp[l] / (tp[l] + fp[l]) if (tp[l] + fp[l]) else 0.0
        r = tp[l] / (tp[l] + fn[l]) if (tp[l] + fn[l]) else 0.0
        f = 2 * p * r / (p + r) if (p + r) else 0.0
        per_label[l] = {
            "precision": round(p, 4),
            "recall": round(r, 4),
            "f1": round(f, 4),
            "support": support[l],
        }
        if support[l] > 0:
            macro_p += p
            macro_r += r
            macro_f += f
            counted += 1
            weighted_f += f * support[l]

    metrics = {
        "model_version": classifier.version,
        "num_test": n,
        "top1_accuracy": round(accuracy, 4),
        "macro_precision": round(macro_p / counted, 4) if counted else 0.0,
        "macro_recall": round(macro_r / counted, 4) if counted else 0.0,
        "macro_f1": round(macro_f / counted, 4) if counted else 0.0,
        "weighted_f1": round(weighted_f / n, 4) if n else 0.0,
        "per_label": per_label,
        "acceptance_threshold": 0.85,
        "meets_threshold": accuracy >= 0.85,
    }
    return metrics, cm, labels


def write_confusion_matrix(cm: List[List[int]], labels: List[str]):
    os.makedirs(REPORTS_DIR, exist_ok=True)
    path = os.path.join(REPORTS_DIR, "confusion_matrix.csv")
    with open(path, "w", encoding="utf-8") as f:
        f.write("gold\\pred," + ",".join(labels) + "\n")
        for i, label in enumerate(labels):
            f.write(label + "," + ",".join(str(x) for x in cm[i]) + "\n")
    return path


# ---------------------------------------------------------------------------
# Entity evaluation
# ---------------------------------------------------------------------------
def _entity_keys(entities) -> set:
    """Build comparable keys: (type, display_value)."""
    keys = set()
    for e in entities:
        if isinstance(e, dict):
            etype = e["type"]
            val = e["value"]
        else:
            etype = e.type.value
            val = e.display_value()
        keys.add((etype, val.strip()))
    return keys


def evaluate_entities(extractor: EntityExtractor) -> dict:
    test = _read_jsonl(os.path.join(DATA_DIR, "entities_test.jsonl"))
    # USER_INTENT is always emitted and not part of gold sets; exclude it.
    tp = defaultdict(int)
    fp = defaultdict(int)
    fn = defaultdict(int)

    for row in test:
        gold = _entity_keys(row["entities"])
        pred = _entity_keys(
            [e for e in extractor.extract(row["text"]) if e.type != EntityType.USER_INTENT]
        )
        for key in pred:
            if key in gold:
                tp[key[0]] += 1
            else:
                fp[key[0]] += 1
        for key in gold:
            if key not in pred:
                fn[key[0]] += 1

    per_type = {}
    total_tp = total_fp = total_fn = 0
    for etype in EntityType.values():
        if etype == EntityType.USER_INTENT.value:
            continue
        t, f_, n_ = tp[etype], fp[etype], fn[etype]
        total_tp += t
        total_fp += f_
        total_fn += n_
        p = t / (t + f_) if (t + f_) else 0.0
        r = t / (t + n_) if (t + n_) else 0.0
        f1 = 2 * p * r / (p + r) if (p + r) else 0.0
        per_type[etype] = {
            "precision": round(p, 4),
            "recall": round(r, 4),
            "f1": round(f1, 4),
            "tp": t,
            "fp": f_,
            "fn": n_,
        }

    micro_p = total_tp / (total_tp + total_fp) if (total_tp + total_fp) else 0.0
    micro_r = total_tp / (total_tp + total_fn) if (total_tp + total_fn) else 0.0
    micro_f = 2 * micro_p * micro_r / (micro_p + micro_r) if (micro_p + micro_r) else 0.0

    return {
        "extractor_version": extractor.version,
        "num_test": len(test),
        "micro_precision": round(micro_p, 4),
        "micro_recall": round(micro_r, 4),
        "micro_f1": round(micro_f, 4),
        "per_type": per_type,
        "acceptance_threshold": 0.80,
        "meets_threshold": micro_f >= 0.80,
    }


def main():
    os.makedirs(REPORTS_DIR, exist_ok=True)

    intent_model_path = os.getenv("INTENT_MODEL_PATH")
    classifier = build_intent_classifier(intent_model_path)
    extractor = EntityExtractor()

    intent_metrics, cm, labels = evaluate_intents(classifier)
    with open(os.path.join(REPORTS_DIR, "intent_metrics.json"), "w", encoding="utf-8") as f:
        json.dump(intent_metrics, f, ensure_ascii=False, indent=2)
    cm_path = write_confusion_matrix(cm, labels)

    entity_metrics = evaluate_entities(extractor)
    with open(os.path.join(REPORTS_DIR, "entity_metrics.json"), "w", encoding="utf-8") as f:
        json.dump(entity_metrics, f, ensure_ascii=False, indent=2)

    print("=== Intent Classification ===")
    print(f"model: {intent_metrics['model_version']}")
    print(f"top-1 accuracy: {intent_metrics['top1_accuracy']:.2%} "
          f"(threshold 85% -> {'PASS' if intent_metrics['meets_threshold'] else 'FAIL'})")
    print(f"macro-F1: {intent_metrics['macro_f1']:.4f}")
    print(f"confusion matrix: {cm_path}")
    print()
    print("=== Entity Extraction ===")
    print(f"extractor: {entity_metrics['extractor_version']}")
    print(f"micro-F1: {entity_metrics['micro_f1']:.2%} "
          f"(threshold 80% -> {'PASS' if entity_metrics['meets_threshold'] else 'FAIL'})")
    print(f"micro-precision: {entity_metrics['micro_precision']:.4f}")
    print(f"micro-recall: {entity_metrics['micro_recall']:.4f}")
    print()
    print(f"Reports written to {REPORTS_DIR}")


if __name__ == "__main__":
    main()
