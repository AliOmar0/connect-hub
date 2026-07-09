-- Migration: Create Bank Scraper tables for automated knowledge base ingestion
-- Implements scraper crawl-job tracking and per-URL crawl metadata,
-- independent of knowledge_documents content (see design.md, Data Models)

-- Tag knowledge_documents rows by origin (manual upload vs. scraper)
ALTER TABLE public.knowledge_documents
    ADD COLUMN source TEXT NOT NULL DEFAULT 'upload'
        CHECK (source IN ('upload', 'scraper'));

-- Crawl job execution history
CREATE TABLE IF NOT EXISTS public.crawl_jobs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    trigger_type TEXT NOT NULL CHECK (trigger_type IN ('scheduled', 'manual')),
    triggered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    pages_visited INTEGER NOT NULL DEFAULT 0,
    pages_succeeded INTEGER NOT NULL DEFAULT 0,
    pages_failed INTEGER NOT NULL DEFAULT 0,
    failure_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Per-URL crawl metadata, independent of document content (Requirement 4.3)
CREATE TABLE IF NOT EXISTS public.scraped_pages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    url TEXT NOT NULL UNIQUE,
    knowledge_document_id UUID REFERENCES public.knowledge_documents(id) ON DELETE SET NULL,
    last_crawl_job_id UUID REFERENCES public.crawl_jobs(id) ON DELETE SET NULL,
    checksum TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'indexed', 'skipped', 'failed')),
    retry_count INTEGER NOT NULL DEFAULT 0,
    last_attempted_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.crawl_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scraped_pages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for crawl_jobs
CREATE POLICY "Allow read for authenticated users" ON public.crawl_jobs
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow insert/update for service role" ON public.crawl_jobs
    FOR ALL USING (auth.role() = 'service_role' OR auth.role() = 'authenticated');

-- RLS Policies for scraped_pages
CREATE POLICY "Allow read for authenticated users" ON public.scraped_pages
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow insert/update for service role" ON public.scraped_pages
    FOR ALL USING (auth.role() = 'service_role' OR auth.role() = 'authenticated');

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_status ON public.crawl_jobs(status);
CREATE INDEX IF NOT EXISTS idx_scraped_pages_document ON public.scraped_pages(knowledge_document_id);
CREATE INDEX IF NOT EXISTS idx_scraped_pages_status ON public.scraped_pages(status);

-- Trigger to keep updated_at current on scraped_pages
DROP TRIGGER IF EXISTS update_scraped_pages_updated_at ON public.scraped_pages;
CREATE TRIGGER update_scraped_pages_updated_at
    BEFORE UPDATE ON public.scraped_pages
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON COLUMN public.knowledge_documents.source IS 'Origin of the document: upload (manual) or scraper (automated crawl)';
COMMENT ON TABLE public.crawl_jobs IS 'Execution history for bank website crawl jobs (Scraper_Service)';
COMMENT ON TABLE public.scraped_pages IS 'Per-URL crawl metadata (checksum, status, retries), independent of knowledge_documents content';
COMMENT ON COLUMN public.scraped_pages.checksum IS 'Checksum of the most recently scraped main text for this URL, used to detect content changes';
COMMENT ON COLUMN public.scraped_pages.retry_count IS 'Number of consecutive failed fetch attempts for this URL';
