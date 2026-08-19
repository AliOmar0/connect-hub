-- =============================================================================
-- Bank_db_oss: make the customer/account tables READ-ONLY and non-enumerable.
--
-- RUN THIS IN THE **BANK** PROJECT (the one BANK_DB_OSS_URL points at:
-- https://jcwhhbviphoeeoihdlxx.supabase.co). Do NOT run it in the ops project.
--
-- SCHEMA THIS TARGETS (verified against the live project over PostgREST):
--   customers(id, phone, full_name, email, national_id, is_active,
--             created_at, updated_at)
--   accounts (id, account_number, balance, available_balance, customer_id,
--             status, account_type_id, branch_id, currency_id,
--             opened_at, closed_at, created_at, updated_at)
--   currencies(id, ...)   -- the ISO-code column name is resolved dynamically
--                            in step 4; see the comment there.
--
-- NOTE: there is NO `iban` column anywhere in this schema, and no
-- `bank_accounts` table. Both were assumptions carried over from the old
-- server/bank_system.sql demo seed. The backend has been updated to match.
--
-- KEY REQUIREMENT: BANK_DB_OSS_KEY must be the project's PUBLISHABLE (anon)
-- key. `service_role` has BYPASSRLS, so a service-role key would make step 2
-- decorative. The backend refuses to start with one (app/database.py::
-- _looks_like_service_role), but the database cannot tell the difference --
-- so this is on you.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Sanity check. Run this FIRST and eyeball the output before continuing.
--    If any column below is missing, step 4 will fail loudly rather than
--    silently return wrong data.
-- -----------------------------------------------------------------------------
-- select table_name, column_name, data_type
--   from information_schema.columns
--  where table_schema = 'public'
--    and table_name in ('customers', 'accounts', 'currencies')
--  order by table_name, ordinal_position;

-- -----------------------------------------------------------------------------
-- 1. Remove every direct API privilege on every table in the exposed schema.
--    This is the control that actually enforces read-only: privileges bind
--    service_role too (it has BYPASSRLS, but it is NOT a superuser, so table
--    GRANTs still apply to it).
--
--    NOTE: the table OWNER (and `postgres`) keeps full access, so you can still
--    load, correct, and maintain the data from the SQL editor or a migration.
--    What this blocks is every role reachable through the Data API.
-- -----------------------------------------------------------------------------
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
revoke create on schema public              from anon, authenticated;

-- Belt and braces on the two tables the read path touches: deny DML to every
-- API-reachable role explicitly, including service_role, so a mistakenly
-- configured secret key still cannot write.
revoke insert, update, delete, truncate on table public.customers
  from anon, authenticated, service_role, public;
revoke insert, update, delete, truncate on table public.accounts
  from anon, authenticated, service_role, public;

alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

-- PostgREST needs USAGE on the schema to resolve the function in step 4.
grant usage on schema public to anon;

-- -----------------------------------------------------------------------------
-- 2. RLS on, with NO policies, on every table in the exposed schema. Any role
--    subject to RLS therefore sees zero rows through the Data API, whatever
--    query string it sends.
--
--    Deliberately NOT `force row level security`: FORCE would subject the table
--    OWNER to policies as well, and the SECURITY DEFINER function in step 4
--    runs as the owner -- it would return 0 rows and the read path would break.
--
--    After step 1 the rest of the schema (transactions, cards, loans, cheques,
--    beneficiaries, employees, branches, audit_logs, ...) is already unreachable
--    because anon holds no privilege on it. Enabling RLS as well costs nothing
--    and keeps the security advisor output clean.
-- -----------------------------------------------------------------------------
do $do$
declare t record;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end
$do$;

-- -----------------------------------------------------------------------------
-- 3. The one and only read path.
--
--    Why an RPC instead of `grant select` + a `using (true)` policy:
--    the backend is server-side and carries no end-user JWT, so PostgREST sees
--    role = anon and there is nothing to filter on. A `using (true)` SELECT
--    policy would let anyone holding the anon key issue
--        GET /rest/v1/accounts?select=*,customers(*)
--    and dump every customer. Through this function a caller gets at most one
--    row per call, only for a phone number they already know, with the column
--    set fixed by the signature. No enumeration, no select=*, no range filters.
--
--    STABLE is REQUIRED: PostgREST only serves non-volatile functions over GET,
--    and the backend's read-only transport refuses to emit anything but GET.
--
--    CURRENCY: `accounts.currency_id` references `public.currencies`, whose
--    ISO-code column could not be read over the Data API (anon has no SELECT on
--    it, by design). Rather than guess, the code is resolved from the row as
--    jsonb and the first plausible key wins. Once you have confirmed the real
--    name from step 0, replace that expression with the plain column reference.
--
--    MULTIPLE ACCOUNTS: a customer may hold several. This returns the oldest
--    still-open one, deterministically. If you need per-account answers that is
--    a product decision -- the WhatsApp flow asks no disambiguating question.
-- -----------------------------------------------------------------------------
drop function if exists public.get_bank_account_by_phone(text);

create function public.get_bank_account_by_phone(p_phone text)
returns table (
  owner_name     text,
  account_number text,
  balance        numeric,
  currency       text
)
language sql
stable
security definer
set search_path = ''   -- pinned: every identifier below is schema-qualified
as $fn$
  select
    c.full_name::text,
    a.account_number::text,
    a.balance::numeric,
    (
      select coalesce(
               pg_catalog.to_jsonb(cur) ->> 'code',
               pg_catalog.to_jsonb(cur) ->> 'currency_code',
               pg_catalog.to_jsonb(cur) ->> 'iso_code',
               pg_catalog.to_jsonb(cur) ->> 'symbol'
             )
        from public.currencies cur
       where cur.id = a.currency_id
    )::text
  from public.customers c
  join public.accounts  a on a.customer_id = c.id
  where pg_catalog.regexp_replace(c.phone,  '\D', '', 'g')
      = pg_catalog.regexp_replace(p_phone, '\D', '', 'g')
    and c.is_active is not false
    and a.closed_at is null
  order by a.opened_at asc nulls last, a.id asc
  limit 1;
$fn$;

-- Postgres grants EXECUTE to PUBLIC on every new function; revoke that first.
revoke all on function public.get_bank_account_by_phone(text)
  from public, anon, authenticated;
grant execute on function public.get_bank_account_by_phone(text) to anon;

-- -----------------------------------------------------------------------------
-- 4. Indexes matching the function's predicates. A plain index on
--    customers.phone would NOT be used, because the predicate wraps it in
--    regexp_replace. (Digit-normalised on both sides so '+970 59...' matches
--    '97059...', which is the format WhatsApp delivers.)
-- -----------------------------------------------------------------------------
create index if not exists customers_phone_digits_idx
  on public.customers ((regexp_replace(phone, '\D', '', 'g')));
create index if not exists accounts_customer_id_idx
  on public.accounts (customer_id);

-- =============================================================================
-- 5. VERIFY. In the SQL editor, switch the role to `anon` and run:
--
--   select * from public.customers;
--   select * from public.accounts;
--     -- expect: permission denied, both
--
--   insert into public.accounts default values;
--   update public.accounts set balance = 0;
--   delete from public.accounts;
--     -- expect: permission denied, all three
--
--   select * from public.get_bank_account_by_phone('970599123456');
--     -- expect: exactly one row (or zero if the phone is unknown), and a
--     -- non-null `currency` -- a NULL currency means the coalesce in step 3
--     -- guessed wrong and you need the real column name from step 0.
--
-- Then run `supabase db advisors` / MCP get_advisors against THIS project and
-- confirm no new RLS findings.
-- =============================================================================
