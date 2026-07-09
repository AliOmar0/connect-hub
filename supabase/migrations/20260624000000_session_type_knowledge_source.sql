-- Migration: allow session_main_types content to be indexed into the RAG
-- knowledge base as its own document source.
--
-- Context: the "Session Types & AI Knowledge" management UI is moving from
-- SettingsPage into KnowledgePage, and each session type's
-- description/ai_prompt should now be indexed into Qdrant via the same
-- knowledge_documents/knowledge_document_versions pipeline already used for
-- manual uploads (source='upload') and the scraper (source='scraper'), so
-- the RAG assistant (app/core/rag.py retrieve()) and the LLM's session-type
-- context injection (app/core/llm.py get_ai_response) both draw from a
-- single source of truth instead of the LLM prompt separately re-reading
-- session_main_types on every message.

-- Widen the source check constraint to also allow 'session_type'. Postgres
-- names an inline column CHECK constraint <table>_<column>_check by default,
-- which is what the 20260622000000 migration produced.
ALTER TABLE public.knowledge_documents
    DROP CONSTRAINT IF EXISTS knowledge_documents_source_check;

ALTER TABLE public.knowledge_documents
    ADD CONSTRAINT knowledge_documents_source_check
        CHECK (source IN ('upload', 'scraper', 'session_type'));

-- Link a knowledge_documents row back to the session_main_types row it was
-- generated from, so re-saving a session type updates/re-indexes the SAME
-- document instead of creating duplicates, and deleting a session type can
-- clean up its associated document + Qdrant chunks.
ALTER TABLE public.knowledge_documents
    ADD COLUMN IF NOT EXISTS source_session_type_id UUID
        REFERENCES public.session_main_types(id) ON DELETE SET NULL;

-- At most one knowledge_documents row per session type.
CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_documents_source_session_type
    ON public.knowledge_documents(source_session_type_id)
    WHERE source_session_type_id IS NOT NULL;

COMMENT ON COLUMN public.knowledge_documents.source_session_type_id IS
    'When source=''session_type'', the session_main_types row this document '
    'was generated from. NULL for upload/scraper-sourced documents.';
