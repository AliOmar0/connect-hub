"""
Evaluation orchestrator.

Runs every evaluator, writes per-metric JSON (+ CSV) evidence, snapshots the
OpenAPI schema, and builds the human-readable report.

    python -m evaluation.run_all                # everything
    python -m evaluation.run_all intent latency # a subset
    python -m evaluation.run_all openapi         # just the OpenAPI snapshot
"""
from __future__ import annotations

import sys
import traceback

from evaluation.utils import write_json, utc_now
from evaluation.evaluators import (
    intent_eval,
    entity_eval,
    language_eval,
    rag_eval,
    response_length_eval,
    latency_eval,
    asr_wer_eval,
)
from evaluation import openapi_snapshot, report

EVALUATORS = {
    "intent": (intent_eval.run, "intent_top1_accuracy.json"),
    "entity": (entity_eval.run, "entity_micro_f1.json"),
    "language": (language_eval.run, "language_accuracy.json"),
    "rag": (rag_eval.run, "rag_precision_at_k.json"),
    "response_length": (response_length_eval.run, "response_length_compliance.json"),
    "latency": (latency_eval.run, "nlp_latency_ms.json"),
    "asr": (asr_wer_eval.run, "asr_wer.json"),
}


def _run_one(name: str) -> dict:
    fn, filename = EVALUATORS[name]
    try:
        record = fn()
    except Exception as exc:  # keep the suite resilient; record the failure
        record = {
            "metric": name,
            "timestamp": utc_now(),
            "status": "error",
            "error": f"{exc}",
            "traceback": traceback.format_exc(),
        }
    write_json(filename, record)
    return record


def main(argv: list[str]) -> int:
    selected = [a for a in argv if a not in ("all",)]
    if not selected:
        selected = list(EVALUATORS.keys()) + ["openapi"]

    records = []
    for name in selected:
        if name == "openapi":
            info = openapi_snapshot.generate()
            print(f"[openapi] snapshot -> {info['openapi_file']}")
            continue
        if name not in EVALUATORS:
            print(f"[warn] unknown evaluator '{name}', skipping")
            continue
        rec = _run_one(name)
        status = rec.get("status", "?")
        results = rec.get("results", {})
        headline = (
            results.get("top1_accuracy")
            or results.get("micro_f1")
            or results.get("accuracy")
            or results.get("mean_precision_at_k")
            or results.get("p95_ms")
            or results.get("overall_wer")
            or ("all_passed=" + str(results.get("all_passed")) if "all_passed" in results else "")
        )
        print(f"[{name}] status={status} {rec['metric']}={headline}")
        records.append(rec)

    # Always (re)build the report + summary if we ran any evaluator.
    if records:
        summary = report.build(records)
        print(f"\nReport:  {summary['report_file']}")
        print(f"Summary: {summary['summary_file']}")
        failed = [r["metric"] for r in records if r.get("status") in ("fail", "error")]
        if failed:
            print(f"\nNon-passing metrics: {failed}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
