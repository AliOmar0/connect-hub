-- Notifications: complete, idempotent RLS for read / view / delete.
--
-- Background: 20251221113451 created SELECT and UPDATE policies scoped to
-- `auth.uid() = user_id` only, which locks every agent out of the broadcast
-- notifications the backend writes with user_id IS NULL (see
-- crud.create_notification), and created no DELETE policy at all -- so deletes
-- matched zero rows. 20260217183000 was written to repair that, but it was
-- distributed as a "paste this into the SQL editor" script
-- (test/fix_notifications_rls.py), so it cannot be assumed to have run against
-- any given environment.
--
-- This migration is written to be safe to apply whether or not either of those
-- landed: it drops every historical policy name before recreating the intended
-- set.
--
-- Note on semantics: a broadcast notification (user_id IS NULL) is a single
-- shared row, so marking it read or deleting it applies to every agent. Making
-- read state per-agent would require a separate read-receipt table; that is a
-- product decision, not an RLS one.

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Historical names (20251221113451) and current names, dropped so the
-- CREATEs below are the single source of truth.
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can view own or broadcast notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own or broadcast notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can delete own or broadcast notifications" ON public.notifications;

-- SEE
CREATE POLICY "Users can view own or broadcast notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR user_id IS NULL);

-- READ (mark as read). WITH CHECK is stated explicitly rather than defaulting
-- to USING so the post-update row is pinned to the same ownership: without it
-- a client could rewrite user_id and hand its notification to someone else.
CREATE POLICY "Users can update own or broadcast notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR user_id IS NULL)
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- DELETE
CREATE POLICY "Users can delete own or broadcast notifications"
  ON public.notifications FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id OR user_id IS NULL);

-- Inserts stay service-role only (the backend writes notifications); the
-- service role bypasses RLS, so no INSERT policy is granted to `authenticated`.

-- The UI's realtime refresh depends on this table being published. ADD TABLE
-- errors if it is already a member, so guard on the catalog.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications';
  END IF;
END
$$;

-- Realtime DELETE events carry only the replica-identity columns. The default
-- (primary key) is enough for the UI, which refetches rather than patching, but
-- FULL is required for any future filter on old-record columns. Left at default
-- deliberately.
