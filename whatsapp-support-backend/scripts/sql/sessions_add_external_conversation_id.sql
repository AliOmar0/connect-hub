-- =============================================================================
-- sessions.external_conversation_id.  RUN THIS IN THE MAIN PROJECT
-- (SUPABASE_URL / SUPABASE_KEY) -- NOT Bank_db_oss.
--
-- WHY
-- ---
-- The ElevenLabs voice agent's post-call webhook arrives after the call ends,
-- possibly on a different process/replica than the one that handled the call.
-- It cannot rely on in-memory state (app/core/voice_agent_state.py) to find the
-- right session -- it needs a durable, DB-level way to map ElevenLabs'
-- `conversation_id` back to a `sessions` row.
-- =============================================================================

alter table public.sessions
  add column if not exists external_conversation_id text;

-- Partial unique index: only voice sessions set this column, and a given
-- ElevenLabs conversation_id must map to exactly one session.
create unique index if not exists sessions_external_conversation_id_idx
  on public.sessions (external_conversation_id)
  where external_conversation_id is not null;
