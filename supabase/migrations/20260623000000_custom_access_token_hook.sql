-- Migration: Custom Access Token (Auth) Hook — sync public.user_roles into
-- every issued JWT's claims.
--
-- Problem: the FastAPI backend (whatsapp-support-backend/app/api/v1/deps.py)
-- trusts a `role_name` claim (falling back to `app_metadata.role` /
-- `user_metadata.role`) inside the JWT itself to authorize requests
-- (e.g. require_scraper_admin in app/api/v1/scraper.py). Nothing was ever
-- populating that claim from public.user_roles, so every JWT silently
-- carried no role claim and verify_jwt() defaulted every user to "viewer",
-- causing legitimate admin/supervisor actions to be rejected with 403.
--
-- Fix: register this function as a "Customize Access Token (Auth) Hook" in
-- Supabase (Authentication -> Hooks in the Dashboard — this step cannot be
-- done via SQL/migration alone, see instructions below). Once enabled,
-- Supabase Auth calls this function every time it mints an access token,
-- and the function stamps the caller's real role (from public.user_roles)
-- onto the token's claims as `role_name`, which verify_jwt() already knows
-- how to read.
--
-- After this migration + enabling the hook, existing sessions must be
-- refreshed (sign out/in, or wait for the access token to naturally
-- refresh) to pick up the new claim — already-issued tokens are unaffected.

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  claims jsonb;
  resolved_role public.app_role;
BEGIN
  -- A user can hold more than one row in user_roles (UNIQUE(user_id, role)
  -- allows multiple roles per user); pick the highest-privilege role present
  -- so the JWT claim reflects the most permissive role the user actually
  -- has, matching how has_elevated_role() already treats admin/supervisor
  -- as the elevated tier.
  SELECT role INTO resolved_role
  FROM public.user_roles
  WHERE user_id = (event->>'user_id')::uuid
  ORDER BY
    CASE role
      WHEN 'admin' THEN 1
      WHEN 'supervisor' THEN 2
      WHEN 'agent' THEN 3
      WHEN 'viewer' THEN 4
      ELSE 5
    END
  LIMIT 1;

  claims := COALESCE(event->'claims', '{}'::jsonb);

  IF resolved_role IS NOT NULL THEN
    claims := jsonb_set(claims, '{role_name}', to_jsonb(resolved_role::text));
  ELSE
    -- No user_roles row (should not normally happen — handle_new_user()
    -- inserts a default 'agent' row on signup) — fall back to the same
    -- "viewer" default verify_jwt() already applies when no claim is
    -- present, so behavior is unchanged for genuinely roleless accounts.
    claims := jsonb_set(claims, '{role_name}', '"viewer"'::jsonb);
  END IF;

  event := jsonb_set(event, '{claims}', claims);

  RETURN event;
END;
$$;

-- Supabase Auth (running as the supabase_auth_admin role) must be able to
-- execute this hook and read user_roles; no other role should be able to
-- call it directly.
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM authenticated, anon, public;

GRANT SELECT ON public.user_roles TO supabase_auth_admin;

DROP POLICY IF EXISTS "Allow auth admin to read user roles" ON public.user_roles;
CREATE POLICY "Allow auth admin to read user roles"
  ON public.user_roles
  AS PERMISSIVE FOR SELECT
  TO supabase_auth_admin
  USING (true);

COMMENT ON FUNCTION public.custom_access_token_hook IS
  'Custom Access Token (Auth) Hook: stamps the caller''s highest-privilege '
  'role from public.user_roles onto the JWT as claims.role_name, so backend '
  'services (e.g. whatsapp-support-backend''s verify_jwt) can authorize '
  'requests without a separate DB round-trip. Must be manually registered '
  'in Supabase Dashboard -> Authentication -> Hooks -> Customize Access '
  'Token (Auth) Hook, selecting "public.custom_access_token_hook" — this '
  'cannot be enabled via SQL/migration alone.';
