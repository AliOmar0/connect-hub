"""
Deterministic, versioned data generator for the intent classifier.

Produces balanced Arabic (MSA + Palestinian Levantine) and English examples
across all 15 canonical intents, then splits them into train / validation /
test JSONL files.

Reproducibility & versioning
----------------------------
- A fixed RNG seed (``SEED``) makes generation fully reproducible.
- ``DATASET_VERSION`` is stamped into every record and into the data card.
- Templates use slot fillers (amounts, branches, products, dates) so the set
  has lexical variety without manual labelling errors.

Usage
-----
    python -m app.dataset.nlp.generate_dataset

Outputs (next to this file):
    intents_train.jsonl, intents_val.jsonl, intents_test.jsonl, DATA_CARD.md
"""
from __future__ import annotations

import json
import os
import random
from typing import Dict, List

from app.models.nlp import IntentLabel, LanguageLabel

DATASET_VERSION = "1.0.0"
SEED = 20260622
PER_INTENT_PER_LANG = 24  # examples per intent per language

HERE = os.path.dirname(os.path.abspath(__file__))

# Slot fillers shared across templates.
AMOUNTS = ["500 شيكل", "1000 دولار", "250 دينار", "300$", "2000 ILS", "750 USD"]
AMOUNTS_EN = ["500 ILS", "1000 USD", "250 JOD", "$300", "2000 shekels", "750 dollars"]
BRANCHES_AR = ["رام الله", "نابلس", "الخليل", "غزة", "جنين", "بيت لحم", "طولكرم"]
BRANCHES_EN = ["Ramallah", "Nablus", "Hebron", "Gaza", "Jenin", "Bethlehem"]
PRODUCTS_AR = ["تمويل السيارات", "التمويل العقاري", "حساب التوفير", "إسلامي موبايل", "المرابحة"]
PRODUCTS_EN = ["car financing", "mortgage", "savings account", "Islami Mobile", "Murabaha"]
DATES_AR = ["اليوم", "بكرة", "الأسبوع القادم", "12/05/2026"]
DATES_EN = ["today", "tomorrow", "next week", "12/05/2026"]


def _t(items: List[str]) -> List[str]:
    return items


# Templates: IntentLabel -> {language: [templates]}.  {a}=amount {b}=branch
# {p}=product {d}=date placeholders are filled randomly when present.
TEMPLATES: Dict[IntentLabel, Dict[str, List[str]]] = {
    IntentLabel.ACCOUNT_INQUIRY: {
        "MSA": ["أرغب في معرفة رصيد حسابي", "ما هو رصيدي الحالي؟", "أريد الاطلاع على رصيد حسابي من فضلك", "كم يبلغ رصيد حسابي الآن؟"],
        "LEVANTINE_PS": ["بدي اعرف رصيدي", "شو رصيد حسابي هلأ؟", "كم معي بالحساب؟", "بدي شوف كم باقي بحسابي"],
        "ENGLISH": ["I want to check my account balance", "What is my current balance?", "Show me my account balance please", "How much money is in my account?"],
    },
    IntentLabel.TRANSFER_LOCAL: {
        "MSA": ["أريد تحويل {a} إلى حساب آخر داخل البنك", "كيف أحول مبلغ {a} محلياً؟", "أرغب بإجراء حوالة محلية بقيمة {a}"],
        "LEVANTINE_PS": ["بدي احول {a} لحساب تاني", "كيف بحول مصاري محلي؟", "بدي ابعت {a} لزلمة بنفس البنك"],
        "ENGLISH": ["I want to transfer {a} to another account", "How do I send money locally?", "Make a local transfer of {a}"],
    },
    IntentLabel.TRANSFER_INTERNATIONAL: {
        "MSA": ["أريد إجراء تحويل دولي إلى الخارج بقيمة {a}", "كيف أرسل حوالة خارجية عبر سويفت؟", "أرغب بتحويل {a} إلى دولة أخرى"],
        "LEVANTINE_PS": ["بدي احول مصاري عالخارج", "كيف بعمل حوالة خارجية سويفت؟", "بدي ابعت {a} لبرة فلسطين"],
        "ENGLISH": ["I need an international transfer abroad", "How can I send a SWIFT transfer overseas?", "Send {a} to another country"],
    },
    IntentLabel.CARD_SERVICES: {
        "MSA": ["أريد تفعيل بطاقتي", "كيف أصدر بطاقة جديدة؟", "ما هو سقف بطاقتي؟", "أرغب بتغيير رقم PIN للبطاقة"],
        "LEVANTINE_PS": ["بدي فعّل بطاقتي", "كيف بطلع بطاقة جديدة؟", "شو سقف بطاقتي؟"],
        "ENGLISH": ["I want to activate my card", "How do I issue a new card?", "What is my card limit?", "I need to change my card PIN"],
    },
    IntentLabel.CARD_LOST_STOLEN: {
        "MSA": ["لقد فقدت بطاقتي وأريد إيقافها فوراً", "بطاقتي مسروقة، أوقفوها", "أرجو إيقاف بطاقتي المفقودة"],
        "LEVANTINE_PS": ["ضاعت بطاقتي بدي اوقفها", "بطاقتي انسرقت، اوقفوها بسرعة", "فقدت بطاقتي شو بدي اعمل؟"],
        "ENGLISH": ["I lost my card, please block it now", "My card was stolen, block it", "I need to report a lost card"],
    },
    IntentLabel.STATEMENT_REQUEST: {
        "MSA": ["أريد كشف حساب مفصل", "أرجو إرسال كشف الحساب للشهر الماضي", "كيف أحصل على بيان الحساب؟"],
        "LEVANTINE_PS": ["بدي كشف حساب", "ممكن كشف الحساب لآخر شهر؟", "بدي شوف حركات حسابي"],
        "ENGLISH": ["I need an account statement", "Send me last month's statement", "How can I get my transactions list?"],
    },
    IntentLabel.FINANCING_INQUIRY: {
        "MSA": ["أريد الاستفسار عن {p}", "كيف يعمل تمويل المرابحة؟", "ما هي شروط {p}؟", "أرغب بتمويل سيارة عبر المرابحة"],
        "LEVANTINE_PS": ["بدي اسأل عن {p}", "كيف بشتغل تمويل المرابحة؟", "شو شروط {p}؟"],
        "ENGLISH": ["I want to ask about {p}", "How does Murabaha financing work?", "What are the conditions for {p}?"],
    },
    IntentLabel.EXCHANGE_RATE: {
        "MSA": ["ما هو سعر صرف الدولار اليوم؟", "أريد معرفة أسعار العملات", "كم سعر صرف الدينار مقابل الشيكل؟"],
        "LEVANTINE_PS": ["شو سعر الدولار اليوم؟", "بدي اعرف اسعار العملات", "كم صار الدينار؟"],
        "ENGLISH": ["What is today's dollar exchange rate?", "I want to know the currency rates", "What's the JOD to ILS rate?"],
    },
    IntentLabel.BRANCH_ATM_INFO: {
        "MSA": ["أين أقرب فرع في {b}؟", "ما هي أوقات دوام فرع {b}؟", "أين أجد أقرب صراف آلي؟"],
        "LEVANTINE_PS": ["وين اقرب فرع بـ{b}؟", "شو اوقات دوام فرع {b}؟", "وين في صراف قريب؟"],
        "ENGLISH": ["Where is the nearest branch in {b}?", "What are the working hours of {b} branch?", "Where can I find the nearest ATM?"],
    },
    IntentLabel.PRODUCT_INFO: {
        "MSA": ["أريد معلومات عن {p}", "ما الفرق بين الحساب الجاري وحساب التوفير؟", "كيف أفتح حساباً جديداً؟"],
        "LEVANTINE_PS": ["بدي معلومات عن {p}", "شو الفرق بين الجاري والتوفير؟", "كيف بفتح حساب جديد؟"],
        "ENGLISH": ["I want information about {p}", "What's the difference between current and savings accounts?", "How do I open a new account?"],
    },
    IntentLabel.SHARIA_INQUIRY: {
        "MSA": ["هل هذا المنتج متوافق مع الشريعة؟", "ما حكم الربا في التمويل؟", "هل التمويل لديكم حلال؟"],
        "LEVANTINE_PS": ["هاد المنتج حلال؟", "شو حكم الربا عندكم؟", "التمويل تبعكم شرعي؟"],
        "ENGLISH": ["Is this product Sharia compliant?", "What is the ruling on riba in financing?", "Is your financing halal?"],
    },
    IntentLabel.COMPLAINT: {
        "MSA": ["أريد تقديم شكوى على الخدمة", "الخدمة كانت سيئة جداً وأنا غير راضٍ", "لدي شكوى بخصوص معاملتي"],
        "LEVANTINE_PS": ["بدي اقدم شكوى", "الخدمة كانت كتير سيئة وانا زعلان", "عندي مشكلة وبدي اشتكي"],
        "ENGLISH": ["I want to file a complaint about the service", "The service was very bad and I'm not satisfied", "I have a complaint about my transaction"],
    },
    IntentLabel.ESCALATION_REQUEST: {
        "MSA": ["أريد التحدث مع موظف", "حوّلني إلى ممثل خدمة العملاء", "أرغب بالتحدث مع شخص حقيقي"],
        "LEVANTINE_PS": ["بدي احكي مع حد", "حولني لموظف", "بدي احكي مع ممثل خدمة"],
        "ENGLISH": ["I want to talk to a human", "Transfer me to a customer service agent", "Let me speak to a representative"],
    },
    IntentLabel.GENERAL_INFO: {
        "MSA": ["السلام عليكم", "مرحباً، أريد بعض المساعدة", "أهلاً، كيف يمكنكم مساعدتي؟"],
        "LEVANTINE_PS": ["مرحبا كيفكم", "اهلين بدي مساعدة", "السلام عليكم شو الاخبار"],
        "ENGLISH": ["Hello", "Hi, I need some help", "Good morning, how can you help me?"],
    },
    IntentLabel.UNKNOWN: {
        "MSA": ["ما هي عاصمة اليابان؟", "أخبرني نكتة من فضلك", "كم عدد الكواكب في المجموعة الشمسية؟"],
        "LEVANTINE_PS": ["شو احسن مطعم بالبلد؟", "احكيلي نكتة", "شو الطقس بكرة؟"],
        "ENGLISH": ["What is the capital of Japan?", "Tell me a joke", "How many planets are there?"],
    },
}


def _fill(template: str, rng: random.Random, lang: str) -> str:
    a = rng.choice(AMOUNTS_EN if lang == "ENGLISH" else AMOUNTS)
    b = rng.choice(BRANCHES_EN if lang == "ENGLISH" else BRANCHES_AR)
    p = rng.choice(PRODUCTS_EN if lang == "ENGLISH" else PRODUCTS_AR)
    d = rng.choice(DATES_EN if lang == "ENGLISH" else DATES_AR)
    return template.format(a=a, b=b, p=p, d=d)


def generate() -> List[dict]:
    rng = random.Random(SEED)
    records: List[dict] = []
    for intent, by_lang in TEMPLATES.items():
        for lang, templates in by_lang.items():
            for i in range(PER_INTENT_PER_LANG):
                tmpl = templates[i % len(templates)]
                text = _fill(tmpl, rng, lang)
                records.append(
                    {
                        "text": text,
                        "intent": intent.value,
                        "language": lang,
                        "dataset_version": DATASET_VERSION,
                    }
                )
    rng.shuffle(records)
    return records


def split(records: List[dict]):
    """Stratified 70/15/15 split by intent."""
    rng = random.Random(SEED + 1)
    by_intent: Dict[str, List[dict]] = {}
    for r in records:
        by_intent.setdefault(r["intent"], []).append(r)

    train, val, test = [], [], []
    for intent, items in by_intent.items():
        rng.shuffle(items)
        n = len(items)
        n_train = int(n * 0.70)
        n_val = int(n * 0.15)
        train += items[:n_train]
        val += items[n_train : n_train + n_val]
        test += items[n_train + n_val :]
    rng.shuffle(train)
    rng.shuffle(val)
    rng.shuffle(test)
    return train, val, test


def _write_jsonl(path: str, rows: List[dict]):
    with open(path, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def write_data_card(train, val, test):
    total = len(train) + len(val) + len(test)
    lines = [
        f"# Intent Dataset — Data Card (v{DATASET_VERSION})",
        "",
        "## Provenance",
        "Synthetically generated from curated bilingual templates "
        "(`generate_dataset.py`). No customer data is used. All identifiers in "
        "examples are fictitious.",
        "",
        "## Generation",
        f"- Generator: `app/dataset/nlp/generate_dataset.py`",
        f"- RNG seed: `{SEED}` (fully reproducible)",
        f"- Examples per intent per language: {PER_INTENT_PER_LANG}",
        "- Languages: MSA, Palestinian Levantine (LEVANTINE_PS), English",
        "- Slot fillers: amounts, branches, products, dates",
        "",
        "## Labels",
        f"- {len(IntentLabel)} canonical intents (closed set).",
        "",
        "## Split (stratified by intent, seeded)",
        f"- total: {total}",
        f"- train: {len(train)}",
        f"- validation: {len(val)}",
        f"- test: {len(test)}",
        "",
        "## Per-intent counts (train/val/test)",
    ]
    for intent in IntentLabel:
        tr = sum(1 for r in train if r["intent"] == intent.value)
        va = sum(1 for r in val if r["intent"] == intent.value)
        te = sum(1 for r in test if r["intent"] == intent.value)
        lines.append(f"- {intent.value}: {tr}/{va}/{te}")
    lines.append("")
    lines.append(
        "## Notes & limitations\n"
        "- Template-based generation yields high lexical regularity; real "
        "traffic will be noisier. Treat reported metrics as an upper bound for "
        "the heuristic baseline and a sanity check for the fine-tuned model.\n"
        "- For production, augment with de-identified real chat logs and "
        "re-balance accordingly, bumping `DATASET_VERSION`."
    )
    with open(os.path.join(HERE, "DATA_CARD.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


def main():
    records = generate()
    train, val, test = split(records)
    _write_jsonl(os.path.join(HERE, "intents_train.jsonl"), train)
    _write_jsonl(os.path.join(HERE, "intents_val.jsonl"), val)
    _write_jsonl(os.path.join(HERE, "intents_test.jsonl"), test)
    write_data_card(train, val, test)
    print(
        f"Generated dataset v{DATASET_VERSION}: "
        f"{len(train)} train / {len(val)} val / {len(test)} test"
    )


if __name__ == "__main__":
    main()
