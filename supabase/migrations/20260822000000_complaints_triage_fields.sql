-- Triage fields for complaints.
--
-- The complaints table recorded WHAT the customer said but nothing about how bad
-- it was or where it happened, so every complaint arrived in the dashboard
-- looking equally urgent. A captured card in Ramallah and a mild grumble about
-- branch queues sorted the same way: newest first, nothing else.
--
-- These columns come from app/core/triage, which reads them out of the
-- customer's own message. Still backend-writes-only: no INSERT policy exists on
-- this table and none is added here (see 20260820000000_create_complaints.sql).

ALTER TABLE public.complaints
  -- Drives dashboard ordering and whether the conversation is also handed to a
  -- human. DEFAULT 'medium' on purpose: rows written before this migration are
  -- real complaints of unknown urgency, and the safe reading of "unknown" is
  -- "worth a look", not "ignore".
  ADD COLUMN severity             TEXT NOT NULL DEFAULT 'medium',

  -- Branch name / city / ATM location, as the customer stated it. Free text, not
  -- an FK: customers write "صراف فرع رام الله - الماصيون", not a branch id, and
  -- forcing that into a lookup would drop the detail that makes it actionable.
  ADD COLUMN location             TEXT,
  ADD COLUMN atm_identifier       TEXT,

  -- When it happened, as free text ("من ساعة", "أمس الساعة 3"). Deliberately NOT
  -- a timestamptz: the model reads a phrase, and parsing "أمس" into an instant
  -- would invent a precision the customer never gave. Staff read the phrase.
  ADD COLUMN incident_at_text     TEXT,

  -- One-line PII-masked summary for the queue view, so staff triage the list
  -- without opening every description.
  ADD COLUMN ai_summary           TEXT,

  -- The IntentLabel from app/models/nlp.py. Text, not an enum: that set is owned
  -- by Python and adding a member should not require a migration.
  ADD COLUMN intent               TEXT,

  -- ON DELETE SET NULL, matching session_id and customer_id: a complaint has to
  -- outlive both the employee record and the chat it came from.
  ADD COLUMN assigned_to          UUID REFERENCES public.employees(id) ON DELETE SET NULL,

  -- The session handed to a human because of THIS complaint. Until now the
  -- complaint and its escalation had no link in either direction, so a staff
  -- member reading one could not find the other.
  ADD COLUMN escalated_session_id UUID REFERENCES public.sessions(id)  ON DELETE SET NULL;

ALTER TABLE public.complaints
  ADD CONSTRAINT complaints_severity_check
  CHECK (severity IN ('critical', 'high', 'medium', 'low'));

COMMENT ON COLUMN public.complaints.severity IS
  'critical=fraud/theft in progress, high=concrete loss or blocked asset, medium=dissatisfaction, low=informational.';
COMMENT ON COLUMN public.complaints.incident_at_text IS
  'When it happened, in the customer''s own words. Not parsed into a timestamp on purpose.';

-- The dashboard lists open complaints worst-first. A plain severity index does
-- not serve that: the composite matches the actual ORDER BY so the common view
-- is one index scan.
CREATE INDEX complaints_severity_idx ON public.complaints (severity);
CREATE INDEX complaints_triage_queue_idx
  ON public.complaints (status, severity, created_at DESC);

-- RLS is already enabled with SELECT for authenticated staff and UPDATE for
-- admins/supervisors. Those policies are column-agnostic, so the new columns are
-- covered without change and no new policy is added.
