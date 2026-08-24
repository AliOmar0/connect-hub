-- =============================================================================
-- Bank_db_oss: identity lookup by NATIONAL ID + DATE OF BIRTH (v3).
--
-- RUN THIS IN THE **BANK** PROJECT (the one BANK_DB_OSS_URL points at), AFTER
-- scripts/sql/bank_db_oss_readonly.sql. This supersedes BOTH earlier identity
-- lookups and drops them (see "CLEANUP" below).
--
-- WHY v3 REPLACES THE NAME-BASED LOOKUPS
-- -------------------------------------------------------------------------
-- v1 matched full_name exactly (case-folded only); v2 loosened that to an
-- Arabic-folded token-set match because the voice channel feeds this from
-- speech-to-text, where Arabic names differ in hamza/alef/ta-marbuta forms
-- constantly ("ابراهيم" vs "إبراهيم"). But a looser match is a weaker gate --
-- v2's own header flagged that trade.
--
-- date_of_birth removes the problem instead of managing it: a date is exact,
-- has no spelling, survives transcription, and is a better-kept secret than a
-- name. So the name is dropped as a factor entirely and the match becomes
-- national_id + date_of_birth. Used by BOTH channels (WhatsApp's
-- identity_pending branch and the voice agent's /tools/verify-identity) via
-- app/database.py's BANK_IDENTITY_RPC constant.
--
-- CORRECTING THE "NO BIRTHDAY" CLAIM
-- -------------------------------------------------------------------------
-- v1's header asserted "the live schema (verified over PostgREST) has no
-- date_of_birth/birthday column on public.customers", and v2 copied it
-- forward. That was WRONG. It misread bank_db_oss_readonly.sql's header,
-- which is titled "SCHEMA THIS TARGETS" -- a hand-curated list of the columns
-- those scripts use, never an exhaustive catalog dump. The actual catalog
-- export at scripts/sql/bankdboss.sql:40 defines:
--
--   date_of_birth date NOT NULL
--     CHECK (date_of_birth <= (CURRENT_DATE - '18 years'::interval)::date)
--
-- NOT NULL, so every customer row has one and there is no null-handling
-- branch to write. The 18-year CHECK is mirrored in
-- app/core/bank/identity_input.py, which rejects an under-18 date before it
-- ever reaches this function -- such a date could not match any row anyway.
-- =============================================================================

-- CLEANUP: the name-based lookups this replaces. Leaving a name-matching
-- function granted to `anon` is attack surface nothing calls any more, so they
-- go in the same script rather than being left behind. Idempotent -- safe
-- whether or not either was ever applied.
drop function if exists public.get_bank_customer_phone_by_identity(text, text);
drop function if exists public.get_bank_customer_phone_by_identity_v2(text, text);

drop function if exists public.get_bank_customer_phone_by_identity_dob(text, date);

create function public.get_bank_customer_phone_by_identity_dob(
  p_national_id text,
  p_date_of_birth date
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
    -- national_id compared digit-only, unchanged from v1/v2, so "123-456-789"
    -- and "123456789" both hit. customers.national_id is UNIQUE and backed by
    -- customers_national_id_digits_idx, so this narrows to at most one row
    -- before the date is even looked at.
    and pg_catalog.regexp_replace(c.national_id, '\D', '', 'g')
      = pg_catalog.regexp_replace(p_national_id, '\D', '', 'g')
    and pg_catalog.regexp_replace(c.national_id, '\D', '', 'g') <> ''
    -- Exact date equality. No folding, no tolerance, no fuzzy window -- that
    -- is the entire reason this factor replaced the name.
    and c.date_of_birth = p_date_of_birth
  limit 1;
$fn$;

revoke all on function public.get_bank_customer_phone_by_identity_dob(text, date)
  from public, anon, authenticated;
grant execute on function public.get_bank_customer_phone_by_identity_dob(text, date) to anon;

-- Only the phone comes back -- never the name, the date, or any account data.
-- Account fields still come exclusively from get_bank_account_by_phone /
-- get_bank_account_profile_by_phone, and only after this phone's OTP has been
-- verified. See docs/BANK_ACCOUNT_ACCESS.md.

-- -----------------------------------------------------------------------------
-- VERIFY. In the SQL editor, switch role to `anon` and run:
--
--   -- A real (national_id, date_of_birth) pair -> exactly one phone:
--   select * from public.get_bank_customer_phone_by_identity_dob('123456789', '1990-05-15');
--
--   -- Right ID, WRONG date -> ZERO rows (not a partial match):
--   select * from public.get_bank_customer_phone_by_identity_dob('123456789', '1990-05-16');
--
--   -- Wrong ID, right date -> ZERO rows:
--   select * from public.get_bank_customer_phone_by_identity_dob('000000000', '1990-05-15');
--
--   -- Dashes in the ID are ignored, same as v1/v2:
--   select * from public.get_bank_customer_phone_by_identity_dob('123-456-789', '1990-05-15');
--
-- Also confirm the superseded functions are gone (expect zero rows):
--   select proname from pg_proc
--    where proname in ('get_bank_customer_phone_by_identity',
--                      'get_bank_customer_phone_by_identity_v2');
-- -----------------------------------------------------------------------------
