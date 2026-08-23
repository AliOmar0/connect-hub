"""
Deterministic fallback from a triage intent to a session type.

`sessions.main_type_id` had exactly one writer: an LLM call in
app/api/v1/webhook.py::auto_classify_session. When that call returned no usable
UUID -- a bad day for the model, a truncated reply, a provider timeout -- the
function logged "no match" and gave up, and the session's Type column stayed
empty forever. Every blank Type in the dashboard is one of those.

The pipeline already knows what the customer wanted, though: triage runs on the
same message and produces an IntentLabel, deterministically for the keyword
paths. This maps that label onto the session types seeded in
supabase/migrations/20260222134100_seed_session_types.sql, so the fallback is a
coarse-but-right answer instead of nothing at all.

Matched by exact seeded name. A name with no matching row is skipped rather than
guessed at: staff filter on this column, so a wrong type is worse than a blank.
"""
from __future__ import annotations

from typing import Dict, Optional

from app.models.nlp import IntentLabel

# The session type a filed complaint always gets, whatever the intent said.
# Exported because the complaint intake sets it directly rather than waiting on
# the classifier: a filed complaint is a known type, not a guess.
COMPLAINT_SESSION_TYPE = "شكاوى"

# Deliberately partial. GENERAL_INFO and UNKNOWN are absent: "the customer said
# something we could not place" is exactly the case where a guess is noise, and
# a blank Type reads more honestly than a wrong one.
INTENT_TO_SESSION_TYPE: Dict[IntentLabel, str] = {
    IntentLabel.COMPLAINT: COMPLAINT_SESSION_TYPE,
    IntentLabel.CARD_LOST_STOLEN: "بطاقات الصراف الآلي",
    IntentLabel.CARD_SERVICES: "بطاقات الصراف الآلي",
    IntentLabel.ACCOUNT_INQUIRY: "الحسابات",
    IntentLabel.STATEMENT_REQUEST: "الحساب الشخصي",
    IntentLabel.TRANSFER_LOCAL: "الحوالات البنكية",
    IntentLabel.TRANSFER_INTERNATIONAL: "الحوالات البنكية",
    IntentLabel.FINANCING_INQUIRY: "التمويل",
    IntentLabel.EXCHANGE_RATE: "أسعار العملات",
    IntentLabel.BRANCH_ATM_INFO: "الفروع",
    IntentLabel.PRODUCT_INFO: "منتجات البنك",
    IntentLabel.SHARIA_INQUIRY: "استفسارات عامة",
    IntentLabel.ESCALATION_REQUEST: "متابعة معاملات",
}


def session_type_for_intent(intent: Optional[str]) -> Optional[str]:
    """The seeded session-type name for a triage intent, or None.

    Takes the raw string form (`triage_result.intent.value`) because that is
    what the webhook has in hand. Unregistered values coerce to UNKNOWN, which
    is not in the map, so they yield None.
    """
    if not intent:
        return None
    return INTENT_TO_SESSION_TYPE.get(IntentLabel.coerce(intent))
