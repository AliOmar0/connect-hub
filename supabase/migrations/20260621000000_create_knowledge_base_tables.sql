-- Migration: Create Knowledge Base tables for RAG system
-- Implements FR-03.03 and FR-06 requirements

-- Create knowledge_documents table
CREATE TABLE IF NOT EXISTS public.knowledge_documents (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    current_version_id UUID,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'indexing', 'indexed', 'failed')),
    uploader_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create knowledge_document_versions table
CREATE TABLE IF NOT EXISTS public.knowledge_document_versions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    document_id UUID NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    checksum TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    file_type TEXT NOT NULL,
    content_path TEXT, -- Path to stored content in Supabase Storage (optional)
    uploader_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'indexing', 'indexed', 'failed')),
    indexed_chunks INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    indexed_at TIMESTAMP WITH TIME ZONE,
    
    UNIQUE(document_id, version_number)
);

-- Create rag_retrieval_logs table for FR-06 compliance
CREATE TABLE IF NOT EXISTS public.rag_retrieval_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
    query_redacted TEXT NOT NULL,
    document_ids TEXT[] DEFAULT '{}',
    scores FLOAT[] DEFAULT '{}',
    num_results INTEGER DEFAULT 0,
    threshold FLOAT NOT NULL DEFAULT 0.75,
    latency_ms FLOAT NOT NULL,
    fallback_triggered BOOLEAN DEFAULT FALSE,
    model_decision TEXT, -- What the LLM decided to do with this info
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rag_retrieval_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for knowledge_documents
CREATE POLICY "Allow read access for all authenticated users" ON public.knowledge_documents
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow insert for authenticated users" ON public.knowledge_documents
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow update for authenticated users" ON public.knowledge_documents
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Allow delete for authenticated users" ON public.knowledge_documents
    FOR DELETE USING (auth.role() = 'authenticated');

-- RLS Policies for knowledge_document_versions
CREATE POLICY "Allow read access for all authenticated users" ON public.knowledge_document_versions
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow insert for authenticated users" ON public.knowledge_document_versions
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow update for authenticated users" ON public.knowledge_document_versions
    FOR UPDATE USING (auth.role() = 'authenticated');

-- RLS Policies for rag_retrieval_logs (read-only for most users)
CREATE POLICY "Allow read for authenticated users" ON public.rag_retrieval_logs
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow insert for service role" ON public.rag_retrieval_logs
    FOR INSERT WITH CHECK (auth.role() = 'service_role' OR auth.role() = 'authenticated');

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_status ON public.knowledge_documents(status);
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_uploader ON public.knowledge_documents(uploader_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_versions_document ON public.knowledge_document_versions(document_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_versions_status ON public.knowledge_document_versions(status);
CREATE INDEX IF NOT EXISTS idx_rag_logs_session ON public.rag_retrieval_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_rag_logs_created ON public.rag_retrieval_logs(created_at);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_knowledge_documents_updated_at ON public.knowledge_documents;
CREATE TRIGGER update_knowledge_documents_updated_at
    BEFORE UPDATE ON public.knowledge_documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE public.knowledge_documents IS 'Documents in the knowledge base for RAG retrieval';
COMMENT ON TABLE public.knowledge_document_versions IS 'Version history for knowledge base documents with rollback support';
COMMENT ON TABLE public.rag_retrieval_logs IS 'Audit log for RAG retrievals with PII redaction (FR-06)';

COMMENT ON COLUMN public.knowledge_documents.current_version_id IS 'Reference to the currently active version';
COMMENT ON COLUMN public.knowledge_documents.status IS 'Document status: pending, indexing, indexed, failed';
COMMENT ON COLUMN public.knowledge_document_versions.checksum IS 'SHA-256 checksum for integrity verification';
COMMENT ON COLUMN public.knowledge_document_versions.indexed_chunks IS 'Number of chunks indexed in Qdrant';
COMMENT ON COLUMN public.rag_retrieval_logs.query_redacted IS 'Query text with PII redacted for logging';
COMMENT ON COLUMN public.rag_retrieval_logs.fallback_triggered IS 'True if no results above threshold (escalation offer shown)';
