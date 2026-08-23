-- sessions.external_conversation_id -- bring an out-of-band column under version control.
--
-- This column has existed in the live project since the ElevenLabs voice channel
-- shipped, but only as a manual runbook step
-- (whatsapp-support-backend/scripts/sql/sessions_add_external_conversation_id.sql),
-- so a fresh environment built from supabase/migrations/ came up without it and
-- every voice call failed at /tools/identify. This migration is that script,
-- verbatim in intent, so the two stop diverging.
--
-- WHY THE COLUMN EXISTS
-- --------------------
-- The voice agent's post-call webhook arrives after the call has ended, possibly
-- on a different process or replica than the one that handled it. It cannot use
-- the in-memory map in app/core/voice_agent_state.py to find the session, so it
-- needs a durable mapping from ElevenLabs' conversation_id back to a sessions row
-- (app/api/v1/voice_agent.py::post_call_webhook, and now the recording proxy and
-- the dashboard's live-transcript pane, which key their Realtime channel off it).
--
-- Both statements are no-ops where the manual script was already run.

alter table public.sessions
  add column if not exists external_conversation_id text;

-- Partial: only voice sessions ever set this, so indexing the whatsapp rows'
-- NULLs would be pure overhead. Unique: one ElevenLabs conversation maps to
-- exactly one session, and the webhook's idempotency depends on that.
--
-- Deliberately not CONCURRENTLY: that cannot run inside a transaction block, and
-- the index is built over the (empty or near-empty) set of non-null values, so
-- the write lock is momentary.
create unique index if not exists sessions_external_conversation_id_idx
  on public.sessions (external_conversation_id)
  where external_conversation_id is not null;

comment on column public.sessions.external_conversation_id is
  'ElevenLabs conversation_id for voice sessions. NULL on every other channel.';

  
