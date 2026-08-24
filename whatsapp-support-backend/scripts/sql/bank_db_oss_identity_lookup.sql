-- =============================================================================
-- Bank_db_oss: identity-based phone lookup, for the "verify by name + national
-- ID, then OTP the phone on file" flow.
--
-- RUN THIS IN THE **BANK** PROJECT (the one BANK_DB_OSS_URL points at), same as
-- scripts/sql/bank_db_oss_readonly.sql -- run that one FIRST; this one assumes
-- RLS is already enabled with no policies on public.customers/public.accounts.
--
-- WHY A SEPARATE RPC INSTEAD OF EXTENDING get_bank_account_by_phone
-- -------------------------------------------------------------------------
-- The existing flow assumes the WhatsApp number a customer is chatting from
-- IS their bank-registered phone, and sends the OTP straight to it. This RPC
-- backs a stricter flow: the customer states their full name + national ID
-- in chat, the backend resolves those to the phone Bank_db_oss has on file,
-- and the OTP is sent to THAT number -- regardless of which number the
-- customer is currently chatting from. Only the phone comes back; account
-- data itself still only flows through get_bank_account_by_phone, once the
-- phone-on-file's OTP has been verified.
--
-- SUPERSEDED by scripts/sql/bank_db_oss_identity_lookup_v3.sql, which matches
-- on national_id + date_of_birth instead of national_id + full_name. This file
-- is kept for history only; v3 DROPs the function it creates. Nothing in the
-- app calls it -- app/database.py's BANK_IDENTITY_RPC points at v3.
--
-- Its original header claimed "the live schema (verified over PostgREST) has no
-- date_of_birth/birthday column on public.customers". That was WRONG, and the
-- claim is removed rather than left to mislead again: it misread
-- bank_db_oss_readonly.sql's header ("SCHEMA THIS TARGETS" -- the columns those
-- scripts use, not an exhaustive catalog). scripts/sql/bankdboss.sql:40, a real
-- catalog export, defines date_of_birth as `date NOT NULL`.
-- =============================================================================

drop function if exists public.get_bank_customer_phone_by_identity(text, text);

create function public.get_bank_customer_phone_by_identity(
  p_full_name text,
  p_national_id text
)
returns table (phone text)
language sql
stable
security definer
set search_path = ''   -- pinned: every identifier below is schema-qualified
as $fn$
  select c.phone::text
  from public.customers c
  where c.is_active is not false
    -- national_id compared digit-only, same normalisation as the phone match
    -- in get_bank_account_by_phone, so "123-456-789" and "123456789" both hit.
    and pg_catalog.regexp_replace(c.national_id, '\D', '', 'g')
      = pg_catalog.regexp_replace(p_national_id, '\D', '', 'g')
    and pg_catalog.regexp_replace(c.national_id, '\D', '', 'g') <> ''
    -- Name compared case-folded with internal whitespace collapsed. No Arabic
    -- diacritic/hamza folding here (unlike app/core/nlp/normalize.py) -- keep
    -- this in step with how strict you want the match; a looser SQL match
    -- widens who gets past this gate before the OTP step even sends a code.
    and lower(pg_catalog.regexp_replace(trim(c.full_name), '\s+', ' ', 'g'))
      = lower(pg_catalog.regexp_replace(trim(p_full_name), '\s+', ' ', 'g'))
  limit 1;
$fn$;

revoke all on function public.get_bank_customer_phone_by_identity(text, text)
  from public, anon, authenticated;
grant execute on function public.get_bank_customer_phone_by_identity(text, text) to anon;

-- Supports the national_id predicate above (digit-normalised, same shape as
-- customers_phone_digits_idx in bank_db_oss_readonly.sql).
create index if not exists customers_national_id_digits_idx
  on public.customers ((regexp_replace(national_id, '\D', '', 'g')));

-- -----------------------------------------------------------------------------
-- VERIFY. In the SQL editor, switch role to `anon` and run:
--
--   select * from public.get_bank_customer_phone_by_identity('Some Name', '123456789');
--     -- expect: zero rows for a name/ID pair that doesn't exist, or exactly
--     -- one phone for one that does. Confirm a wrong name with a right ID
--     -- (or vice versa) returns ZERO rows, not a partial match.
-- -----------------------------------------------------------------------------
