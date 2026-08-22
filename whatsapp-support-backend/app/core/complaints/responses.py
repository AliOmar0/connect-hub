# -*- coding: utf-8 -*-
"""
Arabic reply templates for the complaint collection flow.

Same rule as ``app/core/bank/responses.py``: every string the customer sees here
is a literal, built outside the LLM. In particular the reference number is
produced by the database write and echoed by :func:`build_complaint_saved_reply`
-- the model is told in system_prompt.py section 12 never to invent one, and this
is the only place a real one is ever spoken.

No Markdown: section 6 of the system prompt forbids it in customer replies.
"""

from __future__ import annotations

from typing import Optional

from app.core.complaints.intents import CATEGORY_LABELS, COMPLAINT_CATEGORIES
from app.core.nlp.normalize import mask_identifier


def build_complaint_category_prompt() -> str:
    lines = [f"{i}. {label}" for i, (_, label, _) in enumerate(COMPLAINT_CATEGORIES, start=1)]
    return (
        "يؤسفني ما حدث، وسأساعدك في تسجيل شكواك رسمياً.\n"
        "ما موضوع الشكوى؟ أرسل رقم الخيار المناسب:\n"
        + "\n".join(lines)
        + '\nأو قول "إلغاء" للتراجع.'
    )


def build_complaint_category_retry() -> str:
    return (
        "لم أتعرف على الخيار. يرجى إرسال رقم من القائمة السابقة، "
        'أو وصف الموضوع بكلمة واحدة مثل "بطاقة" أو "تمويل"، أو قول "إلغاء".'
    )


def build_complaint_description_prompt() -> str:
    return (
        "شكراً لك. يرجى وصف المشكلة بإيجاز في رسالة واحدة: ماذا حدث ومتى.\n"
        "لا ترسل كلمة المرور أو الرقم السري أو رمز التحقق أو رقم البطاقة كاملاً."
    )


def build_complaint_description_retry() -> str:
    return "أحتاج وصفاً أوضح قليلاً حتى يتمكن الموظف من متابعة شكواك. ما الذي حدث بالضبط؟"


def build_complaint_understood_reply(
    category: str,
    *,
    location: Optional[str] = None,
    severity: str = "medium",
    card_capture: bool = False,
) -> str:
    """Opening line when triage read the problem out of the customer's message.

    Replaces the numbered category menu for these customers. Someone who wrote
    "الصراف بلع بطاقتي في فرع رام الله" has already told us the category and the
    place; answering with "choose 1-6" reads as though nobody listened. Naming
    back what we understood also gives them a chance to correct it.

    ``card_capture`` opens with reassurance instead of urgency. A card the ATM
    retained is sitting inside a machine the bank owns -- nobody can use it. The
    assistant used to answer these with the LOST-OR-STOLEN script ("block your
    card immediately to protect your account"), which frightens the customer over
    a card that was never at risk and points them at the call centre instead of a
    tracked complaint. See system_prompt.py section 4.1.
    """
    label = CATEGORY_LABELS.get(category, category)
    where = f" في {location}" if location else ""

    if card_capture:
        return (
            "أتفهم انزعاجك. بطاقتك محتجزة داخل جهاز الصراف الآلي التابع للبنك، "
            "وهي في مكان آمن ولا يستطيع أحد استخدامها، فلا داعي للقلق على حسابك.\n"
            f"سأسجّل لك شكوى رسمية{where} لمتابعة استرجاع البطاقة أو إصدار بديل، "
            "وسأعطيك رقماً مرجعياً تتابع فيه.\n"
            'إن لم يكن هذا صحيحاً، قول "إلغاء" ونبدأ من جديد.'
        )

    urgent = (
        " وسأعطي شكواك أولوية عاجلة."
        if severity in ("critical", "high")
        else ""
    )
    return (
        f"يؤسفني ما حدث. فهمت أن المشكلة تتعلق بـ{label}{where}،"
        f" وسأسجّل شكواك رسمياً.{urgent}\n"
        'إن لم يكن هذا صحيحاً، قول "إلغاء" ونبدأ من جديد.'
    )


def build_complaint_location_prompt(category: str) -> str:
    """Ask where it happened -- only for the categories where it is actionable."""
    if category == "cards":
        return (
            "أين حدثت المشكلة؟ اذكر اسم الفرع أو موقع جهاز الصراف الآلي "
            "(مثال: صراف فرع رام الله - الماصيون).\n"
            "الفرع المسؤول عن الجهاز هو الذي يحتفظ بالبطاقة، لذلك موقعه مهم لمتابعة طلبك."
        )
    return "في أي فرع حدث ذلك؟ اذكر اسم الفرع أو المدينة."


def build_complaint_location_retry() -> str:
    return (
        "لم أتعرف على الموقع. اذكر اسم الفرع أو المدينة في رسالة واحدة، "
        'أو قول "تخطي" إذا كنت لا تتذكر.'
    )


def build_complaint_identity_prompt() -> str:
    """Asked right after the problem is understood, before contact preference.

    Same free-text shape as app.core.bank.responses.build_identity_request_reply
    (name + national ID together, one message) -- parsed by the same
    extract_identity_claim, so the customer sees one format across both flows
    instead of two.
    """
    return (
        "شكراً لتوضيح المشكلة. لتسجيل الشكوى باسمك، يرجى إرسال اسمك الكامل ورقم الهوية الوطنية "
        "معاً في رسالة واحدة، مثال:\n"
        "محمد أحمد علي 123456789\n"
        'أو قول "إلغاء" للتراجع.'
    )


def build_complaint_identity_retry() -> str:
    return (
        "لم أتمكن من التعرف على الاسم ورقم الهوية في رسالتك. يرجى إرسالهما معاً بهذا الشكل:\n"
        "محمد أحمد علي 123456789\n"
        'أو قول "إلغاء" للتراجع.'
    )


def build_complaint_contact_prompt() -> str:
    return "كيف تفضل أن نتواصل معك بخصوص الشكوى؟\n1. واتساب\n2. اتصال هاتفي\n3. بريد إلكتروني"


# Shown to the customer, so these are the Arabic labels -- not the enum values
# stored in the database.
_SEVERITY_LABELS = {
    "critical": "عاجلة جداً",
    "high": "عاجلة",
    "medium": "عادية",
    "low": "عادية",
}


def build_complaint_confirm_prompt(
    category: str,
    description: str,
    contact: str,
    full_name: Optional[str] = None,
    national_id: Optional[str] = None,
    location: Optional[str] = None,
    severity: str = "medium",
) -> str:
    """The last thing the customer sees before anything is written.

    Every field that will be stored appears here, including the ones triage
    filled in from their own message -- confirming a record you were not shown
    is not consent.
    """
    label = CATEGORY_LABELS.get(category, category)
    lines = [
        "هذا ملخص شكواك قبل تسجيلها:",
        f"الاسم: {full_name}" if full_name else None,
        f"رقم الهوية: {mask_identifier(national_id)}" if national_id else None,
        f"الموضوع: {label}",
        f"الموقع: {location}" if location else None,
        f"الوصف: {description}",
        f"الأولوية: {_SEVERITY_LABELS.get(severity, 'عادية')}",
        f"وسيلة التواصل: {contact}",
        'أرسل "نعم" للتأكيد والتسجيل، أو "إلغاء" للتراجع.',
    ]
    return "\n".join(line for line in lines if line is not None)


def build_complaint_saved_reply(reference_number: str) -> str:
    """The ONLY place a real reference number reaches the customer.

    Deliberately promises follow-up without promising a date -- section 12 of
    the system prompt forbids committing to a resolution time the bank has not
    committed to.
    """
    return (
        "تم تسجيل شكواك بنجاح. الرقم المرجعي هو:\n"
        f"{reference_number}\n"
        "احتفظ به للمتابعة. سيقوم أحد موظفي خدمة العملاء بمراجعة الشكوى والتواصل معك."
    )


def build_complaint_failed_reply() -> str:
    return (
        "واجهنا مشكلة تقنية أثناء تسجيل شكواك ولم يتم حفظها. "
        "سأحوّلك إلى أحد موظفينا لمتابعة الأمر معك مباشرة."
    )


def build_complaint_cancelled_reply() -> str:
    return "تم إلغاء تسجيل الشكوى. كيف يمكنني مساعدتك؟"


def build_complaint_abandoned_reply() -> str:
    """Given up on a slot after MAX_SLOT_RETRIES. Hands over rather than looping."""
    return (
        "يبدو أنني لم أستطع تسجيل التفاصيل بشكل صحيح. "
        "سأحوّلك إلى أحد موظفي خدمة العملاء ليأخذ شكواك عنك مباشرة."
    )


def build_complaint_followup_reply(reference: Optional[str] = None) -> str:
    """Customer is chasing an existing complaint -- do not open a second one."""
    suffix = f" بخصوص الشكوى رقم {reference}." if reference else "."
    return "سأحوّلك إلى أحد موظفي خدمة العملاء لمتابعة شكواك السابقة" + suffix


def build_complaint_escalated_reply() -> str:
    """Sent after a HIGH-severity complaint is saved and a human takes over.

    Deliberately after the reference number, not instead of it: the customer
    keeps something to quote back to us even if the handover is slow.
    """
    return (
        "ونظراً لأهمية ما حدث، لن أكتفي بتسجيل الشكوى: "
        "سأحوّل محادثتك الآن إلى أحد موظفي خدمة العملاء ليتابعها معك مباشرة من هنا."
    )
