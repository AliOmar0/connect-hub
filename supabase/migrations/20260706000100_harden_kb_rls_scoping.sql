-- Harden RLS for knowledge base and RAG retrieval logs.
-- Scope: Version_2 security hardening for issue #26.

-- Remove broad role-only policies from the initial KB migration.
DROP POLICY IF EXISTS "Allow read access for all authenticated users" ON public.knowledge_documents;
DROP POLICY IF EXISTS "Allow insert for authenticated users" ON public.knowledge_documents;
DROP POLICY IF EXISTS "Allow update for authenticated users" ON public.knowledge_documents;
DROP POLICY IF EXISTS "Allow delete for authenticated users" ON public.knowledge_documents;

DROP POLICY IF EXISTS "Allow read access for all authenticated users" ON public.knowledge_document_versions;
DROP POLICY IF EXISTS "Allow insert for authenticated users" ON public.knowledge_document_versions;
DROP POLICY IF EXISTS "Allow update for authenticated users" ON public.knowledge_document_versions;

DROP POLICY IF EXISTS "Allow read for authenticated users" ON public.rag_retrieval_logs;
DROP POLICY IF EXISTS "Allow insert for service role" ON public.rag_retrieval_logs;

-- knowledge_documents:
-- - elevated roles (admin/supervisor) can manage all rows
-- - uploader can manage their own rows
CREATE POLICY "KB docs scoped read"
  ON public.knowledge_documents FOR SELECT
  TO authenticated
  USING (
    public.has_elevated_role(auth.uid())
    OR uploader_id = auth.uid()
  );

CREATE POLICY "KB docs scoped insert"
  ON public.knowledge_documents FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_elevated_role(auth.uid())
    OR uploader_id = auth.uid()
  );

CREATE POLICY "KB docs scoped update"
  ON public.knowledge_documents FOR UPDATE
  TO authenticated
  USING (
    public.has_elevated_role(auth.uid())
    OR uploader_id = auth.uid()
  )
  WITH CHECK (
    public.has_elevated_role(auth.uid())
    OR uploader_id = auth.uid()
  );

CREATE POLICY "KB docs scoped delete"
  ON public.knowledge_documents FOR DELETE
  TO authenticated
  USING (
    public.has_elevated_role(auth.uid())
    OR uploader_id = auth.uid()
  );

-- knowledge_document_versions:
-- access follows ownership/elevated access of parent document
CREATE POLICY "KB versions scoped read"
  ON public.knowledge_document_versions FOR SELECT
  TO authenticated
  USING (
    public.has_elevated_role(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.knowledge_documents d
      WHERE d.id = knowledge_document_versions.document_id
        AND d.uploader_id = auth.uid()
    )
  );

CREATE POLICY "KB versions scoped insert"
  ON public.knowledge_document_versions FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_elevated_role(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.knowledge_documents d
      WHERE d.id = knowledge_document_versions.document_id
        AND d.uploader_id = auth.uid()
    )
  );

CREATE POLICY "KB versions scoped update"
  ON public.knowledge_document_versions FOR UPDATE
  TO authenticated
  USING (
    public.has_elevated_role(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.knowledge_documents d
      WHERE d.id = knowledge_document_versions.document_id
        AND d.uploader_id = auth.uid()
    )
  )
  WITH CHECK (
    public.has_elevated_role(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.knowledge_documents d
      WHERE d.id = knowledge_document_versions.document_id
        AND d.uploader_id = auth.uid()
    )
  );

-- rag_retrieval_logs:
-- read should be privileged; writes should be by service role or elevated users
CREATE POLICY "RAG logs privileged read"
  ON public.rag_retrieval_logs FOR SELECT
  TO authenticated
  USING (public.has_elevated_role(auth.uid()));

CREATE POLICY "RAG logs scoped insert"
  ON public.rag_retrieval_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.role() = 'service_role'
    OR public.has_elevated_role(auth.uid())
  );
