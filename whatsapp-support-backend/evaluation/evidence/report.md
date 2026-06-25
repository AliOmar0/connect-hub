# AI Evaluation Report

Generated: 2026-06-22T09:35:22Z | Suite version: 1.0.0

Each metric below has a machine-readable evidence file, a timestamp, the dataset it ran on, and the exact command that produced it.

## Summary

| Metric                     | Status  | Headline                        | Dataset (size)               | Evidence file                     | Command                                        |
| -------------------------- | ------- | ------------------------------- | ---------------------------- | --------------------------------- | ---------------------------------------------- |
| intent_top1_accuracy       | PASS    | 91.67% top-1 accuracy           | intents_test.jsonl (180)     | `intent_top1_accuracy.json`       | `python -m evaluation.run_all intent`          |
| entity_micro_f1            | PASS    | 100.00% micro-F1                | entities_test.jsonl (25)     | `entity_micro_f1.json`            | `python -m evaluation.run_all entity`          |
| language_accuracy          | PASS    | 97.78% accuracy                 | language_test.jsonl (45)     | `language_accuracy.json`          | `python -m evaluation.run_all language`        |
| rag_precision_at_k         | N/A     | unavailable in this environment | rag_relevance.jsonl (8)      | `rag_precision_at_k.json`         | `python -m evaluation.run_all rag`             |
| response_length_compliance | PASS    | all cases passed                | synthetic_response_cases (4) | `response_length_compliance.json` | `python -m evaluation.run_all response_length` |
| nlp_latency_ms             | PASS    | p95 0.296 ms (mean 0.214 ms)    | intents_test.jsonl (180)     | `nlp_latency_ms.json`             | `python -m evaluation.run_all latency`         |
| asr_wer                    | PENDING | pending samples                 | asr_samples_template.csv (9) | `asr_wer.json`                    | `python -m evaluation.run_all asr`             |

## Details

### intent_top1_accuracy — PASS

- Timestamp: 2026-06-22T09:35:22Z
- Command: `python -m evaluation.run_all intent`
- Dataset: intents_test.jsonl — size 180 — Held-out intent test split (MSA + Palestinian Levantine + English) over 15 canonical intents.
- Model versions: {"intent_model": "heuristic-intent-1.2.0"}
- Thresholds: {"top1_accuracy": 0.85}
- Results: {"top1_accuracy": 0.9167, "macro_f1": 0.917, "weighted_f1": 0.917, "confusion_matrix_file": "intent_confusion_matrix.csv"}
- Limitations: Synthetic, template-generated data; lexical overlap between train/test makes this an optimistic upper bound vs production traffic.

### entity_micro_f1 — PASS

- Timestamp: 2026-06-22T09:35:22Z
- Command: `python -m evaluation.run_all entity`
- Dataset: entities_test.jsonl — size 25 — Curated entity gold set (8 entity types, AR+EN), sensitive values pre-masked.
- Model versions: {"entity_extractor": "rule-ner-1.2.0"}
- Thresholds: {"micro_f1": 0.8}
- Results: {"micro_precision": 1.0, "micro_recall": 1.0, "micro_f1": 1.0, "per_type_file": "entity_per_type.csv"}
- Limitations: Small curated gold set (sanity check, not a population estimate). Rule-based extraction; rare surface forms may be missed.

### language_accuracy — PASS

- Timestamp: 2026-06-22T09:35:22Z
- Command: `python -m evaluation.run_all language`
- Dataset: language_test.jsonl — size 45 — Balanced language gold set: MSA, Palestinian Levantine, English banking utterances.
- Model versions: {"language_model": "lexicon-langid-1.0.0"}
- Thresholds: {"accuracy": 0.85, "confirm_threshold": 0.7}
- Results: {"accuracy": 0.9778, "below_confirm_threshold_count": 0, "below_confirm_threshold_rate": 0.0, "predictions_file": "language_predictions.csv"}
- Limitations: MSA vs Palestinian Levantine relies on a colloquial-marker lexicon; code-switched or very short messages yield low confidence by design (triggering the confirmation branch).

### rag_precision_at_k — N/A

- Timestamp: 2026-06-22T09:35:22Z
- Command: `python -m evaluation.run_all rag`
- Dataset: rag_relevance.jsonl — size 8 — Banking queries with expected-keyword relevance labels.
- Model versions: {"embedding_model": "paraphrase-multilingual-MiniLM-L12-v2"}
- Thresholds: {"precision_at_k": 0.7}
- Results: {"available": false}
- Limitations: sentence-transformers is not installed. To produce this metric: install sentence-transformers, set QDRANT\_\* env, ingest the KB via POST /api/v1/knowledge-base/upload (or index app/dataset/bank_dataset_web.json), then re-run.

### response_length_compliance — PASS

- Timestamp: 2026-06-22T09:35:22Z
- Command: `python -m evaluation.run_all response_length`
- Dataset: synthetic_response_cases — size 4 — Synthetic long/formatted inputs exercising the output validators (AR+EN, voice + text).
- Model versions: {"validator": "prompts.validate_response", "kb_limit": "rag.enforce_word_limit"}
- Thresholds: {"response_max_words": 150, "response_voice_max_words": 60, "kb_word_limit": 150}
- Results: {"all_passed": true, "cases_file": "response_length_cases.csv"}
- Limitations: Validates the enforcement layer, not LLM verbosity directly; the LLM is also instructed to be concise but its raw output is always capped here.

### nlp_latency_ms — PASS

- Timestamp: 2026-06-22T09:35:22Z
- Command: `python -m evaluation.run_all latency`
- Dataset: intents_test.jsonl — size 180 — Latency of nlp_engine.analyze per message over the intent test set.
- Model versions: {"intent_model": "heuristic-intent-1.2.0"}
- Thresholds: {"p95_ms": 1500.0}
- Results: {"mean_ms": 0.214, "p50_ms": 0.203, "p95_ms": 0.296, "max_ms": 0.335, "samples_file": "latency_samples.csv"}
- Limitations: Measures the local NLP stage only (CPU). End-to-end latency including OpenRouter LLM and Qdrant RAG depends on network/model and is not captured here. Numbers vary with host hardware.

### asr_wer — PENDING

- Timestamp: 2026-06-22T09:35:22Z
- Command: `python -m evaluation.run_all asr`
- Dataset: asr_samples_template.csv — size 9 — ASR manifest with reference + hypothesis transcripts across MSA, Palestinian Levantine, English.
- Model versions: {"asr_engine": "TBD (coordinate with Person 2)", "wer_method": "word-level Levenshtein (utils.word_error_rate)"}
- Thresholds: {"wer_max": 0.25}
- Results: {"overall_wer": null, "per_sample_file": "asr_wer_per_sample.csv"}
- Limitations: Template/partial until Person 2 supplies audio + ASR hypotheses. WER is whitespace-tokenised; Arabic orthographic normalisation (e.g. alef/ya variants) is not applied to references/hypotheses here.

## Known limitations & future work

- Intent/entity metrics use synthetic, template-generated data; treat as an optimistic upper bound. Replace with de-identified production logs and bump the dataset version for a population estimate.
- RAG relevance requires sentence-transformers + an indexed Qdrant collection; when unavailable the metric is reported as `N/A` with reproduction steps rather than skipped silently.
- ASR WER is template-driven and remains `PENDING` until Person 2 supplies audio + ASR hypotheses for MSA, Palestinian Levantine, and English.
- Latency covers the local NLP stage only; LLM/RAG network latency is not included and varies by host and provider.
- A fine-tuned AraBERT/CAMeL-BERT intent checkpoint was not trained in this environment; the heuristic baseline is reported. Set `INTENT_MODEL_PATH` to a trained checkpoint and re-run to record the fine-tuned figures.
