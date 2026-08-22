-- Customer complaints.
--
-- Until now a complaint existed only as vocabulary: an NLP intent label, a
-- `messages.classification` string, and a seeded `session_main_types` row. The
-- conversation was escalated and then became a transcript nobody could filter.
-- This table is the record itself -- what the customer told us, under a
-- reference number we can quote back to them.
--
-- Written by the backend only (service role). The dashboard reads it.

CREATE TABLE public.complaints (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Quoted to the customer, so it must be stable and unique. Generated
  -- backend-side (app/crud/crud.py::create_complaint), not by a sequence, so it
  -- does not leak how many complaints the bank has received.
  reference_number       TEXT NOT NULL UNIQUE,

  -- ON DELETE SET NULL, deliberately NOT CASCADE: app/crud/cleanup.py purges
  -- expired sessions, and a complaint has to outlive the chat it came from.
  session_id             UUID REFERENCES public.sessions(id)  ON DELETE SET NULL,
  customer_id            UUID REFERENCES public.customers(id) ON DELETE SET NULL,

  channel                TEXT NOT NULL,
  customer_name          TEXT,
  customer_phone         TEXT,
  -- Masked before insert (app/core/nlp/normalize.py::mask_identifier). A raw
  -- national ID in an operational table is a liability with no matching benefit
  -- -- staff only ever need to confirm the last digits against the caller.
  national_id_masked     TEXT,

  category               TEXT NOT NULL,
  description            TEXT NOT NULL,
  -- Masked account number, same form the customer was shown. Never the full one.
  related_account_masked TEXT,
  preferred_contact      TEXT,
  language               TEXT NOT NULL DEFAULT 'ar',

  status                 TEXT NOT NULL DEFAULT 'new',
  -- Redacted transcript slice + anything channel-specific. Free-form on purpose:
  -- the voice channel and WhatsApp collect slightly different context.
  context                JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT complaints_status_check
    CHECK (status IN ('new', 'in_progress', 'resolved', 'closed'))
);

COMMENT ON TABLE public.complaints IS
  'Customer complaints captured by the assistant. Backend writes, dashboard reads.';

ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated staff member. The dashboard route is additionally
-- role-gated in the frontend (ProtectedRoute) and behind verify_jwt in FastAPI.
CREATE POLICY "Authenticated users can read complaints"
  ON public.complaints FOR SELECT
  TO authenticated
  USING (true);

-- Write: nobody through the Data API. The backend uses the service-role key,
-- which bypasses RLS; granting INSERT to `authenticated` here would let any
-- signed-in browser forge complaint records.
CREATE POLICY "Supervisors and admins can update complaints"
  ON public.complaints FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'supervisor')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'supervisor')
  );

CREATE TRIGGER update_complaints_updated_at
  BEFORE UPDATE ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- The dashboard lists newest-first and filters by status.
CREATE INDEX complaints_created_at_idx ON public.complaints (created_at DESC);
CREATE INDEX complaints_status_idx     ON public.complaints (status);
CREATE INDEX complaints_session_id_idx ON public.complaints (session_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.complaints;
