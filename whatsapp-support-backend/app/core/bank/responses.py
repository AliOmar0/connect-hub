# -*- coding: utf-8 -*-
"""
Arabic reply templates for verified account questions.

Every string a customer receives about their account is built here from literal
templates. Account values are never sent to an LLM, and the text persisted to
the ``messages`` table is deliberately NOT the text the customer receives -- see
:func:`build_account_audit_line`.
"""

from __future__ import annotations

from typing import Callable, Dict, Sequence

from app.core.bank.intents import AccountField
from app.core.nlp.normalize import mask_identifier

# Sentinel prefix on every persisted account reply. The webhook's history
# builder swaps any message starting with this for a fixed placeholder before
# it can reach the LLM prompt.
PROTECTED_PREFIX = "[محتوى محمي]"

# Balance and currency go out in full -- that is the answer the customer asked
# for. Identifiers are ALWAYS masked, outbound and in storage alike.
FIELD_RENDERERS: Dict[AccountField, Callable[[dict], str]] = {
    AccountField.BALANCE: lambda a: f"{a['balance']} {a.get('currency', '')}".strip(),
    AccountField.CURRENCY: lambda a: str(a["currency"]),
    AccountField.ACCOUNT_NUMBER: lambda a: mask_identifier(str(a["account_number"]), visible=4),
}

_FIELD_LABELS: Dict[AccountField, str] = {
    AccountField.BALANCE: "رصيد حسابك",
    AccountField.CURRENCY: "عملة حسابك",
    AccountField.ACCOUNT_NUMBER: "رقم حسابك",
}


def required_crud_fields(fields: Sequence[AccountField]) -> tuple[str, ...]:
    """Column names to fetch for these intents (BALANCE also needs CURRENCY)."""
    needed: list[str] = ["owner_name"]
    for f in fields:
        needed.append(f.value)
        if f is AccountField.BALANCE:
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
            lines.append(f"{_FIELD_LABELS[f]}: {renderer(account)}")
        except (KeyError, TypeError):
            continue

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
