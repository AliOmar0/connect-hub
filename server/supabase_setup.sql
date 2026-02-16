-- Create a specific bucket for Call Audio
-- Note: You must create a bucket named 'audio_logs' in your Supabase Storage dashboard.
-- Ensure the bucket is set to Public so Twilio can access the URLs.

-- SQL to create the logs table
create table public.call_logs (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  call_sid text not null,
  
  -- The text spoken by the user (STT)
  user_text text,
  
  -- The text responded by the AI
  ai_text text,
  
  -- URL to the generated TTS audio (from Chatterbox/Supabase Storage)
  ai_audio_url text,
  
  -- URL to the user's audio (if available/recorded)
  user_audio_url text
);

-- Policies (If RLS is enabled)
-- Allow public insert for logging purposes (or restrict as needed)
alter table public.call_logs enable row level security;

create policy "Enable insert for all users"
on public.call_logs for insert
with check (true);

create policy "Enable select for all users"
on public.call_logs for select
using (true);

-- Storage Policy (For 'audio_logs' bucket)
-- You typically configure this in the Storage UI, but logically:
-- Allow the anon key (our backend using publishable key) to upload files.
-- Allow insert paths: 'public/*'
