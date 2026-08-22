-- =============================================================================
-- Bank_db_oss: the wider read-only account surface -- profile, recent
-- transactions, cards, and financings.
--
-- RUN THIS IN THE **BANK** PROJECT (the one BANK_DB_OSS_URL points at:
-- https://jcwhhbviphoeeoihdlxx.supabase.co). Run scripts/sql/bank_db_oss_readonly.sql
-- FIRST -- this file assumes RLS is already enabled with no policies and that
-- anon holds no table privileges in the exposed schema.
--
-- WHY THIS FILE EXISTS
-- -------------------------------------------------------------------------
-- get_bank_account_by_phone answers only "balance / account number / currency".
-- Customers also ask about their last few movements, their cards, their
-- financings, and whether the account is active. Those tables exist in this
-- project but are unreachable by design (step 1 of bank_db_oss_readonly.sql
-- revokes every privilege from anon). Rather than granting SELECT on them --
-- which would let anyone holding the anon key dump the whole ledger -- each
-- question gets its own SECURITY DEFINER RPC with a fixed column set, a fixed
-- row cap, and the customer resolved from a phone the caller already knows.
--
-- get_bank_account_by_phone and get_bank_customer_phone_by_identity are NOT
-- touched here. The backend and its tests still depend on their signatures.
--
-- STABLE is REQUIRED on every function below: app/core/readonly_db.py always
-- calls rpc(..., get=True), and PostgREST only serves non-volatile functions
-- over GET.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. SANITY CHECK -- RUN THIS FIRST AND EYEBALL THE OUTPUT.
--
--    Unlike customers/accounts/currencies (verified live over PostgREST and
--    documented in bank_db_oss_readonly.sql), the column names on transactions,
--    cards, loans and account_types could NOT be read from the Data API -- anon
--    has no SELECT on them, which is the whole point. Everything below is
--    written against the most likely names with jsonb fallbacks for the ones
--    that vary. Confirm them here, then replace the coalesce expressions with
--    plain column references.
-- -----------------------------------------------------------------------------
-- select table_name, column_name, data_type
--   from information_schema.columns
--  where table_schema = 'public'
--    and table_name in ('transactions', 'cards', 'loans', 'account_types')
--  order by table_name, ordinal_position;

-- -----------------------------------------------------------------------------
-- Shared helper: resolve a phone to the one account we answer for.
--
-- Same rule as get_bank_account_by_phone -- digit-normalised phone match, active
-- customer, open account, oldest-first, exactly one row -- factored out so the
-- four functions below cannot drift apart from it or from each other.
-- -----------------------------------------------------------------------------
drop function if exists public.bank_resolve_account_id(text);

create function public.bank_resolve_account_id(p_phone text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $fn$
  select a.id
  from public.customers c
  join public.accounts  a on a.customer_id = c.id
  where pg_catalog.regexp_replace(c.phone,  '\D', '', 'g')
      = pg_catalog.regexp_replace(p_phone, '\D', '', 'g')
    and c.is_active is not false
    and a.closed_at is null
  order by a.opened_at asc nulls last, a.id asc
  limit 1;
$fn$;

-- Not granted to anon: this is an internal helper for the functions below,
-- which run as the owner and can therefore call it. Exposing it would hand out
-- an account id for any phone number, which is an enumeration primitive.
revoke all on function public.bank_resolve_account_id(text)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 1. Account profile. Superset of get_bank_account_by_phone.
--
--    account_type and account_status are the two additions that need dynamic
--    resolution: `accounts.status` is assumed to be the status column, and the
--    account_types label column name is unconfirmed (see step 0).
-- -----------------------------------------------------------------------------
drop function if exists public.get_bank_account_profile_by_phone(text);

create function public.get_bank_account_profile_by_phone(p_phone text)
returns table (
  owner_name        text,
  account_number    text,
  balance           numeric,
  available_balance numeric,
  currency          text,
  account_type      text,
  account_status    text,
  opened_at         timestamptz
)
language sql
stable
security definer
set search_path = ''
as $fn$
  select
    c.full_name::text,
    a.account_number::text,
    a.balance::numeric,
    a.available_balance::numeric,
    (
      select coalesce(
               pg_catalog.to_jsonb(cur) ->> 'code',
               pg_catalog.to_jsonb(cur) ->> 'currency_code',
               pg_catalog.to_jsonb(cur) ->> 'iso_code',
               pg_catalog.to_jsonb(cur) ->> 'symbol'
             )
        from public.currencies cur
       where cur.id = a.currency_id
    )::text,
    (
      select coalesce(
               pg_catalog.to_jsonb(t) ->> 'name',
               pg_catalog.to_jsonb(t) ->> 'type_name',
               pg_catalog.to_jsonb(t) ->> 'title',
               pg_catalog.to_jsonb(t) ->> 'code'
             )
        from public.account_types t
       where t.id = a.account_type_id
    )::text,
    a.status::text,
    a.opened_at::timestamptz
  from public.customers c
  join public.accounts  a on a.customer_id = c.id
  where pg_catalog.regexp_replace(c.phone,  '\D', '', 'g')
      = pg_catalog.regexp_replace(p_phone, '\D', '', 'g')
    and c.is_active is not false
    and a.closed_at is null
  order by a.opened_at asc nulls last, a.id asc
  limit 1;
$fn$;

revoke all on function public.get_bank_account_profile_by_phone(text)
  from public, anon, authenticated;
grant execute on function public.get_bank_account_profile_by_phone(text) to anon;

-- -----------------------------------------------------------------------------
-- 2. Recent transactions.
--
--    p_limit is clamped server-side: a caller that asks for 5000 gets 10. The
--    cap is the point -- this answers "what were my last few movements", not
--    "export my statement", and an uncapped limit would turn one leaked anon
--    key into a full ledger dump for any known phone number.
--
--    `direction` is normalised to 'credit'/'debit' from the account endpoint so
--    the backend does not need to know the schema's from/to column names.
-- -----------------------------------------------------------------------------
drop function if exists public.get_bank_recent_transactions_by_phone(text, integer);

create function public.get_bank_recent_transactions_by_phone(
  p_phone text,
  p_limit integer default 5
)
returns table (
  occurred_at timestamptz,
  description text,
  amount      numeric,
  currency    text,
  direction   text
)
language sql
stable
security definer
set search_path = ''
as $fn$
  select
    coalesce(
      (pg_catalog.to_jsonb(tx) ->> 'transaction_date')::timestamptz,
      (pg_catalog.to_jsonb(tx) ->> 'occurred_at')::timestamptz,
      tx.created_at::timestamptz
    ),
    coalesce(
      pg_catalog.to_jsonb(tx) ->> 'description',
      pg_catalog.to_jsonb(tx) ->> 'narrative',
      pg_catalog.to_jsonb(tx) ->> 'transaction_type',
      ''
    )::text,
    abs(tx.amount)::numeric,
    (
      select coalesce(
               pg_catalog.to_jsonb(cur) ->> 'code',
               pg_catalog.to_jsonb(cur) ->> 'currency_code',
               pg_catalog.to_jsonb(cur) ->> 'iso_code',
               pg_catalog.to_jsonb(cur) ->> 'symbol'
             )
        from public.currencies cur
       where cur.id = a.currency_id
    )::text,
    case
      when tx.to_account_id = a.id then 'credit'
      when tx.from_account_id = a.id then 'debit'
      when lower(coalesce(pg_catalog.to_jsonb(tx) ->> 'direction', '')) in ('credit', 'debit')
        then lower(pg_catalog.to_jsonb(tx) ->> 'direction')
      else 'credit'
    end::text
  from public.transactions tx
  join public.accounts a on a.id = public.bank_resolve_account_id(p_phone)
  where tx.from_account_id = a.id
     or tx.to_account_id = a.id
  order by 1 desc nulls last
  limit least(greatest(coalesce(p_limit, 5), 1), 10);
$fn$;

revoke all on function public.get_bank_recent_transactions_by_phone(text, integer)
  from public, anon, authenticated;
grant execute on function public.get_bank_recent_transactions_by_phone(text, integer) to anon;

-- -----------------------------------------------------------------------------
-- 3. Cards.
--
--    card_number is returned in full here and masked in the application
--    (app/core/bank/responses.py masks it with mask_identifier before it can
--    reach a customer or the transcript). Masking in SQL instead was tempting,
--    but the renderer already owns that rule for account_number, and having two
--    masking implementations is how they drift apart.
-- -----------------------------------------------------------------------------
drop function if exists public.get_bank_cards_by_phone(text);

create function public.get_bank_cards_by_phone(p_phone text)
returns table (
  card_type   text,
  card_number text,
  card_status text,
  expires_at  text
)
language sql
stable
security definer
set search_path = ''
as $fn$
  select
    coalesce(
      pg_catalog.to_jsonb(cd) ->> 'card_type',
      pg_catalog.to_jsonb(cd) ->> 'type',
      pg_catalog.to_jsonb(cd) ->> 'product',
      ''
    )::text,
    coalesce(
      pg_catalog.to_jsonb(cd) ->> 'card_number',
      pg_catalog.to_jsonb(cd) ->> 'masked_number',
      pg_catalog.to_jsonb(cd) ->> 'number',
      ''
    )::text,
    coalesce(
      pg_catalog.to_jsonb(cd) ->> 'status',
      pg_catalog.to_jsonb(cd) ->> 'card_status',
      ''
    )::text,
    coalesce(
      pg_catalog.to_jsonb(cd) ->> 'expiry_date',
      pg_catalog.to_jsonb(cd) ->> 'expires_at',
      pg_catalog.to_jsonb(cd) ->> 'expiration_date',
      ''
    )::text
  from public.cards cd
  where cd.account_id = public.bank_resolve_account_id(p_phone)
  order by 1
  limit 5;
$fn$;

revoke all on function public.get_bank_cards_by_phone(text)
  from public, anon, authenticated;
grant execute on function public.get_bank_cards_by_phone(text) to anon;

-- -----------------------------------------------------------------------------
-- 4. Financings (the `loans` table -- the bank's products are Sharia-compliant
--    financings, and app/core/bank/responses.py labels them accordingly in
--    Arabic; the table name here is just what the schema calls it).
-- -----------------------------------------------------------------------------
drop function if exists public.get_bank_loans_by_phone(text);

create function public.get_bank_loans_by_phone(p_phone text)
returns table (
  product       text,
  principal     numeric,
  outstanding   numeric,
  currency      text,
  next_due_date text,
  loan_status   text
)
language sql
stable
security definer
set search_path = ''
as $fn$
  select
    coalesce(
      pg_catalog.to_jsonb(l) ->> 'product',
      pg_catalog.to_jsonb(l) ->> 'loan_type',
      pg_catalog.to_jsonb(l) ->> 'type',
      ''
    )::text,
    coalesce(
      (pg_catalog.to_jsonb(l) ->> 'principal')::numeric,
      (pg_catalog.to_jsonb(l) ->> 'amount')::numeric
    ),
    coalesce(
      (pg_catalog.to_jsonb(l) ->> 'outstanding')::numeric,
      (pg_catalog.to_jsonb(l) ->> 'remaining_amount')::numeric,
      (pg_catalog.to_jsonb(l) ->> 'balance')::numeric
    ),
    (
      select coalesce(
               pg_catalog.to_jsonb(cur) ->> 'code',
               pg_catalog.to_jsonb(cur) ->> 'currency_code',
               pg_catalog.to_jsonb(cur) ->> 'iso_code',
               pg_catalog.to_jsonb(cur) ->> 'symbol'
             )
        from public.currencies cur
       where cur.id = a.currency_id
    )::text,
    coalesce(
      pg_catalog.to_jsonb(l) ->> 'next_due_date',
      pg_catalog.to_jsonb(l) ->> 'next_payment_date',
      pg_catalog.to_jsonb(l) ->> 'due_date',
      ''
    )::text,
    coalesce(
      pg_catalog.to_jsonb(l) ->> 'status',
      pg_catalog.to_jsonb(l) ->> 'loan_status',
      ''
    )::text
  from public.loans l
  join public.accounts a on a.id = l.account_id
  where a.id = public.bank_resolve_account_id(p_phone)
  order by 1
  limit 5;
$fn$;

revoke all on function public.get_bank_loans_by_phone(text)
  from public, anon, authenticated;
grant execute on function public.get_bank_loans_by_phone(text) to anon;

-- -----------------------------------------------------------------------------
-- 5. Indexes matching the new predicates, mirroring accounts_customer_id_idx in
--    bank_db_oss_readonly.sql. The transactions function filters both account
--    endpoints because a movement can be incoming or outgoing.
-- -----------------------------------------------------------------------------
create index if not exists transactions_from_account_id_idx on public.transactions (from_account_id);
create index if not exists transactions_to_account_id_idx   on public.transactions (to_account_id);
create index if not exists cards_account_id_idx        on public.cards        (account_id);
create index if not exists loans_account_id_idx        on public.loans        (account_id);

-- =============================================================================
-- 6. VERIFY. In the SQL editor, switch the role to `anon` and run:
--
--   select * from public.transactions;
--   select * from public.cards;
--   select * from public.loans;
--     -- expect: permission denied, all three (step 1 of bank_db_oss_readonly.sql)
--
--   select public.bank_resolve_account_id('970599123456');
--     -- expect: permission denied -- the helper is deliberately NOT granted
--
--   select * from public.get_bank_account_profile_by_phone('970599123456');
--     -- expect: exactly one row, non-null `currency` AND non-null `account_type`.
--     -- A NULL in either means a coalesce above guessed wrong: go back to step 0
--     -- and substitute the real column name.
--
--   select * from public.get_bank_recent_transactions_by_phone('970599123456', 5000);
--     -- expect: at most 10 rows (the clamp), newest first, `direction` only ever
--     -- 'credit' or 'debit'.
--
--   select * from public.get_bank_cards_by_phone('970599123456');
--   select * from public.get_bank_loans_by_phone('970599123456');
--     -- expect: rows for a known phone, ZERO rows for an unknown one -- never
--     -- an error that distinguishes the two.
--
-- Then run the Supabase advisors against THIS project and confirm no new
-- RLS/security findings.
-- =============================================================================
