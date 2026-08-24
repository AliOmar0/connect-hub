"""Format validation for the (national_id, date_of_birth) identity claim.

Shared by both channels: the voice agent receives the two values as separate
tool-call arguments (app/api/v1/voice_agent.py's verify_identity), while
WhatsApp pulls them out of one free-text message first
(app.core.bank.intents.extract_identity_claim) and then validates them here.
Running both through the same function is what keeps a claim that one channel
accepts from being rejected by the other.

This is deliberately a *format* check only, run entirely before any database
read. Unlike a DB-lookup failure -- which must stay generic, or it becomes an
enumeration oracle for national ID numbers (see
resolve_customer_phone_by_identity in verification_flow.py) -- telling a
customer "that wasn't 9 digits" or "that isn't a real date" discloses nothing
about who does or doesn't have an account, so it is safe to name the offending
field precisely. That is what lets the agent re-ask for one field instead of
making the customer repeat everything.

DATE AMBIGUITY: `05/06/1990` is genuinely ambiguous, and no amount of parsing
resolves it. This module commits to DAY-FIRST (the local convention) for
separator forms, and treats a leading 4-digit group as a year (ISO). The voice
agent is instructed to send ISO `YYYY-MM-DD`, and both channels read the date
back to the customer for confirmation before it is used -- that read-back, not
the parser, is what actually catches a transposed day and month.
"""

from __future__ import annotations

import re
from datetime import date
from typing import Literal, Optional, Tuple

from app.core.bank.intents import NATIONAL_ID_LENGTH
from app.core.nlp.normalize import normalize_digits

IdentityProblem = Literal["invalid_national_id", "invalid_date_of_birth"]

# Mirrors the bank schema's own CHECK constraint on customers.date_of_birth
# (`date_of_birth <= CURRENT_DATE - '18 years'`, scripts/sql/bankdboss.sql:40).
# A younger date cannot match any row, so it is rejected here rather than
# spent on a round-trip that is certain to miss.
_MIN_AGE_YEARS = 18
# Not a schema rule -- just a sanity bound, so a mis-heard year like 1090
# comes back as "say that again" instead of a silent no-match.
_MAX_AGE_YEARS = 120

# Year first: 1990-05-15, 1990/05/15
_ISO_DATE = re.compile(r"^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$")
# Day first: 15/05/1990, 15-05-1990, 15.05.1990
_DAY_FIRST_DATE = re.compile(r"^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$")


def _clean_national_id(raw: str) -> Tuple[str, int]:
    """Digit-normalise and strip everything else. Returns (digits, count)."""
    digits = re.sub(r"\D", "", normalize_digits(raw or ""))
    return digits, len(digits)


def _parse_date_of_birth(raw: str) -> Optional[date]:
    """Parse a stated date of birth into a real `date`, or None.

    Rejects anything that isn't a calendar date (30 February), is in the
    future, or falls outside the plausible age band.
    """
    text = normalize_digits(raw or "").strip()
    if not text:
        return None

    match = _ISO_DATE.match(text)
    if match:
        year, month, day = (int(g) for g in match.groups())
    else:
        match = _DAY_FIRST_DATE.match(text)
        if not match:
            return None
        day, month, year = (int(g) for g in match.groups())

    try:
        parsed = date(year, month, day)
    except ValueError:
        # Not a real calendar date -- 30 February, month 13, day 0.
        return None

    today = date.today()
    if parsed > today:
        return None
    # Approximate years-elapsed; exact enough for a plausibility band, and it
    # never rejects a date the DB would have accepted (the boundary cases sit
    # well inside 18..120).
    age = today.year - parsed.year - ((today.month, today.day) < (parsed.month, parsed.day))
    if age < _MIN_AGE_YEARS or age > _MAX_AGE_YEARS:
        return None

    return parsed


def normalize_identity_input(
    national_id: str, date_of_birth: str
) -> Tuple[Optional[Tuple[str, date]], Optional[IdentityProblem], int]:
    """Validate and clean a (national_id, date_of_birth) pair before any DB read.

    Returns:
      ((clean_id, parsed_dob), None, digit_count) on success.
      (None, "invalid_national_id", digit_count)  if not exactly
          NATIONAL_ID_LENGTH digits -- digit_count lets the caller say how many
          digits were actually heard ("سمعت ٨ أرقام").
      (None, "invalid_date_of_birth", digit_count) if the date is unparseable,
          impossible, in the future, or outside the plausible age band.

    national_id is checked first: a customer who botched both fields gets one
    re-prompt rather than two in a row, and the agent's prompt re-asks for
    whichever field the problem names.
    """
    clean_id, digit_count = _clean_national_id(national_id)
    if digit_count != NATIONAL_ID_LENGTH:
        return None, "invalid_national_id", digit_count

    parsed_dob = _parse_date_of_birth(date_of_birth)
    if parsed_dob is None:
        return None, "invalid_date_of_birth", digit_count

    return (clean_id, parsed_dob), None, digit_count
