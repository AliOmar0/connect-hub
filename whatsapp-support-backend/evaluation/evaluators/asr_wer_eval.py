"""
ASR Word-Error-Rate evaluation (template-driven).

Reads the ASR manifest CSV (coordinate with Person 2 for audio + transcripts),
computes WER per sample and per language (MSA / Palestinian Levantine / English)
for every row that has BOTH a reference and a hypothesis transcript, and reports
which samples are still pending.

The manifest template lives at ``evaluation/datasets/asr_samples_template.csv``.
Copy it to ``asr_samples.csv``, fill in ``hypothesis_transcript`` from the ASR
engine, and re-run. WER computation is dependency-free (word-level Levenshtein).
"""
from __future__ import annotations

import csv
import os

from evaluation import config
from evaluation.utils import base_record, write_csv, word_error_rate

COMMAND = "python -m evaluation.run_all asr"
FILLED_MANIFEST = os.path.join(config.EVAL_DATASETS_DIR, "asr_samples.csv")


def _load_manifest() -> tuple[list[dict], str]:
    path = FILLED_MANIFEST if os.path.exists(FILLED_MANIFEST) else config.ASR_TEMPLATE
    rows = []
    with open(path, "r", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            rows.append(row)
    return rows, path


def run() -> dict:
    rows, path = _load_manifest()

    per_lang = {}
    scored_rows = []
    pending = []
    total_errors = total_words = 0

    for r in rows:
        ref = (r.get("reference_transcript") or "").strip()
        hyp = (r.get("hypothesis_transcript") or "").strip()
        lang = (r.get("language") or "UNKNOWN").strip()
        if not ref or not hyp:
            pending.append(r.get("sample_id", "?"))
            continue
        m = word_error_rate(ref, hyp)
        scored_rows.append({
            "sample_id": r.get("sample_id", "?"), "language": lang,
            "ref_words": m["ref_words"], "errors": m["errors"], "wer": m["wer"],
        })
        agg = per_lang.setdefault(lang, {"errors": 0, "words": 0, "samples": 0})
        agg["errors"] += m["errors"]
        agg["words"] += m["ref_words"]
        agg["samples"] += 1
        total_errors += m["errors"]
        total_words += m["ref_words"]

    for lang, agg in per_lang.items():
        agg["wer"] = round(agg["errors"] / agg["words"], 4) if agg["words"] else None

    overall_wer = round(total_errors / total_words, 4) if total_words else None

    write_csv("asr_wer_per_sample.csv", scored_rows,
              ["sample_id", "language", "ref_words", "errors", "wer"])

    threshold = config.THRESHOLDS["asr_wer_max"]
    record = base_record(
        metric="asr_wer",
        command=COMMAND,
        dataset={
            "name": os.path.basename(path),
            "path": os.path.relpath(path, config.BACKEND_ROOT),
            "size": len(rows),
            "scored": len(scored_rows),
            "pending": len(pending),
            "description": "ASR manifest with reference + hypothesis transcripts across MSA, Palestinian Levantine, English.",
        },
        thresholds={"wer_max": threshold},
        model_versions={"asr_engine": "TBD (coordinate with Person 2)",
                        "wer_method": "word-level Levenshtein (utils.word_error_rate)"},
    )
    record["results"] = {
        "overall_wer": overall_wer,
        "per_language": per_lang,
        "pending_samples": pending,
        "per_sample_file": "asr_wer_per_sample.csv",
    }
    if not scored_rows:
        record["status"] = "pending"
    elif overall_wer is not None and overall_wer <= threshold:
        record["status"] = "pass"
    else:
        record["status"] = "fail"
    record["limitations"] = (
        "Template/partial until Person 2 supplies audio + ASR hypotheses. WER is "
        "whitespace-tokenised; Arabic orthographic normalisation (e.g. alef/ya "
        "variants) is not applied to references/hypotheses here."
    )
    return record
