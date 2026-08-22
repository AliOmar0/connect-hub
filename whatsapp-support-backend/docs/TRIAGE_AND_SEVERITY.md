# Triage & Severity Routing

Understanding what the customer needs on the WhatsApp path, and routing on how
urgent it is.

## The problem this solves

Routing on WhatsApp was ~15 hardcoded keywords (`is_critical_request` in
`app/core/bank/intents.py`), plus a complaint matcher that required the literal
word "شكوى". A customer writing **"الصراف بلع بطاقتي في فرع رام الله"** matched
none of them, fell through to the free-text LLM, and — when a provider
hiccuped — read `"نعتذر، لم أتمكن من معالجة طلبك حالياً."` as though it were an
answer. The session stayed `active`, no staff member was notified, and the
customer was at a dead end.

## Modules

| Concern                      | Module                                                                   |
| ---------------------------- | ------------------------------------------------------------------------ |
| Typed result + `Severity`    | `app/core/triage/schema.py`                                              |
| LLM classifier (JSON)        | `app/core/triage/classifier.py` (`triage`, `rules_only`)                 |
| Deterministic severity floor | `app/core/triage/rules.py` (`lexicon_severity`, `apply_severity_floor`)  |
| Routing                      | `app/api/v1/webhook.py::process_ai_response`, the `else` branch          |
| Pre-filled intake            | `app/core/complaints/flow.py` (`start_prefilled`, `first_unfilled_slot`) |

## Severity → what happens

| Severity   | Meaning                                                                             | Action                                                                                                            |
| ---------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `critical` | Fraud, theft, compromised account, money moving now                                 | Escalate immediately. **No intake form.** Notification titled "🚨 Critical Incident"                              |
| `high`     | Concrete loss or blocked asset (ATM captured card, double debit, transfer vanished) | Open a pre-filled complaint, save it, **then** escalate — the reference number alone does not get their card back |
| `medium`   | Genuine dissatisfaction, nothing at risk                                            | Open a complaint, give the reference number. No escalation                                                        |
| `low`      | An ordinary question                                                                | The assistant answers normally                                                                                    |

## Two-layer understanding

**The model proposes; the lexicon sets a floor.**

`apply_severity_floor` takes `max(llm_severity, lexicon_severity)`. The lexicon
can _raise_ a severity the model under-rated; it can never _lower_ one. Two
reasons:

1. Fraud and theft are exactly where a classifier outage is least acceptable.
   The lexicons need no network, so "حدا سحب من حسابي بدون علمي" reaches a human
   even with every provider down.
2. A keyword list is blunt. It must not overrule a model that understood more
   context than a substring match could.

`triage()` **never raises**. Any failure — provider down, malformed JSON, prose
instead of an object — returns `rules_only(text)`. Triage improves routing; it is
never the reason a message goes unanswered.

## Invariants that are NOT negotiable

Triage sits **below** the security boundaries, not above them. In the `else`
branch the order is:

```
is_critical_request        → escalate          (unchanged)
match_account_intent       → identity request  (unchanged, see the guard below)
mentions_unavailable_field → canned reply      (unchanged)
mentions_complaint_followup→ escalate          (unchanged)
triage()                   → severity routing  ← new, last
```

- **Account data never reaches any model**, triage included: `_recent_history()`
  applies the same `PROTECTED_PREFIX` scrub as the assistant path.
- **Model output never initiates a verification or an OTP.** The one new gate on
  that path — `incident_report` — uses `lexicon_severity`, _not_ the model, and
  can only ever _withhold_ account data, never grant it.
- Complaints are written by the backend service-role key only. No INSERT policy
  exists on the table.

### The `incident_report` guard

"الصراف بلع بطاقتي" trips `match_account_intent` — "بطاقتي" is both a personal
marker and a `CARDS` field keyword — so a customer reporting a captured card was
asked for their national ID to look up card details they never requested. A
deterministic `lexicon_severity(...) >= HIGH` check now skips that branch for
incident reports.

## Fewer questions

`start_prefilled` opens the intake at the first slot triage could **not** fill,
and `advance()` skips filled slots. Slot order is
`category → description → location → identity → contact → confirm`;
`location` is asked only for `cards`/`service` and only when unknown.

> "الصراف بلع بطاقتي في فرع رام الله" → category `cards`, location "فرع رام الله",
> severity `high`, description from their own words → asks only **identity** and
> **confirm**. Two turns instead of five.

A bare "بدي أقدم شكوى" is a _request to file_, not a description — the intake
still asks what happened (`describes_an_incident` in
`app/core/complaints/intents.py`).

## LLM failure is a handover, not an apology

`LLMService.get_ai_response` now raises `LLMUnavailable` instead of returning
apology text. Also fixed in `_chat_completion_or_raise`:

- **Cross-provider failover.** DeepSeek → OpenRouter (and back). There was none:
  a DeepSeek outage produced an apology even with a healthy OpenRouter key in the
  same `.env`.
- **5xx retries.** Only 429 retried before; a 502 went straight to the apology.
- **Structured logs.** Failure sites now pass `extra={"data": {...}}`, which
  `app/core/logger.py`'s `JsonFormatter` promotes into the record. Previously
  _zero_ call sites in the repo used it, and the two most common fallbacks logged
  nothing at all.

The WhatsApp path catches `LLMUnavailable` and calls `_escalate(...)`: the
customer is told a human is taking over, the session flips to `escalated`, and
staff are notified.

## Tests

```bash
python -m pytest tests/test_triage.py tests/test_functional.py -q
```

`tests/test_triage.py` covers the severity ordering trap (`Severity` subclasses
`str`, whose comparisons are alphabetical — `"low" > "high"`), the lexicon floor,
classifier fallbacks, the raise-only rule, all four routes end-to-end, and
provider failover.
