# -*- coding: utf-8 -*-
"""
Arabic reply templates for verified account questions.

Every string a customer receives about their account is built here from literal
templates. Account values are never sent to an LLM, and the text persisted to
the ``messages`` table is deliberately NOT the text the customer receives -- see
:func:`build_account_audit_line`.
"""

from __future__ import annotations

from typing import Any, Callable, Dict, Sequence

from app.core.bank.intents import AccountField
from app.core.nlp.normalize import mask_identifier

# Sentinel prefix on every persisted account reply. The webhook's history
# builder swaps any message starting with this for a fixed placeholder before
# it can reach the LLM prompt.
PROTECTED_PREFIX = "[محتوى محمي]"

# Bank_db_oss stores account/card/financing status as an English token. Anything
# not in this map is passed through untranslated rather than guessed at.
_STATUS_LABELS: Dict[str, str] = {
    "active": "نشط",
    "inactive": "غير نشط",
    "frozen": "مجمّد",
    "blocked": "موقوف",
    "suspended": "موقوف مؤقتاً",
    "closed": "مغلق",
    "expired": "منتهي الصلاحية",
    "pending": "قيد المعالجة",
    "paid": "مسدَّد",
    "overdue": "متأخر",
}

_DIRECTION_LABELS: Dict[str, str] = {"credit": "إيداع", "debit": "سحب"}

# A section the customer has nothing in is a real answer, not an error.
_EMPTY_SECTION_TEXT: Dict[AccountField, str] = {
    AccountField.TRANSACTIONS: "لا توجد حركات حديثة على حسابك.",
    AccountField.CARDS: "لا توجد بطاقات مرتبطة بحسابك.",
    AccountField.LOANS: "لا توجد تمويلات قائمة على حسابك.",
}


def _status(value: Any) -> str:
    text = str(value or "").strip()
    return _STATUS_LABELS.get(text.lower(), text)


def _day(value: Any) -> str:
    """Render a timestamp as YYYY/MM/DD.

    Deliberately string slicing rather than datetime parsing: PostgREST hands
    back an ISO-8601 string, the day is all the customer needs, and a parse
    failure here would take out the whole reply for a cosmetic detail.
    """
    text = str(value or "").strip()
    if len(text) >= 10 and text[4] == "-" and text[7] == "-":
        return f"{text[0:4]}/{text[5:7]}/{text[8:10]}"
    return text


def _render_transactions(account: dict) -> str:
    rows = account.get(AccountField.TRANSACTIONS.value) or []
    if not rows:
        return _EMPTY_SECTION_TEXT[AccountField.TRANSACTIONS]
    lines = []
    for r in rows:
        direction = _DIRECTION_LABELS.get(str(r.get("direction", "")).lower(), "")
        amount = f"{r.get('amount', '')} {r.get('currency') or ''}".strip()
        parts = [p for p in (_day(r.get("occurred_at")), direction, amount) if p]
        description = str(r.get("description") or "").strip()
        if description:
            parts.append(description)
        lines.append(" - ".join(parts))
    return "\n".join(lines)


def _render_cards(account: dict) -> str:
    rows = account.get(AccountField.CARDS.value) or []
    if not rows:
        return _EMPTY_SECTION_TEXT[AccountField.CARDS]
    lines = []
    for r in rows:
        # Masked for the same reason account_number is: a card number in a
        # WhatsApp thread outlives the conversation it was sent in.
        number = mask_identifier(str(r.get("card_number") or ""), visible=4)
        parts = [p for p in (str(r.get("card_type") or "").strip(), number) if p]
        status = _status(r.get("card_status"))
        if status:
            parts.append(status)
        lines.append(" - ".join(parts))
    return "\n".join(lines)


def _render_loans(account: dict) -> str:
    rows = account.get(AccountField.LOANS.value) or []
    if not rows:
        return _EMPTY_SECTION_TEXT[AccountField.LOANS]
    lines = []
    for r in rows:
        currency = r.get("currency") or ""
        parts = [p for p in (str(r.get("product") or "").strip(),) if p]
        if r.get("outstanding") is not None:
            parts.append(f"المتبقي {r['outstanding']} {currency}".strip())
        due = _day(r.get("next_due_date"))
        if due:
            parts.append(f"القسط القادم {due}")
        status = _status(r.get("loan_status"))
        if status:
            parts.append(status)
        lines.append(" - ".join(parts))
    return "\n".join(lines)


# Balances and amounts go out in full -- that is the answer the customer asked
# for. Identifiers are ALWAYS masked, outbound and in storage alike.
FIELD_RENDERERS: Dict[AccountField, Callable[[dict], str]] = {
    AccountField.BALANCE: lambda a: f"{a['balance']} {a.get('currency', '')}".strip(),
    AccountField.AVAILABLE_BALANCE: lambda a: (
        f"{a['available_balance']} {a.get('currency', '')}".strip()
    ),
    AccountField.CURRENCY: lambda a: str(a["currency"]),
    AccountField.ACCOUNT_NUMBER: lambda a: mask_identifier(str(a["account_number"]), visible=4),
    AccountField.ACCOUNT_TYPE: lambda a: str(a["account_type"]),
    AccountField.ACCOUNT_STATUS: lambda a: _status(a["account_status"]),
    AccountField.TRANSACTIONS: _render_transactions,
    AccountField.CARDS: _render_cards,
    AccountField.LOANS: _render_loans,
}

_FIELD_LABELS: Dict[AccountField, str] = {
    AccountField.BALANCE: "رصيد حسابك",
    AccountField.AVAILABLE_BALANCE: "الرصيد المتاح",
    AccountField.CURRENCY: "عملة حسابك",
    AccountField.ACCOUNT_NUMBER: "رقم حسابك",
    AccountField.ACCOUNT_TYPE: "نوع حسابك",
    AccountField.ACCOUNT_STATUS: "حالة حسابك",
    AccountField.TRANSACTIONS: "آخر الحركات",
    AccountField.CARDS: "بطاقاتك",
    AccountField.LOANS: "تمويلاتك",
}

# Fields rendered as a labelled block on its own lines rather than inline after
# the label, because their value is a list.
_BLOCK_FIELDS = frozenset({AccountField.TRANSACTIONS, AccountField.CARDS, AccountField.LOANS})

# Fields whose rendered value needs the account currency alongside it.
_NEEDS_CURRENCY = frozenset({AccountField.BALANCE, AccountField.AVAILABLE_BALANCE})


def required_crud_fields(fields: Sequence[AccountField]) -> tuple[str, ...]:
    """Column names to fetch for these intents.

    Balance-shaped fields also need CURRENCY, or the amount goes out bare.
    (Transactions and financings carry their own per-row currency from the RPC,
    so they do not.)
    """
    needed: list[str] = ["owner_name"]
    for f in fields:
        needed.append(f.value)
        if f in _NEEDS_CURRENCY:
            needed.append(AccountField.CURRENCY.value)
    return tuple(dict.fromkeys(needed))


def build_account_reply(fields: Sequence[AccountField], account: dict) -> str:
    """The message the CUSTOMER receives. Identifiers masked."""
    name = str(account.get("owner_name") or "").strip()
    greeting = f"تم التحقق بنجاح! أهلاً بك {name}." if name else "تم التحقق بنجاح!"

    lines = []
    for f in fields:
        renderer = FIELD_RENDERERS.get(f)
        if renderer is None or f.value not in account:
            continue
        try:
            rendered = renderer(account)
        except (KeyError, TypeError):
            continue
        # A list section gets its own labelled block; a scalar stays inline.
        # Section 6 of the system prompt forbids Markdown in customer replies,
        # so this is plain text and newlines only.
        if f in _BLOCK_FIELDS:
            lines.append(f"{_FIELD_LABELS[f]}:\n{rendered}")
        else:
            lines.append(f"{_FIELD_LABELS[f]}: {rendered}")

    if not lines:
        return build_account_unavailable_reply()
    return greeting + "\n" + "\n".join(lines) + "\nهل هناك شيء آخر يمكنني مساعدتك به؟"


def build_account_audit_line(fields: Sequence[AccountField], account: dict) -> str:
    """The message PERSISTED to the transcript. No balance, no full identifiers.

    The customer-facing reply used to be stored verbatim, and the webhook builds
    its LLM history from stored messages -- so the balance and the unmasked
    account number were fed back into the prompt on the customer's very next
    turn. Storing field *names* instead is what keeps account data out of the
    prompt for good.
    """
    labels = []
    for f in fields:
        if f is AccountField.ACCOUNT_NUMBER and f.value in account:
            try:
                labels.append(f"{_FIELD_LABELS[f]} ({FIELD_RENDERERS[f](account)})")
                continue
            except (KeyError, TypeError):
                pass
        labels.append(_FIELD_LABELS.get(f, f.value))
    joined = "، ".join(labels) if labels else "بيانات الحساب"
    return f"{PROTECTED_PREFIX} تم إرسال {joined} إلى العميل بعد تحقق ناجح."


def build_account_not_found_reply() -> str:
    return "تم التحقق من هويتك، ولكن لم نجد بيانات حساب مرتبطة بهذا الرقم. سأحوّلك إلى أحد موظفينا للمتابعة."


def build_account_unavailable_reply() -> str:
    return "تم التحقق من هويتك، ولكن لا يمكنني الوصول إلى بيانات حسابك حالياً. سأحوّلك إلى أحد موظفينا للمتابعة."


def build_field_unavailable_reply() -> str:
    """Answer for an account attribute Bank_db_oss does not hold (e.g. IBAN).

    Deliberately does NOT start verification: sending an OTP and then having
    nothing to disclose is worse than answering plainly up front.
    """
    return (
        "رقم الآيبان غير متاح عبر هذه القناة. يمكنك الاطلاع عليه من تطبيق البنك "
        "أو كشف الحساب، وسأحوّلك الآن إلى أحد موظفينا إن أردت المساعدة."
    )


def build_otp_prompt_reply() -> str:
    return (
        "للاطلاع على بيانات حسابك بأمان، أرسلنا رمز تحقق (OTP) إلى رقمك المسجل. "
        'يرجى تزويدي بالرمز عند وصوله، أو قول "إلغاء" للتراجع.'
    )


def build_otp_wrong_reply(remaining: int) -> str:
    return f'رمز التحقق غير صحيح. المحاولات المتبقية: {remaining}. يمكنك المحاولة مجدداً أو قول "إلغاء".'


def build_otp_exhausted_reply() -> str:
    return "تم تجاوز عدد المحاولات المسموح بها. تم إلغاء طلب التحقق لحماية حسابك. يمكنك طلب بيانات حسابك مرة أخرى للبدء من جديد."


def build_otp_cancelled_reply() -> str:
    return "تم إلغاء طلب التحقق. كيف يمكنني مساعدتك؟"


def build_otp_error_reply() -> str:
    return "واجهنا مشكلة تقنية أثناء التحقق من الرمز. يرجى المحاولة مرة أخرى بعد قليل."


def build_otp_send_failed_reply() -> str:
    return "عذراً، لم نتمكن من إرسال رمز التحقق حالياً. يرجى المحاولة لاحقاً."


def build_otp_rate_limited_reply() -> str:
    return "لقد طلبت رمز تحقق عدة مرات خلال فترة قصيرة. يرجى الانتظار قليلاً قبل المحاولة مرة أخرى."


def build_identity_request_reply() -> str:
    """First message in the identity-first verification flow.

    Asked BEFORE any OTP is sent: the phone the OTP goes to is resolved from
    this identity claim, not assumed to be the number the customer is
    chatting from -- see app/core/bank/verification_flow.py. Sent for a
    complaint as well as an account question, so the wording covers both.
    """
    return (
        "للتحقق من هويتك بأمان، يرجى إرسال رقم الهوية الوطنية وتاريخ ميلادك معاً "
        "في رسالة واحدة، مثال:\n"
        "123456789 15/05/1990\n"
        'أو قول "إلغاء" للتراجع.'
    )


def build_identity_malformed_reply() -> str:
    """The reply didn't parse as (national ID, date of birth) -- re-prompt,
    don't count it as a failed attempt (see extract_identity_claim's
    docstring). Also sent when both values were found but one is unusable --
    a date that isn't real, or an ID that isn't 9 digits."""
    return (
        "لم أتمكن من التعرف على رقم الهوية وتاريخ الميلاد في رسالتك. يرجى إرسالهما بهذا الشكل:\n"
        "123456789 15/05/1990\n"
        'أو قول "إلغاء" للتراجع.'
    )


def build_identity_not_found_reply(remaining: int) -> str:
    """No Bank_db_oss customer matches the stated national ID + date of birth.

    Deliberately generic: never reveal whether the ID number or the date was
    the mismatch, or this becomes an oracle for guessing valid national IDs.
    """
    return (
        "لم نتمكن من العثور على حساب مطابق لرقم الهوية وتاريخ الميلاد المدخلين. "
        f"يرجى التأكد منهما والمحاولة مرة أخرى. المحاولات المتبقية: {remaining}."
    )


def build_identity_exhausted_reply() -> str:
    return (
        "تم تجاوز عدد المحاولات المسموح بها للتحقق من الهوية. "
        "يرجى التواصل مع مركز الاتصال الرقمي على 1700 220 220 للمتابعة، "
        "أو طلب بيانات حسابك مرة أخرى للبدء من جديد."
    )


def build_llm_unavailable_reply() -> str:
    """Shown when every LLM provider is down and no answer can be produced.

    Deliberately NOT an apology that ends the conversation. The old behaviour
    sent "نعتذر، لم أتمكن من معالجة طلبك حالياً." as if it were a normal reply:
    the session stayed active, no staff member was told, and the customer was
    left holding a dead end with no next step. This promises a human, and the
    caller genuinely hands the session over before sending it.
    """
    return (
        "أعتذر، لا أستطيع الوصول إلى النظام للإجابة على استفسارك في هذه اللحظة. "
        "لن أتركك من دون رد: سأحوّل محادثتك الآن إلى أحد موظفي خدمة العملاء "
        "ليتابع معك مباشرة من هنا."
    )


def build_critical_incident_reply() -> str:
    """Fraud, theft, or a compromised account -- straight to a human.

    No intake form: making someone whose money is being taken right now answer a
    five-slot questionnaire is the wrong response, and every minute counts. The
    security advice is included because it is the one useful thing the customer
    can do while they wait.
    """
    return (
        "أتفهم خطورة ما تصفه، وسأحوّل محادثتك فوراً إلى موظف مختص لمتابعتها على الفور.\n"
        "إلى أن يصلك الموظف، وللحفاظ على أمان حسابك: لا تشارك رمز التحقق أو "
        "الرقم السري مع أي شخص، ولو ادّعى أنه من البنك.\n"
        "لإيقاف البطاقة فوراً يمكنك الاتصال بمركز الاتصال على 1700 220 220."
    )
