-- A terminal state for escalations nobody picked up.
--
-- Until now every automatic close landed on 'completed', the same value an
-- agent writes when they have actually resolved the conversation. So an
-- escalation that sat unanswered until the cleanup loop swept it up was
-- indistinguishable, in the dashboard and in any report, from one a human
-- worked through to the end. The two facts are not the same fact.
--
-- 'auto_closed' is written only by app/crud/crud.py::close_inactive_sessions,
-- for sessions that were 'escalated' and went untouched past
-- settings.ESCALATION_TIMEOUT_MINUTES. It is terminal in exactly the same ways
-- 'completed' is: ended_at/duration_seconds are stamped, the session leaves the
-- live queues, and retention (app/crud/cleanup.py) is free to purge it.
--
-- ALTER TYPE ... ADD VALUE cannot be used in the same transaction that adds it,
-- so this migration adds the value and NOTHING else. Any statement that reads
-- or writes the new label belongs in a later migration.

ALTER TYPE public.session_status ADD VALUE IF NOT EXISTS 'auto_closed';
