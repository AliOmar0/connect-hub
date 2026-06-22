"""
Central configuration for the evaluation suite: paths, thresholds, versions.
"""
from __future__ import annotations

import os

# --- Paths ----------------------------------------------------------------
HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND_ROOT = os.path.dirname(HERE)
NLP_DATA_DIR = os.path.join(BACKEND_ROOT, "app", "dataset", "nlp")
EVAL_DATASETS_DIR = os.path.join(HERE, "datasets")
EVIDENCE_DIR = os.path.join(HERE, "evidence")

# Datasets (shared with the NLP pipeline where they already exist).
INTENT_TEST = os.path.join(NLP_DATA_DIR, "intents_test.jsonl")
ENTITY_TEST = os.path.join(NLP_DATA_DIR, "entities_test.jsonl")
LANGUAGE_TEST = os.path.join(EVAL_DATASETS_DIR, "language_test.jsonl")
RAG_TEST = os.path.join(EVAL_DATASETS_DIR, "rag_relevance.jsonl")
ASR_TEMPLATE = os.path.join(EVAL_DATASETS_DIR, "asr_samples_template.csv")

# --- Acceptance thresholds (SRS) -----------------------------------------
THRESHOLDS = {
    "intent_top1_accuracy": 0.85,
    "entity_micro_f1": 0.80,
    "language_accuracy": 0.85,
    "rag_precision_at_k": 0.70,
    "response_max_words": 150,
    "response_voice_max_words": 60,
    "latency_p95_ms": 1500.0,   # NLP analyse p95 budget (CPU, no network)
    "asr_wer_max": 0.25,        # target WER (per language)
}

# Language confirmation threshold (mirrors the NLP layer).
LANGUAGE_CONFIRM_THRESHOLD = 0.70

# Report metadata.
EVIDENCE_README = "README.md"
SUITE_VERSION = "1.0.0"
