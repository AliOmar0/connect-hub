# Intent Dataset — Data Card (v1.0.0)

## Provenance

Synthetically generated from curated bilingual templates (`generate_dataset.py`). No customer data is used. All identifiers in examples are fictitious.

## Generation

- Generator: `app/dataset/nlp/generate_dataset.py`
- RNG seed: `20260622` (fully reproducible)
- Examples per intent per language: 24
- Languages: MSA, Palestinian Levantine (LEVANTINE_PS), English
- Slot fillers: amounts, branches, products, dates

## Labels

- 15 canonical intents (closed set).

## Split (stratified by intent, seeded)

- total: 1080
- train: 750
- validation: 150
- test: 180

## Per-intent counts (train/val/test)

- ACCOUNT_INQUIRY: 50/10/12
- TRANSFER_LOCAL: 50/10/12
- TRANSFER_INTERNATIONAL: 50/10/12
- CARD_SERVICES: 50/10/12
- CARD_LOST_STOLEN: 50/10/12
- STATEMENT_REQUEST: 50/10/12
- FINANCING_INQUIRY: 50/10/12
- EXCHANGE_RATE: 50/10/12
- BRANCH_ATM_INFO: 50/10/12
- PRODUCT_INFO: 50/10/12
- SHARIA_INQUIRY: 50/10/12
- COMPLAINT: 50/10/12
- ESCALATION_REQUEST: 50/10/12
- GENERAL_INFO: 50/10/12
- UNKNOWN: 50/10/12

## Notes & limitations

- Template-based generation yields high lexical regularity; real traffic will be noisier. Treat reported metrics as an upper bound for the heuristic baseline and a sanity check for the fine-tuned model.
- For production, augment with de-identified real chat logs and re-balance accordingly, bumping `DATASET_VERSION`.
