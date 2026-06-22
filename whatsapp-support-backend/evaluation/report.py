"""
Build the human-readable evidence report (report.md) and a machine-readable
summary.json from the per-metric evidence records.
"""
from __future__ import annotations

import json
import os
from typing import Any, Dict, List

from evaluation import config
from evaluation.utils import ensure_evidence_dir, utc_now

_STATUS_ICON = {"pass": "PASS", "fail": "FAIL", "unavailable": "N/A",
                "pending": "PENDING", "error": "ERROR"}


def _headline(rec: Dict[str, Any]) -> str:
    r = rec.get("results", {})
    m = rec.get("metric", "")
    if "top1_accuracy" in r:
        return f"{r['top1_accuracy']:.2%} top-1 accuracy"
    if "micro_f1" in r:
        return f"{r['micro_f1']:.2%} micro-F1"
    if "accuracy" in r:
        return f"{r['accuracy']:.2%} accuracy"
    if "mean_precision_at_k" in r:
        return f"{r['mean_precision_at_k']:.2%} precision@k"
    if "p95_ms" in r:
        return f"p95 {r['p95_ms']} ms (mean {r.get('mean_ms')} ms)"
    if "overall_wer" in r:
        return f"WER {r['overall_wer']}" if r.get("overall_wer") is not None else "pending samples"
    if "all_passed" in r:
        return "all cases passed" if r["all_passed"] else "some cases failed"
    if r.get("available") is False:
        return "unavailable in this environment"
    return ""


def build(records: List[Dict[str, Any]]) -> Dict[str, str]:
    ensure_evidence_dir()

    summary = {
        "generated_at": utc_now(),
        "suite_version": config.SUITE_VERSION,
        "metrics": [
            {
                "metric": rec.get("metric"),
                "status": rec.get("status"),
                "file": _evidence_file_for(rec),
                "timestamp": rec.get("timestamp"),
                "dataset": rec.get("dataset", {}).get("name"),
                "dataset_size": rec.get("dataset", {}).get("size"),
                "command": rec.get("command"),
                "headline": _headline(rec),
            }
            for rec in records
        ],
    }
    summary_path = os.path.join(config.EVIDENCE_DIR, "summary.json")
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    report_path = os.path.join(config.EVIDENCE_DIR, "report.md")
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(_render_markdown(records, summary))

    return {"report_file": report_path, "summary_file": summary_path}


def _evidence_file_for(rec: Dict[str, Any]) -> str:
    metric = rec.get("metric", "")
    mapping = {
        "intent_top1_accuracy": "intent_top1_accuracy.json",
        "entity_micro_f1": "entity_micro_f1.json",
        "language_accuracy": "language_accuracy.json",
        "rag_precision_at_k": "rag_precision_at_k.json",
        "response_length_compliance": "response_length_compliance.json",
        "nlp_latency_ms": "nlp_latency_ms.json",
        "asr_wer": "asr_wer.json",
    }
    return mapping.get(metric, f"{metric}.json")


def _render_markdown(records: List[Dict[str, Any]], summary: Dict[str, Any]) -> str:
    lines = [
        "# AI Evaluation Report",
        "",
        f"Generated: {summary['generated_at']}  |  Suite version: {config.SUITE_VERSION}",
        "",
        "Each metric below has a machine-readable evidence file, a timestamp, the "
        "dataset it ran on, and the exact command that produced it.",
        "",
        "## Summary",
        "",
        "| Metric | Status | Headline | Dataset (size) | Evidence file | Command |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for rec in records:
        ds = rec.get("dataset", {})
        lines.append(
            f"| {rec.get('metric')} | {_STATUS_ICON.get(rec.get('status'), rec.get('status'))} "
            f"| {_headline(rec)} | {ds.get('name')} ({ds.get('size')}) "
            f"| `{_evidence_file_for(rec)}` | `{rec.get('command', '')}` |"
        )

    lines += ["", "## Details", ""]
    for rec in records:
        lines.append(f"### {rec.get('metric')}  —  {_STATUS_ICON.get(rec.get('status'), rec.get('status'))}")
        lines.append("")
        lines.append(f"- Timestamp: {rec.get('timestamp')}")
        lines.append(f"- Command: `{rec.get('command', '')}`")
        ds = rec.get("dataset", {})
        lines.append(f"- Dataset: {ds.get('name')} — size {ds.get('size')} — {ds.get('description', '')}")
        if rec.get("model_versions"):
            lines.append(f"- Model versions: {json.dumps(rec['model_versions'], ensure_ascii=False)}")
        if rec.get("thresholds"):
            lines.append(f"- Thresholds: {json.dumps(rec['thresholds'], ensure_ascii=False)}")
        res = rec.get("results", {})
        if res:
            # Show a trimmed view (skip large nested dicts/files inline).
            trimmed = {k: v for k, v in res.items()
                       if not isinstance(v, (dict, list)) or k.endswith("file")}
            lines.append(f"- Results: {json.dumps(trimmed, ensure_ascii=False)}")
        if rec.get("limitations"):
            lines.append(f"- Limitations: {rec['limitations']}")
        if rec.get("error"):
            lines.append(f"- Error: {rec['error']}")
        lines.append("")

    lines += [
        "## Known limitations & future work",
        "",
        "- Intent/entity metrics use synthetic, template-generated data; treat as "
        "an optimistic upper bound. Replace with de-identified production logs and "
        "bump the dataset version for a population estimate.",
        "- RAG relevance requires sentence-transformers + an indexed Qdrant "
        "collection; when unavailable the metric is reported as `N/A` with "
        "reproduction steps rather than skipped silently.",
        "- ASR WER is template-driven and remains `PENDING` until Person 2 supplies "
        "audio + ASR hypotheses for MSA, Palestinian Levantine, and English.",
        "- Latency covers the local NLP stage only; LLM/RAG network latency is not "
        "included and varies by host and provider.",
        "- A fine-tuned AraBERT/CAMeL-BERT intent checkpoint was not trained in "
        "this environment; the heuristic baseline is reported. Set "
        "`INTENT_MODEL_PATH` to a trained checkpoint and re-run to record the "
        "fine-tuned figures.",
        "",
    ]
    return "\n".join(lines)
