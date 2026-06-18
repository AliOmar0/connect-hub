-- ============================================================
-- Migration: Real RAG Knowledge Base Tables
-- Applies to: Supabase (PostgreSQL)
-- FR-03.03 (semantic retrieval) & FR-06 (KB lifecycle)
-- Run order: after existing schema migrations
-- ============================================================

-- Enable uuid extension (idempotent)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────────────────────
-- Table 1: knowledge_documents
-- Tracks every uploaded knowledge-base document
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS knowledge_documents (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    filename        TEXT NOT NULL,
    file_type       TEXT NOT NULL CHECK (file_type IN ('pdf', 'txt')),
    checksum        TEXT NOT NULL,                  -- SHA-256 hex
    uploader_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','indexing','indexed','failed','rolling_back')),
    error_message   TEXT,
    word_count      INTEGER DEFAULT 0,
    chunk_count     INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevent duplicate uploads of identical content
CREATE UNIQUE INDEX IF NOT EXISTS uq_knowledge_documents_checksum
    ON knowledge_documents (checksum)
    WHERE status NOT IN ('failed', 'rolling_back');

CREATE INDEX IF NOT EXISTS ix_knowledge_documents_status
    ON knowledge_documents (status);

CREATE INDEX IF NOT EXISTS ix_knowledge_documents_uploader
    ON knowledge_documents (uploader_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_knowledge_documents_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_knowledge_documents_updated_at ON knowledge_documents;
CREATE TRIGGER trg_knowledge_documents_updated_at
    BEFORE UPDATE ON knowledge_documents
    FOR EACH ROW EXECUTE FUNCTION update_knowledge_documents_updated_at();

-- ─────────────────────────────────────────────────────────────
-- Table 2: knowledge_document_versions
-- Full version history per document (for rollback support)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS knowledge_document_versions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id     UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
    version         INTEGER NOT NULL,               -- monotonic per document
    checksum        TEXT NOT NULL,                  -- SHA-256 of this version
    status          TEXT NOT NULL DEFAULT 'indexed'
                        CHECK (status IN ('indexed', 'superseded', 'rolled_back')),
    rollback_target UUID REFERENCES knowledge_document_versions(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_knowledge_document_versions_doc_ver
    ON knowledge_document_versions (document_id, version);

CREATE INDEX IF NOT EXISTS ix_knowledge_document_versions_doc
    ON knowledge_document_versions (document_id);

-- ─────────────────────────────────────────────────────────────
-- Table 3: rag_audit_log
-- Post-PII-redacted record of every retrieval call
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rag_audit_log (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id          UUID,                               -- nullable; WhatsApp session
    query_redacted      TEXT NOT NULL,                      -- PII already stripped
    retrieved_doc_ids   UUID[] DEFAULT '{}',               -- up to 3 document IDs
    scores              FLOAT[] DEFAULT '{}',              -- cosine scores
    result_count        INTEGER NOT NULL DEFAULT 0 CHECK (result_count BETWEEN 0 AND 3),
    model_name          TEXT NOT NULL,                      -- embedding model identifier
    latency_ms          INTEGER NOT NULL DEFAULT 0,
    fallback_triggered  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_rag_audit_log_session
    ON rag_audit_log (session_id);

CREATE INDEX IF NOT EXISTS ix_rag_audit_log_created
    ON rag_audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS ix_rag_audit_log_fallback
    ON rag_audit_log (fallback_triggered);

-- ─────────────────────────────────────────────────────────────
-- RLS Policies (adjust to your auth strategy)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE knowledge_documents        ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rag_audit_log              ENABLE ROW LEVEL SECURITY;

-- Service-role bypass (backend uses service role key)
CREATE POLICY "service_role_all_knowledge_documents"
    ON knowledge_documents FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "service_role_all_knowledge_document_versions"
    ON knowledge_document_versions FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "service_role_all_rag_audit_log"
    ON rag_audit_log FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- ─────────────────────────────────────────────────────────────
-- Helpful views for the report endpoints
-- ─────────────────────────────────────────────────────────────

-- RAG Relevance Report view
CREATE OR REPLACE VIEW rag_relevance_report AS
SELECT
    DATE_TRUNC('day', created_at)           AS day,
    COUNT(*)                                AS total_queries,
    COUNT(*) FILTER (WHERE result_count > 0) AS queries_with_results,
    COUNT(*) FILTER (WHERE fallback_triggered) AS fallback_count,
    ROUND(AVG(result_count)::NUMERIC, 2)    AS avg_result_count,
    ROUND(
        (COUNT(*) FILTER (WHERE result_count > 0)::NUMERIC
         / NULLIF(COUNT(*), 0) * 100), 1
    )                                       AS hit_rate_pct
FROM rag_audit_log
GROUP BY 1
ORDER BY 1 DESC;

-- RAG Latency Report view
CREATE OR REPLACE VIEW rag_latency_report AS
SELECT
    DATE_TRUNC('hour', created_at)          AS hour,
    COUNT(*)                                AS query_count,
    MIN(latency_ms)                         AS min_ms,
    ROUND(AVG(latency_ms)::NUMERIC, 0)      AS avg_ms,
    PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY latency_ms) AS p50_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_ms,
    MAX(latency_ms)                         AS max_ms
FROM rag_audit_log
GROUP BY 1
ORDER BY 1 DESC;

-- ─────────────────────────────────────────────────────────────
-- Rollback helper function
-- Marks the current version superseded and restores a target version
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION rollback_document_version(
    p_document_id   UUID,
    p_target_ver_id UUID
)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    -- Mark all current indexed versions as superseded
    UPDATE knowledge_document_versions
    SET status = 'superseded'
    WHERE document_id = p_document_id
      AND status = 'indexed';

    -- Mark target version as rolled_back (it will be re-indexed)
    UPDATE knowledge_document_versions
    SET status = 'rolled_back'
    WHERE id = p_target_ver_id;

    -- Set document to rolling_back state
    UPDATE knowledge_documents
    SET status = 'rolling_back', updated_at = NOW()
    WHERE id = p_document_id;
END;
$$;
