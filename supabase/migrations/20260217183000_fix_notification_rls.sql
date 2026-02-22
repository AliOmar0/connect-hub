-- Fix RLS policies for notifications to allow broadcast (NULL user_id)
-- These allow all authenticated users (agents/admins) to see and manage broadcast notifications

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own or broadcast notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own or broadcast notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR user_id IS NULL);

-- Also allow deletion
DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;
CREATE POLICY "Users can delete own or broadcast notifications"
  ON public.notifications FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id OR user_id IS NULL);

-- Ensure authenticated users can insert (for certain app logic if needed, though usually backend does it)
-- The original migration didn't have an INSERT policy for authenticated users, 
-- but the backend uses service role info usually.
-- Just in case we want to allow it:
-- CREATE POLICY "Authenticated users can create notifications" ON public.notifications FOR INSERT WITH CHECK (auth.role() = 'authenticated');
