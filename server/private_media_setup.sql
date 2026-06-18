-- Private media storage for call/voice/customer audio (G27).
-- Run in the Supabase SQL editor (or create the bucket in the Storage UI).
--
-- The bucket MUST be private. Access is granted only through short-lived signed
-- URLs minted server-side by the Node API using the service-role key
-- (server/lib/media.js). No public URLs are ever issued for customer media.

-- 1. Create a PRIVATE bucket named 'call-media'.
insert into storage.buckets (id, name, public)
values ('call-media', 'call-media', false)
on conflict (id) do update set public = false;

-- 2. No public read policy is created on purpose.
--    The service role bypasses RLS, so the backend can upload and sign.
--    Authenticated dashboard users never read the bucket directly; they call
--    GET /api/media/sign (role-checked) which returns a time-limited signed URL.

-- 3. (Optional) If you previously used a public 'audio_logs' bucket, migrate
--    objects into 'call-media' and set the old bucket to private:
-- update storage.buckets set public = false where id = 'audio_logs';
