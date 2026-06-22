"""
Entity extraction evaluation: per-type and micro precision/recall/F1 over the
curated gold set. USER_INTENT is excluded (always emitted, not part of gold).
"""
from __future__ import annotations

import os
from collections import defaultdict

from evaluation import config
from evaluation.utils import read_jsonl, base_record, write_csv
from app.models.nlp import EntityType
from app.core.nlp.entity_extraction import EntityExtractor

COMMAND = "python -m evaluation.run_all entity"


def _keys(entities) -> set:
    out = set()
    for e in entities:
        if isinstance(e, dict):
            out.add((e["type"], e["value"].strip()))
        else:
            out.add((e.type.value, e.display_value().strip()))
    return out


def run() -> dict:
    extractor = EntityExtractor()
    rows = read_jsonl(config.ENTITY_TEST)

    tp = defaultdict(int)
    fp = defaultdict(int)
    fn = defaultdict(int)

    for r in rows:
        gold = _keys(r["entities"])
        pred = _keys([e for e in extractor.extract(r["text"]) if e.type != EntityType.USER_INTENT])
        for k in pred:
            (tp if k in gold else fp)[k[0]] += 1
        for k in gold:
            if k not in pred:
                fn[k[0]] += 1

    per_type = {}
    csv_rows = []
    total_tp = total_fp = total_fn = 0
    for etype in EntityType.values():
        if etype == EntityType.USER_INTENT.value:
            continue
        t, f_, n_ = tp[etype], fp[etype], fn[etype]
        total_tp += t
        total_fp += f_
        total_fn += n_
        p = t / (t + f_) if (t + f_) else 0.0
        rc = t / (t + n_) if (t + n_) else 0.0
        f1 = 2 * p * rc / (p + rc) if (p + rc) else 0.0
        per_type[etype] = {"precision": round(p, 4), "recall": round(rc, 4),
                           "f1": round(f1, 4), "tp": t, "fp": f_, "fn": n_}
        csv_rows.append({"entity_type": etype, "precision": round(p, 4),
                         "recall": round(rc, 4), "f1": round(f1, 4),
                         "tp": t, "fp": f_, "fn": n_})

    micro_p = total_tp / (total_tp + total_fp) if (total_tp + total_fp) else 0.0
    micro_r = total_tp / (total_tp + total_fn) if (total_tp + total_fn) else 0.0
    micro_f = 2 * micro_p * micro_r / (micro_p + micro_r) if (micro_p + micro_r) else 0.0

    write_csv("entity_per_type.csv", csv_rows,
              ["entity_type", "precision", "recall", "f1", "tp", "fp", "fn"])

    threshold = config.THRESHOLDS["entity_micro_f1"]
    record = base_record(
        metric="entity_micro_f1",
        command=COMMAND,
        dataset={
            "name": "entities_test.jsonl",
            "path": os.path.relpath(config.ENTITY_TEST, config.BACKEND_ROOT),
            "size": len(rows),
            "description": "Curated entity gold set (8 entity types, AR+EN), sensitive values pre-masked.",
        },
        thresholds={"micro_f1": threshold},
        model_versions={"entity_extractor": extractor.version},
    )
    record["results"] = {
        "micro_precision": round(micro_p, 4),
        "micro_recall": round(micro_r, 4),
        "micro_f1": round(micro_f, 4),
        "per_type": per_type,
        "per_type_file": "entity_per_type.csv",
    }
    record["status"] = "pass" if micro_f >= threshold else "fail"
    record["limitations"] = (
        "Small curated gold set (sanity check, not a population estimate). "
        "Rule-based extraction; rare surface forms may be missed."
    )
    return record
