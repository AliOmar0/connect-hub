# Central Decision & Escalation Policy

One function decides everything. `DecisionEngine.evaluate` is the single
authority that turns a user message into exactly one `ActionDecision`, so
**WhatsApp, web chat, and voice receive the same answer / clarify / escalate
decision for the same input**. All bank facts and policy prompts live only in
this FastAPI layer.

## Modules

| Concern                                  | Module                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------- |
| Decision logic                           | `app/core/decision_engine.py` (`DecisionEngine`, `retrieve_with_audit`, `nlp_engine`) |
| Typed result                             | `app/models/decision.py` (`ActionDecision`, `DecisionResult`)                         |
| Canonical prompts + response validator   | `app/core/prompts.py` (`DecisionMessages`, `validate_response`)                       |
| Decision endpoint                        | `app/api/v1/decision.py` → `POST /api/v1/decision/evaluate`                           |
| Authoritative reply (decision + message) | `app/api/v1/assistant.py` → `POST /api/v1/assistant/reply`                            |

## Decision precedence

`evaluate(text, history, channel, session_id)` applies, in order:

1. **LLM safety** — prompt-injection detected → `BLOCK` (safe canonical message).
2. **Language confidence < 0.70** (or `requires_confirmation`) → `CLARIFY_LANGUAGE`.
3. **Explicit human-agent request** (keyword) → `ESCALATE` ("Explicit Agent Request").
4. **Low intent confidence** (`<= 0.60` or `fallback_triggered`) → `ESCALATE`
   ("Low Intent Confidence"). The comparison is `<=`, so **exactly 0.60**
   follows the low-confidence branch.
5. **High-risk / requires-escalation intent** (complaint, lost/stolen card,
   explicit escalation intent) → `ESCALATE` ("High Risk Intent (…)").
6. **Sensitive transaction** (local/international transfer) → `MOCK_TRANSACTION`
   — runs only in a sandbox; **never a live or invented transactional result**.
7. **No relevant KB document** (`retrieve_with_audit` fallback or empty)
   → `ESCALATE` ("No KB documents found").
8. Otherwise → `RESPOND` with grounded `top_documents`.

## `DecisionResult` (typed)

```
decision: ActionDecision
localized_message: str          # canonical, localized user-facing text
intent: IntentLabel
language: LanguageLabel
entities: [ {type, value(masked if sensitive), confidence, ...} ]
top_documents: [ {chunk_id, score, content} ]
scores: { intent_confidence, language_confidence, rag_top_score }
requires_confirmation: bool
fallback_triggered: bool
escalation_reason: str | null   # internal reason
escalation_summary: str | null  # <= 100 chars, PII-masked
```

## Endpoint contracts

### `POST /api/v1/decision/evaluate`

Request: `{ text, channel?, session_id?, history? }`
Response: masked `DecisionResult` (`safe_dict()`).

### `POST /api/v1/assistant/reply` (what channels call)

Request: `{ text, channel?, session_id?, history? }`
Response:

```
{ decision, message, escalate, intent, language,
  escalation_reason, escalation_summary, scores }
```

For `RESPOND`, `message` is the grounded LLM answer run through
`validate_response` (strips disallowed formatting, redacts leaked PII, enforces
word limit; voice gets a brevity/dialect style and a tighter limit). For every
other decision, `message` is the canonical localized policy text.

## Escalation summary guarantees

`DecisionEngine._generate_summary(message, reason)`:

- Replaces every PII match with a single `[REDACTED]` token (masked data only).
- Collapses whitespace and **caps the result at 100 characters**.

## Channel unification

- **WhatsApp / web chat / voice** all call `POST /api/v1/assistant/reply` (or
  `/decision/evaluate`) and act on the one returned decision.
- The Node voice server (`server/index.js`) no longer holds a system prompt or
  bank facts; `getAIResponse` delegates to the FastAPI endpoint. The orphaned
  duplicate `src/components/LLM.py` was removed.

## Sandbox / balance policy

Balance and account _information_ questions resolve to `RESPOND` grounded in the
knowledge base and never emit an actual balance value. Money movement (transfers)
resolves to `MOCK_TRANSACTION`. Real account/balance retrieval remains gated by
the existing OTP-verification flow in the webhook. Until an approved secure
sandbox exists and the SRS is updated, no live transactional result is produced.

## Tests

```bash
python -m pytest test/test_decision.py test/test_decision_boundaries.py -q
```

Boundary coverage: intent confidence exactly 0.60, sensitive-operation keywords
(mock, never live), explicit agent request, no relevant KB document, and the
escalation-summary length/masking guarantees. End-to-end checks run the real
NLP engine for the short-circuit paths (explicit escalate, mock transfer,
injection block).

## Acceptance evidence

| Criterion                                              | Evidence                                                                                | Status |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------- | ------ |
| Same policy decision across WhatsApp/web/voice         | All call `/assistant/reply`; voice server delegates, duplicates removed                 | PASS   |
| Sensitive requests never invent a transactional result | Transfers → `MOCK_TRANSACTION`; account info → grounded `RESPOND`; balance gated by OTP | PASS   |
| Escalation summary ≤ 100 chars, masked only            | `_generate_summary` masks PII + caps length (unit-tested)                               | PASS   |
| 0.60 confidence boundary                               | `<=` comparison, unit-tested                                                            | PASS   |
