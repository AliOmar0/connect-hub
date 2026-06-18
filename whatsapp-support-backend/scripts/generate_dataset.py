import json
import os
import random

# Datasets will be saved to this directory
DATASET_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "dataset", "nlp")
os.makedirs(DATASET_DIR, exist_ok=True)

# Define 15 intents
INTENTS = [
    "ACCOUNT_INQUIRY", "ACCOUNT_OPENING", "CARD_INQUIRY", "CARD_REPLACEMENT",
    "CARD_ACTIVATION", "LOAN_INQUIRY", "LOAN_APPLICATION", "TRANSFER_LOCAL",
    "TRANSFER_INTERNATIONAL", "PASSWORD_RESET", "BRANCH_LOCATION", "COMPLAINT",
    "FRAUD_REPORT", "GENERAL_INFO", "GREETING"
]

# Provide varied templates in MSA, Levantine, and English to ensure balanced dataset
TEMPLATES = {
    "ACCOUNT_INQUIRY": [
        ("كم رصيدي بحسابي رقم 1234؟", "LEVANTINE"),
        ("ما هو رصيد حساب التوفير الخاص بي؟", "MSA"),
        ("What is the balance of my account?", "ENGLISH"),
    ],
    "ACCOUNT_OPENING": [
        ("كيف بفتح حساب جديد؟", "LEVANTINE"),
        ("أرغب في فتح حساب جاري جديد.", "MSA"),
        ("I want to open a new bank account.", "ENGLISH"),
    ],
    "CARD_INQUIRY": [
        ("بطاقتي الفيزا امتى بتخلص؟", "LEVANTINE"),
        ("متى تنتهي صلاحية بطاقتي الائتمانية؟", "MSA"),
        ("When does my visa card expire?", "ENGLISH"),
    ],
    "CARD_REPLACEMENT": [
        ("بطاقتي ضاعت بدي بدل فاقد", "LEVANTINE"),
        ("لقد فقدت بطاقتي وأريد إصدار بديل.", "MSA"),
        ("I lost my card, need a replacement.", "ENGLISH"),
    ],
    "CARD_ACTIVATION": [
        ("كيف بفعل البطاقة الجديدة؟", "LEVANTINE"),
        ("أرجو تفعيل بطاقة الصراف الآلي.", "MSA"),
        ("How do I activate my new ATM card?", "ENGLISH"),
    ],
    "LOAN_INQUIRY": [
        ("شو نسبة المرابحة على السيارات؟", "LEVANTINE"),
        ("ما هي شروط تمويل السيارات؟", "MSA"),
        ("What are the requirements for an auto loan?", "ENGLISH"),
    ],
    "LOAN_APPLICATION": [
        ("بدي أقدم على قرض شخصي ب 5000 دولار", "LEVANTINE"),
        ("أرغب بتقديم طلب تمويل بمبلغ 10000 دينار.", "MSA"),
        ("I want to apply for a loan of $5000.", "ENGLISH"),
    ],
    "TRANSFER_LOCAL": [
        ("بدي أحول 500 شيكل لحساب محلي", "LEVANTINE"),
        ("أريد تحويل مبلغ 1000 شيكل إلى حساب في بنك فلسطين.", "MSA"),
        ("Transfer 200 ILS to a local account.", "ENGLISH"),
    ],
    "TRANSFER_INTERNATIONAL": [
        ("كيف بحول مصاري لأمريكا؟", "LEVANTINE"),
        ("أريد إجراء حوالة دولية سويفت.", "MSA"),
        ("I need to make an international transfer.", "ENGLISH"),
    ],
    "PASSWORD_RESET": [
        ("نسيت كلمة السر لتطبيق إسلامي موبايل", "LEVANTINE"),
        ("أريد إعادة تعيين كلمة المرور الخاصة بي.", "MSA"),
        ("I forgot my password.", "ENGLISH"),
    ],
    "BRANCH_LOCATION": [
        ("وين أقرب فرع برام الله؟", "LEVANTINE"),
        ("أين يقع أقرب فرع في مدينة رام الله؟", "MSA"),
        ("Where is the nearest branch?", "ENGLISH"),
    ],
    "COMPLAINT": [
        ("الخدمة سيئة جدا الموظف تأخر علي", "LEVANTINE"),
        ("أريد تقديم شكوى رسمية بخصوص التأخير.", "MSA"),
        ("I want to file a complaint about bad service.", "ENGLISH"),
    ],
    "FRAUD_REPORT": [
        ("في خصم من حسابي ما عملته!", "LEVANTINE"),
        ("هناك عملية احتيال على بطاقتي ولم أقم بها.", "MSA"),
        ("My card was charged without my authorization!", "ENGLISH"),
    ],
    "GENERAL_INFO": [
        ("شو أوقات دوام البنك؟", "LEVANTINE"),
        ("ما هي أوقات العمل الرسمية للفروع؟", "MSA"),
        ("What are your working hours?", "ENGLISH"),
    ],
    "GREETING": [
        ("يعطيك العافية", "LEVANTINE"),
        ("السلام عليكم ورحمة الله وبركاته.", "MSA"),
        ("Hello, good morning.", "ENGLISH"),
    ],
}

def generate_data(num_samples_per_intent=50):
    train_data = []
    test_data = []
    
    for intent in INTENTS:
        templates = TEMPLATES.get(intent, [("مرحبا", "MSA")])
        for i in range(num_samples_per_intent):
            text, lang = random.choice(templates)
            # Add some minor augmentations
            if random.random() > 0.5:
                text = text.replace("؟", "").replace(".", "")
            if random.random() > 0.8:
                text = "لو سمحت " + text
                
            sample = {"text": text, "label": intent, "language": lang}
            
            # 80/20 Split
            if random.random() > 0.2:
                train_data.append(sample)
            else:
                test_data.append(sample)
                
    # Save
    with open(os.path.join(DATASET_DIR, "train.jsonl"), "w", encoding="utf-8") as f:
        for item in train_data:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")
            
    with open(os.path.join(DATASET_DIR, "test.jsonl"), "w", encoding="utf-8") as f:
        for item in test_data:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")
            
    print(f"Generated {len(train_data)} train and {len(test_data)} test samples.")

if __name__ == "__main__":
    generate_data()
