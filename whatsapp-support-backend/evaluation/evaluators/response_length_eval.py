"""
Response-length compliance evaluation.

Verifies the authoritative output validators enforce the word-count limits:
  * KB-grounded answers: <= 150 words (app.core.rag.enforce_word_limit).
  * General responses: <= 150 words (app.core.prompts.validate_response).
  * Voice responses: <= 60 words (assistant endpoint policy).
Also confirms disallowed formatting (** and ") is stripped and leaked PII is
redacted. Deterministic; no network calls.
"""
from __future__ import annotations

from evaluation import config
from evaluation.utils import base_record, write_csv
from app.core.prompts import validate_response
from app.core.rag import enforce_word_limit, WORD_LIMIT

COMMAND = "python -m evaluation.run_all response_length"

_LONG_AR = "هذا نص تجريبي طويل جداً يحتوي على معلومات مصرفية. " * 40
_LONG_EN = "This is a very long sample banking answer with lots of detail. " * 40
_FORMATTED = 'هنا **عنوان** و"اقتباس" مع رقم حساب 1234567890 ورقم جوال 0599123456.'


def _words(text: str) -> int:
    return len(text.split())


def run() -> dict:
    cases = []

    # 1) KB word-limit enforcement.
    kb_ar = enforce_word_limit(_LONG_AR, WORD_LIMIT)
    cases.append({"case": "kb_limit_ar", "limit": WORD_LIMIT, "words": _words(kb_ar),
                  "ok": _words(kb_ar) <= WORD_LIMIT + 1})

    # 2) General validator (default 150).
    gen_max = config.THRESHOLDS["response_max_words"]
    gen = validate_response(_LONG_EN, max_words=gen_max)
    cases.append({"case": "general_limit_en", "limit": gen_max, "words": _words(gen),
                  "ok": _words(gen) <= gen_max + 1})

    # 3) Voice validator (60).
    voice_max = config.THRESHOLDS["response_voice_max_words"]
    voice = validate_response(_LONG_AR, max_words=voice_max)
    cases.append({"case": "voice_limit_ar", "limit": voice_max, "words": _words(voice),
                  "ok": _words(voice) <= voice_max + 1})

    # 4) Formatting + PII redaction.
    cleaned = validate_response(_FORMATTED, max_words=gen_max)
    no_format = "**" not in cleaned and '"' not in cleaned
    no_pii = "1234567890" not in cleaned and "0599123456" not in cleaned
    cases.append({"case": "format_and_pii_strip", "limit": gen_max,
                  "words": _words(cleaned), "ok": no_format and no_pii})

    write_csv("response_length_cases.csv", cases,
              ["case", "limit", "words", "ok"])

    all_ok = all(c["ok"] for c in cases)
    record = base_record(
        metric="response_length_compliance",
        command=COMMAND,
        dataset={
            "name": "synthetic_response_cases",
            "path": "evaluation/evaluators/response_length_eval.py",
            "size": len(cases),
            "description": "Synthetic long/formatted inputs exercising the output validators (AR+EN, voice + text).",
        },
        thresholds={"response_max_words": gen_max,
                    "response_voice_max_words": voice_max,
                    "kb_word_limit": WORD_LIMIT},
        model_versions={"validator": "prompts.validate_response", "kb_limit": "rag.enforce_word_limit"},
    )
    record["results"] = {"cases": cases, "all_passed": all_ok,
                         "cases_file": "response_length_cases.csv"}
    record["status"] = "pass" if all_ok else "fail"
    record["limitations"] = (
        "Validates the enforcement layer, not LLM verbosity directly; the LLM is "
        "also instructed to be concise but its raw output is always capped here."
    )
    return record
