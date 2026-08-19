-- =============================================================================
-- bank_otps hardening.  RUN THIS IN THE **OPS** PROJECT (SUPABASE_URL) FIRST.
--
-- WHY THIS IS URGENT
-- ------------------
-- otp-service/main.py falls back to VITE_SUPABASE_PUBLISHABLE_KEY when no
-- service key is set -- the SAME key the React frontend ships to browsers.
-- If public.bank_otps is reachable by `anon`, then ANY browser holding that
-- key can read live, unexpired OTP codes for any phone number:
--     GET /rest/v1/bank_otps?select=phone_number,otp_code&verified=eq.false
-- Verify before assuming you are safe:
--     select relrowsecurity from pg_class where relname = 'bank_otps';
--     select policyname, roles, cmd from pg_policies where tablename = 'bank_otps';
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. OTP codes are server-only. No browser role gets any access, ever.
--    RLS with zero policies means anon/authenticated see nothing even if a
--    GRANT is re-added by accident later.
-- -----------------------------------------------------------------------------
revoke all on table public.bank_otps from anon, authenticated, public;
alter table public.bank_otps enable row level security;

-- Intentionally NO policies for anon/authenticated. The OTP service must use
-- the service-role key (which bypasses RLS) -- see step 4.

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'bank_otps'
      and roles::text[] && array['anon', 'authenticated']
  ) then
    raise warning 'bank_otps still has anon/authenticated policies - drop them.';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 2. Columns the hardened /verify flow needs.
--    `attempts` lets the service count wrong guesses. It cannot do that today
--    because it matches on .eq("otp_code", ...) -- a wrong guess simply returns
--    no row, so there is nothing to increment.
--    `consumed_at` lets /generate invalidate a phone's older outstanding codes.
-- -----------------------------------------------------------------------------
alter table public.bank_otps add column if not exists attempts    int not null default 0;
alter table public.bank_otps add column if not exists consumed_at timestamptz;

-- -----------------------------------------------------------------------------
-- 3. Index for "newest live code for this phone" lookups.
-- -----------------------------------------------------------------------------
create index if not exists bank_otps_phone_created_idx
  on public.bank_otps (phone_number, created_at desc);

-- -----------------------------------------------------------------------------
-- 4. AFTER RUNNING THIS: set SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_KEY) in the
--    OTP service's environment. The VITE_SUPABASE_PUBLISHABLE_KEY fallback has
--    been removed from otp-service/main.py, so the service will refuse to start
--    without a real key rather than silently running on the browser key.
--
--    Consider also rotating VITE_SUPABASE_PUBLISHABLE_KEY if bank_otps was
--    readable by it at any point.
-- =============================================================================
