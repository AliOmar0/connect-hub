-- Migration: Add content column to knowledge_document_versions
-- Required for rollback/reindex to rebuild Qdrant chunks from stored text.

ALTER TABLE public.knowledge_document_versions
    ADD COLUMN IF NOT EXISTS content TEXT;

COMMENT ON COLUMN public.knowledge_document_versions.content IS 'Raw extracted text used to rebuild Qdrant chunks on rollback/reindex without the original file.';
