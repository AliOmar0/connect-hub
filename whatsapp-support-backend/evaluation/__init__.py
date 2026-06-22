"""
AI evaluation package.

Turns each claimed AI requirement (intent accuracy, entity F1, RAG relevance,
language detection, response-length compliance, latency, and ASR WER) into
repeatable, machine-readable evidence plus a human-readable report.

Run everything:
    python -m evaluation.run_all

Each evaluator emits a JSON (and CSV where tabular) artefact under
``evaluation/evidence/`` carrying the metric value, timestamp, dataset
description + size, model versions, thresholds, the exact command that produced
it, pass/fail status, and any limitations.
"""

__all__ = ["config"]
