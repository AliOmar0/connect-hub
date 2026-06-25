"""
Latency evaluation for the local NLP pipeline (CPU, no network).

Measures per-message ``nlp_engine.analyze`` latency over the intent test set
and reports mean / p50 / p95 / max in milliseconds. This isolates the
deterministic NLP cost; LLM/RAG network latency is out of scope here and is
documented as a limitation.
"""
from __future__ import annotations

import os
import time

from evaluation import config
from evaluation.utils import read_jsonl, base_record, write_csv
from app.core.nlp.engine import nlp_engine

COMMAND = "python -m evaluation.run_all latency"


def _percentile(values, pct: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    k = max(0, min(len(ordered) - 1, int(round((pct / 100.0) * (len(ordered) - 1)))))
    return ordered[k]


def run() -> dict:
    rows = read_jsonl(config.INTENT_TEST)
    # Warm-up (first call pays import/JIT-like costs).
    if rows:
        nlp_engine.analyze(rows[0]["text"])

    samples = []
    csv_rows = []
    for r in rows:
        t0 = time.perf_counter()
        nlp_engine.analyze(r["text"])
        dt = (time.perf_counter() - t0) * 1000.0
        samples.append(dt)
        csv_rows.append({"text_len": len(r["text"]), "latency_ms": round(dt, 3)})

    n = len(samples)
    mean = sum(samples) / n if n else 0.0
    p50 = _percentile(samples, 50)
    p95 = _percentile(samples, 95)
    mx = max(samples) if samples else 0.0

    write_csv("latency_samples.csv", csv_rows, ["text_len", "latency_ms"])

    threshold = config.THRESHOLDS["latency_p95_ms"]
    record = base_record(
        metric="nlp_latency_ms",
        command=COMMAND,
        dataset={
            "name": "intents_test.jsonl",
            "path": os.path.relpath(config.INTENT_TEST, config.BACKEND_ROOT),
            "size": n,
            "description": "Latency of nlp_engine.analyze per message over the intent test set.",
        },
        thresholds={"p95_ms": threshold},
        model_versions={"intent_model": nlp_engine._intent.version},
    )
    record["results"] = {
        "mean_ms": round(mean, 3),
        "p50_ms": round(p50, 3),
        "p95_ms": round(p95, 3),
        "max_ms": round(mx, 3),
        "samples_file": "latency_samples.csv",
    }
    record["status"] = "pass" if p95 <= threshold else "fail"
    record["limitations"] = (
        "Measures the local NLP stage only (CPU). End-to-end latency including "
        "OpenRouter LLM and Qdrant RAG depends on network/model and is not "
        "captured here. Numbers vary with host hardware."
    )
    return record
