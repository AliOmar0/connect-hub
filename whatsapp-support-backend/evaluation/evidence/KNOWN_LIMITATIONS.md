# Known Limitations & Future Work

This note accompanies the AI evidence folder and records every target that is
not fully met in the current environment, why, and how to close it.

## Missed / partial targets

| Target                                       | Status                | Reason                                                                                     | How to close it                                                                                                                                                                                 |
| -------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RAG relevance (precision@k ≥ 0.70)           | **N/A (unavailable)** | `sentence-transformers` not installed and no Qdrant collection indexed in this environment | `pip install sentence-transformers`, set `QDRANT_*`, ingest the KB (`POST /api/v1/knowledge-base/upload` or index `app/dataset/bank_dataset_web.json`), then `python -m evaluation.run_all rag` |
| ASR WER (≤ 0.25, per language)               | **PENDING**           | Audio + ASR hypotheses not yet provided                                                    | Person 2 fills `evaluation/datasets/asr_samples.csv` (MSA / Palestinian Levantine / English) with reference + hypothesis transcripts; re-run `python -m evaluation.run_all asr`                 |
| Fine-tuned intent model (AraBERT/CAMeL-BERT) | **Not trained here**  | No GPU / model download in this environment; heuristic baseline reported instead           | Train via `scripts/train_intent_classifier.py`, set `INTENT_MODEL_PATH`, re-run `python -m evaluation.run_all intent`                                                                           |

## Caveats on passing metrics

- **Intent (91.67%) and entity (100%) F1** run on **synthetic, template-generated**
  data with train/test lexical overlap — an optimistic upper bound, not a
  population estimate. Replace with de-identified production chat logs and bump
  the dataset version for a realistic figure.
- **Language detection (97.78%)** uses a colloquial-marker lexicon for MSA vs
  Palestinian Levantine; code-switched or very short messages get low confidence
  by design and trigger the confirmation branch.
- **Latency** measures the local NLP stage only (CPU). End-to-end latency
  including the OpenRouter LLM and Qdrant RAG is out of scope here and varies by
  host hardware and provider.

## Future work

- Add an end-to-end latency probe (NLP → decision → RAG → LLM) behind a flag.
- Expand the entity gold set and add human-judged RAG relevance labels.
- Add adversarial/prompt-injection evaluation cases for the decision `BLOCK` path.
- Schedule the AI Pipeline CI workflow to publish the evidence artifact per release.
