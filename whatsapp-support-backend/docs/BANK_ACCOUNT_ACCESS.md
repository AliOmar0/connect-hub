# Bank account access (Bank_db_oss)

How the assistant answers "what's my balance?" — and why it is built this way.

## The two invariants

1. **The bank's `customers`/`accounts` tables are read-only.** Not "we don't write to them" — the database
   refuses writes, and the client is structurally incapable of sending one.
2. **Account data never enters the LLM prompt.** No model sees a balance or an
   account number, on any turn, ever. One documented exception: the voice
   channel, where the `/tools/account-info` result goes to ElevenLabs' hosted
   model so it can be spoken aloud (`app/api/v1/voice_agent.py`).

## The schema this targets

Verified against the live bank project over PostgREST. **"Columns used" is
not "columns that exist"** -- this table only lists what these scripts touch;
`scripts/sql/bankdboss.sql` (a full catalog export) has the real, larger
column list. Treating this table as exhaustive is exactly what produced the
stale "no date_of_birth column" claim once carried in
`scripts/sql/bank_db_oss_identity_lookup.sql`'s header -- don't repeat that
mistake for some other column.

| Table                            | Columns used                                                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `customers`                      | `id`, `phone`, `full_name`, `national_id`, `date_of_birth`, `is_active`                                                                     |
| `accounts`                       | `id`, `account_number`, `balance`, `available_balance`, `customer_id`, `status`, `account_type_id`, `currency_id`, `opened_at`, `closed_at` |
| `currencies`                     | `id` (+ an ISO-code column, resolved in the RPC)                                                                                            |
| `account_types`                  | `id` (+ a label column, resolved in the RPC)                                                                                                |
| `transactions`, `cards`, `loans` | reached only through their own RPCs; column names are resolved defensively (see below)                                                      |

Two things this is **not**: there is no `bank_accounts` table, and there is no
`iban` column anywhere. Both came from the old `server/bank_system.sql` demo
seed, which described a flat single-table schema that this project does not
have. Consequences:

- The RPC joins `customers -> accounts -> currencies` rather than reading one
  table, and the phone lives on `customers`, not on the account row.
- `AccountField` has no `IBAN` member. IBAN questions are matched separately by
  `mentions_unavailable_field()` and answered directly. They deliberately do
  **not** start verification — sending an OTP and then having nothing to
  disclose is worse than saying so up front — and they deliberately do not fall
  through to the LLM, which has no account data and would invent a plausible
  `PS..` string.
- A customer may hold several accounts. The RPC returns the oldest still-open
  one (`closed_at is null`, ordered by `opened_at`). The WhatsApp flow asks no
  disambiguating question; if per-account answers are needed that is a product
  change, not a config change.

## What a verified customer can be told

`AccountField` (app/core/bank/intents.py) is the whole disclosure surface:

| Field                                                                                          | Source RPC                                                                         |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `balance`, `available_balance`, `account_number`, `currency`, `account_type`, `account_status` | `get_bank_account_profile_by_phone`                                                |
| `transactions`                                                                                 | `get_bank_recent_transactions_by_phone` (capped at 10 rows bank-side, 5 requested) |
| `cards`                                                                                        | `get_bank_cards_by_phone` (card numbers masked in `responses.py`)                  |
| `loans`                                                                                        | `get_bank_loans_by_phone`                                                          |

`MAX_FIELDS_PER_REQUEST = 2` still applies, so a broad "how is my account doing"
escalates rather than dumping everything. Sections cost one RPC each and are
fetched **only when asked for** — a balance question does not pull cards.

`transactions`, `cards` and `loans` were unreachable when
`scripts/sql/bank_db_oss_account_details.sql` was written (anon holds no SELECT
on them, by design), so their column names could not be verified over the Data
API. That file resolves the uncertain ones through `to_jsonb(row) ->> 'candidate'`
coalesce chains and carries a step-0 `information_schema` query in its header.
**Run step 0 and substitute the real names before trusting the output.** A NULL
`currency` or `account_type` is the tell that a fallback guessed wrong.

## Flow

```
customer: "كم رصيدي؟"
   -> match_account_intent()          deterministic allowlist, no LLM
   -> otp_client.generate()           OTP service sends a 6-digit code
   -> verification_store.start()      backend stores intent + TTL + attempts
                                      (NOT the code)
customer: "482915"
   -> otp_client.verify()             the OTP service decides valid/invalid
   -> crud.get_bank_account_fields()  read-only RPC, allowlisted columns
   -> build_account_reply()           literal Arabic template
        customer sees:   "رصيد حسابك: 1000 JOD"  (identifiers masked)
        transcript gets: "[محتوى محمي] تم إرسال رصيد حسابك..."  (no values)
```

## Setup

Run **both** SQL scripts before enabling the feature:

| Script                                           | Project                      | Purpose                                                                                                                                                                                                                                       |
| ------------------------------------------------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/sql/bank_otps_hardening.sql`            | **ops** (`SUPABASE_URL`)     | RLS on `bank_otps`; add `attempts` / `consumed_at`                                                                                                                                                                                            |
| `scripts/sql/bank_db_oss_readonly.sql`           | **bank** (`BANK_DB_OSS_URL`) | revoke DML, RLS, read-only RPC                                                                                                                                                                                                                |
| `scripts/sql/bank_db_oss_account_details.sql`    | **bank** (`BANK_DB_OSS_URL`) | profile / transactions / cards / loans RPCs                                                                                                                                                                                                   |
| `scripts/sql/bank_db_oss_identity_lookup_v3.sql` | **bank** (`BANK_DB_OSS_URL`) | (national_id, date_of_birth) -> phone-on-file RPC. Also DROPs the two superseded name-based lookups it replaces. Required by both WhatsApp's identity-first flow and the voice agent's `verify_identity` -- see `docs/VOICE_AGENT_PROMPT.md`. |

Then set `BANK_DB_OSS_URL` / `BANK_DB_OSS_KEY`, `OTP_SERVICE_BASE_URL`, and
`OTP_SERVICE_SHARED_SECRET`. The server refuses to boot if `BANK_LOOKUP_ENABLED`
is true and any of these are missing — set it to `false` to run without the
feature.

> **`BANK_DB_OSS_KEY` must be the publishable (anon) key.** `service_role` has
> `BYPASSRLS`, so a service-role key silently voids the RLS layer. The app
> detects and rejects one at startup, but the database cannot.

## Why an RPC instead of `select` on the table

The backend is server-side and carries no end-user JWT, so PostgREST sees
`role = anon`. For direct table reads to work at all, the policy would have to
be `using (true)` — at which point the phone filter in Python is the _only_
access control, and anyone holding the key can send
`GET /rest/v1/accounts?select=*,customers(*)` and dump every customer.

`get_bank_account_by_phone(p_phone)` returns at most one row, only for a phone
the caller already knows, with the column set fixed by its signature. A leaked
key is a categorically smaller problem.

The function is `STABLE` so PostgREST will serve it over `GET`, which matters:
the read-only client's transport refuses to emit anything but `GET`/`HEAD`.

## Why two different reply strings

`webhook.py` rebuilds LLM history from rows in the `messages` table. The old
code persisted the customer-facing reply verbatim — balance and full account
number — so on the customer's _next_ message that data went straight into the
prompt. Storing an audit line instead (`build_account_audit_line`) is what makes
invariant 2 hold; the history builder additionally swaps any message starting
with `[محتوى محمي]` for a placeholder, which also neutralises rows written by
the previous code.

Consequence: **dashboard agents no longer see the balance in the transcript.**

## Things deliberately not done

- **Model output cannot trigger an OTP.** The old `ai_mentions_otp` check fired
  whenever the assistant's own text contained "رمز تحقق" — which the system
  prompt tells it to say for any transfer question. Removed, not gated.
- **Sensitive actions escalate, they don't verify.** Transfers, password resets,
  and account closure go to a human. An OTP that gates nothing would only teach
  customers to type verification codes into a chat window.
