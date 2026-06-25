"""
Shared helpers: IO, timestamps, evidence writers, and word-level WER.
"""
from __future__ import annotations

import csv
import json
import os
from datetime import datetime, timezone
from typing import Any, Dict, List

from evaluation import config


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def read_jsonl(path: str) -> List[dict]:
    rows: List[dict] = []
    if not os.path.exists(path):
        return rows
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def ensure_evidence_dir() -> str:
    os.makedirs(config.EVIDENCE_DIR, exist_ok=True)
    return config.EVIDENCE_DIR


def write_json(name: str, payload: Dict[str, Any]) -> str:
    ensure_evidence_dir()
    path = os.path.join(config.EVIDENCE_DIR, name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    return path


def write_csv(name: str, rows: List[Dict[str, Any]], fieldnames: List[str] = None) -> str:
    ensure_evidence_dir()
    path = os.path.join(config.EVIDENCE_DIR, name)
    if not rows:
        # Still create an (empty-with-header) file when fieldnames are known.
        with open(path, "w", encoding="utf-8", newline="") as f:
            if fieldnames:
                csv.DictWriter(f, fieldnames=fieldnames).writeheader()
        return path
    fieldnames = fieldnames or list(rows[0].keys())
    with open(path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for r in rows:
            writer.writerow(r)
    return path


def base_record(metric: str, command: str, dataset: Dict[str, Any],
                thresholds: Dict[str, Any], model_versions: Dict[str, Any]) -> Dict[str, Any]:
    """Common envelope so every metric carries full provenance."""
    return {
        "metric": metric,
        "timestamp": utc_now(),
        "command": command,
        "dataset": dataset,
        "thresholds": thresholds,
        "model_versions": model_versions,
        "suite_version": config.SUITE_VERSION,
    }


# --- Word-level WER (no external dependency) ------------------------------
def _tokenize(text: str) -> List[str]:
    return (text or "").strip().split()


def word_error_rate(reference: str, hypothesis: str) -> Dict[str, Any]:
    """Compute WER via word-level Levenshtein distance.

    Returns substitutions/insertions/deletions, the reference length, and WER.
    """
    ref = _tokenize(reference)
    hyp = _tokenize(hypothesis)
    n, m = len(ref), len(hyp)

    # DP table of edit operations.
    d = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n + 1):
        d[i][0] = i
    for j in range(m + 1):
        d[0][j] = j
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            cost = 0 if ref[i - 1] == hyp[j - 1] else 1
            d[i][j] = min(
                d[i - 1][j] + 1,        # deletion
                d[i][j - 1] + 1,        # insertion
                d[i - 1][j - 1] + cost  # substitution / match
            )

    # Backtrace to count S/I/D.
    i, j = n, m
    s = ins = dele = 0
    while i > 0 or j > 0:
        if i > 0 and j > 0 and ref[i - 1] == hyp[j - 1] and d[i][j] == d[i - 1][j - 1]:
            i, j = i - 1, j - 1
        elif i > 0 and j > 0 and d[i][j] == d[i - 1][j - 1] + 1:
            s += 1
            i, j = i - 1, j - 1
        elif j > 0 and d[i][j] == d[i][j - 1] + 1:
            ins += 1
            j -= 1
        else:
            dele += 1
            i -= 1

    errors = s + ins + dele
    wer = errors / n if n else (0.0 if m == 0 else 1.0)
    return {
        "ref_words": n,
        "substitutions": s,
        "insertions": ins,
        "deletions": dele,
        "errors": errors,
        "wer": round(wer, 4),
    }
