# Intent, Language & Entity NLP Pipeline

Produces a structured, confidence-scored NLP result for every inbound message
**before** any response generation. The result drives the downstream decision /
escalation logic.

## Components

| Concern                 | Module                              | Output                                                                       |
| ----------------------- | ----------------------------------- | ---------------------------------------------------------------------------- |
| Canonical schemas       | `app/models/nlp.py`                 | `IntentLabel` (15), `LanguageLabel`, `EntityType` (8), `Entity`, `NLPResult` |
| Language detection      | `app/core/nlp/language_detect.py`   | label + confidence + model version                                           |
| Intent classification   | `app/core/nlp/intent_classifier.py` | label + probability + model version + inference time                         |
| Entity extraction       | `app/core/nlp/entity_extraction.py` | normalised, masked entities                                                  |
| Normalisation & masking | `app/core/nlp/normalize.py`         | canonical values, masked identifiers                                         |
| Orchestration           | `app/core/nlp/engine.py`            | `nlp_engine.analyze(text) -> NLPResult`                                      |
| Service API             | `app/api/v1/nlp.py`                 | `POST /api/v1/nlp/analyze`, `GET /api/v1/nlp/labels`                         |

The `nlp_engine` singleton is what the decision engine consumes
(`from app.core.nlp.engine import nlp_engine`).

## Canonical labels

### 15 intents (closed set)

`ACCOUNT_INQUIRY`, `TRANSFER_LOCAL`, `TRANSFER_INTERNATIONAL`, `CARD_SERVICES`,
`CARD_LOST_STOLEN`, `STATEMENT_REQUEST`, `FINANCING_INQUIRY`, `EXCHANGE_RATE`,
`BRANCH_ATM_INFO`, `PRODUCT_INFO`, `SHARIA_INQUIRY`, `COMPLAINT`,
`ESCALATION_REQUEST`, `GENERAL_INFO`, `UNKNOWN`.

Unregistered labels are impossible to emit: classifier output is passed through
`IntentLabel.coerce`, which maps anything outside the set to `UNKNOWN`, and
`NLPResult` re-validates the label.

### Languages

`MSA`, `LEVANTINE_PS` (Palestinian Levantine), `ENGLISH`, `UNKNOWN`.

### 8 entities

`AMOUNT`, `DATE`, `CARD_TYPE`, `BRANCH_NAME`, `ACCOUNT_ID`, `TRANSACTION_ID`,
`PRODUCT_NAME`, `USER_INTENT`.

## SRS decision branches

- **Language confidence < 0.70** → `requires_confirmation = True`
  (`LANGUAGE_CONFIRM_THRESHOLD`). The caller must ask the user to confirm the
  language before continuing.
- **Intent confidence ≤ 0.60** → `fallback_triggered = True`
  (`INTENT_LOW_CONFIDENCE_THRESHOLD`). The comparison is `<=`, so a confidence
  of **exactly 0.60 follows the low-confidence branch**, as required.

## Masking / privacy

Sensitive identifiers (`ACCOUNT_ID`, `TRANSACTION_ID`, card numbers, IBAN) are
masked inside the NLP layer. `Entity.display_value()` and `NLPResult.safe_dict()`
never expose raw values, and the API returns `safe_dict()` only. `USER_INTENT`
is additionally passed through the existing PII redactor.

## Intent model: transformer + fallback

`build_intent_classifier` returns a fine-tuned **AraBERT / CAMeL-BERT**
classifier when `INTENT_MODEL_PATH` points at a loadable checkpoint; otherwise it
returns the dependency-free **heuristic** classifier (weighted keyword lexicon +
softmax confidence, with Arabic clitic normalisation). The same interface and
`NLPResult` are produced either way.

Train the transformer model:

```bash
pip install "transformers>=4.38" "datasets>=2.16" accelerate torch scikit-learn
python -m app.dataset.nlp.generate_dataset      # build/refresh the dataset
python -m scripts.train_intent_classifier \
    --base aubmindlab/bert-base-arabertv2 --epochs 5 --out ./models/intent-arabert
# activate it:
export INTENT_MODEL_PATH=./models/intent-arabert   # (Windows: set INTENT_MODEL_PATH=...)
python -m scripts.eval_nlp
```

## Datasets

- Generator: `app/dataset/nlp/generate_dataset.py` (seed `20260622`, reproducible).
- Splits: `intents_{train,val,test}.jsonl` (stratified 70/15/15).
- Entity gold set: `app/dataset/nlp/entities_test.jsonl`.
- Data card / generation notes & per-intent counts: `app/dataset/nlp/DATA_CARD.md`.

Languages are balanced across MSA, Palestinian Levantine, and English.

## Evaluation & reports

```bash
python -m scripts.eval_nlp
```

writes to `app/dataset/nlp/reports/`:

- `intent_metrics.json` — top-1 accuracy, macro/weighted P/R/F1, per-label.
- `confusion_matrix.csv` — gold (rows) × predicted (cols).
- `entity_metrics.json` — per-type and micro precision/recall/F1.

## Acceptance evidence

Measured on the held-out test sets with the **heuristic baseline** (no
fine-tuned checkpoint present in this environment):

| Criterion                                       | Threshold | Result                              | Status |
| ----------------------------------------------- | --------- | ----------------------------------- | ------ |
| Intent top-1 accuracy                           | ≥ 85%     | **91.67%** (macro-F1 0.917)         | PASS   |
| Entity F1                                       | ≥ 80%     | **100%** micro-F1 (P 1.00 / R 1.00) | PASS   |
| Confidence exactly 0.60 → low-confidence branch | required  | enforced via `<=` (unit-tested)     | PASS   |
| Language confidence < 0.70 → confirmation       | required  | enforced (unit-tested)              | PASS   |

### Honest limitations

- These numbers are on **synthetic, template-generated** data, so they are an
  optimistic upper bound rather than production traffic performance. The
  template vocabulary overlaps between train and test by construction.
- The shipped runtime model here is the **heuristic** classifier. The
  fine-tuned AraBERT/CAMeL-BERT path (`scripts/train_intent_classifier.py`) is
  provided and wired in, but a trained checkpoint was **not produced in this
  environment** (no GPU / model download). Re-run the training + eval on a
  training box and commit the resulting `intent_metrics.json` to record the
  fine-tuned figures.
- For production readiness, augment the dataset with de-identified real chat
  logs, re-balance, bump `DATASET_VERSION`, and re-evaluate. Treat the entity
  F1 of 100% as a sanity check on a small curated gold set (25 messages), not a
  population estimate.

## Tests

`test/test_nlp.py` covers schema/registry rules, all three sub-services, the
engine, masking, and the two SRS confidence branches:

```bash
python -m pytest test/test_nlp.py -q
```
