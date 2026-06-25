# AI Evaluation Suite

Turns every claimed AI requirement into **repeatable evidence**: intent
accuracy, entity F1, language detection, RAG relevance, response-length
compliance, latency, and ASR WER — plus an OpenAPI snapshot. Every metric
produces a machine-readable JSON (and CSV where tabular) with a timestamp,
dataset description + size, model versions, thresholds, the exact command that
produced it, and a pass/fail/unavailable/pending status.

## Reproduce in a clean environment

```bash
# 1. Python 3.11+ and a fresh venv
python -m venv venv && . venv/Scripts/activate    # Windows
# source venv/bin/activate                         # Linux/macOS

# 2. Pinned dependencies (exact versions used to produce the evidence)
pip install -r evaluation/requirements-eval.txt          # light, cross-platform (core suite)
# pip install -r evaluation/requirements-lock.txt        # full environment freeze (exact)

# 3. (optional) regenerate the intent/entity datasets — deterministic (seeded)
python -m app.dataset.nlp.generate_dataset

# 4. Run the whole suite -> writes evaluation/evidence/
python -m evaluation.run_all

# Or a subset:
python -m evaluation.run_all intent entity language latency
python -m evaluation.run_all openapi
```

No secrets are required: the suite uses only local models/data and builds the
OpenAPI snapshot from the AI routers (no Supabase needed).

## Outputs (`evaluation/evidence/`)

| File                                                            | What                                                                       |
| --------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `report.md`                                                     | Human-readable report (summary table + per-metric details + limitations)   |
| `summary.json`                                                  | Machine-readable index: metric → status, file, timestamp, dataset, command |
| `intent_top1_accuracy.json` / `intent_confusion_matrix.csv`     | Intent accuracy + confusion matrix                                         |
| `entity_micro_f1.json` / `entity_per_type.csv`                  | Entity P/R/F1 per type + micro                                             |
| `language_accuracy.json` / `language_predictions.csv`           | Language accuracy + per-utterance predictions                              |
| `rag_precision_at_k.json` / `rag_precision.csv`                 | RAG precision@k (if KB indexed)                                            |
| `response_length_compliance.json` / `response_length_cases.csv` | Output validator limits                                                    |
| `nlp_latency_ms.json` / `latency_samples.csv`                   | NLP analyse latency (mean/p50/p95/max)                                     |
| `asr_wer.json` / `asr_wer_per_sample.csv`                       | ASR WER per sample/language (template until filled)                        |
| `openapi.json` / `api_examples.json`                            | OpenAPI snapshot of the AI surface + examples                              |

## Datasets

| Dataset       | Path                                           | Size | Languages                              |
| ------------- | ---------------------------------------------- | ---- | -------------------------------------- |
| Intent test   | `app/dataset/nlp/intents_test.jsonl`           | 180  | MSA, Levantine, English                |
| Entity gold   | `app/dataset/nlp/entities_test.jsonl`          | 25   | AR + EN (sensitive values pre-masked)  |
| Language gold | `evaluation/datasets/language_test.jsonl`      | 45   | 15 each: MSA / Levantine / English     |
| RAG relevance | `evaluation/datasets/rag_relevance.jsonl`      | 8    | AR banking queries + expected keywords |
| ASR manifest  | `evaluation/datasets/asr_samples_template.csv` | 9    | 3 each: MSA / Levantine / English      |

## Thresholds (SRS)

See `evaluation/config.py`. Intent top-1 ≥ 0.85, entity micro-F1 ≥ 0.80,
language accuracy ≥ 0.85, RAG precision@k ≥ 0.70, response ≤ 150 words
(voice ≤ 60), NLP p95 ≤ 1500 ms, ASR WER ≤ 0.25.

## ASR WER (coordinate with Person 2)

1. Copy `datasets/asr_samples_template.csv` to `datasets/asr_samples.csv`.
2. Place audio under `datasets/samples/{msa,ps,en}/` and fill
   `reference_transcript` (ground truth) and `hypothesis_transcript` (ASR output).
3. `python -m evaluation.run_all asr` → per-sample + per-language WER.

The three dialect buckets (MSA, Palestinian Levantine `LEVANTINE_PS`, English)
are kept distinct so WER is reported per language.

## Known limitations & future work

- Intent/entity metrics use **synthetic** template data (optimistic upper
  bound). Swap in de-identified production logs and bump the dataset version.
- **RAG** relevance needs `sentence-transformers` + an indexed Qdrant
  collection; otherwise it reports `unavailable` with reproduction steps (it is
  intentionally not in the lock file to keep the core suite light — install it
  and ingest the KB to produce this metric).
- **ASR WER** is `pending` until audio + hypotheses are supplied.
- **Latency** measures the local NLP stage only (no LLM/RAG network time) and
  varies by host hardware.
- A fine-tuned **AraBERT/CAMeL-BERT** checkpoint was not trained here; set
  `INTENT_MODEL_PATH` and re-run to record fine-tuned figures.
