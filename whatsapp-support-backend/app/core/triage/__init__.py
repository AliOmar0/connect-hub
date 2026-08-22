"""Understanding what the customer needs, and how urgently.

An LLM classifier with a deterministic keyword floor underneath it. See
``classifier.py`` for why the model is advisory and ``rules.py`` for why the
lexicons can only ever raise severity.
"""

from app.core.triage.classifier import (
    TRIAGE_TIMEOUT,
    rules_only,
    triage,
)
from app.core.triage.rules import (
    apply_severity_floor,
    lexicon_category,
    lexicon_severity,
    mentions_card_capture,
)
from app.core.triage.schema import Severity, TriageResult

__all__ = [
    "Severity",
    "TRIAGE_TIMEOUT",
    "TriageResult",
    "apply_severity_floor",
    "lexicon_category",
    "lexicon_severity",
    "mentions_card_capture",
    "rules_only",
    "triage",
]
