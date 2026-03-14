import json
import requests
import os
import time
import random
import uuid
from typing import List, Optional

# ─────────────────────────────────────────────
# CONFIGURATION
# ─────────────────────────────────────────────
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "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")
MODEL = "arcee-ai/trinity-large-preview:free"
BACKEND_URL = "http://127.0.0.1:5000/webhook"

# PALESTINE NAMES (Families/Cities common in Palestine)
PALESTINE_NAMES = [
    "أحمد النابلسي", "ياسين العكر", "ليلى المقدسي", "عمر الخليلي", 
    "مريم اليافاوي", "خالد الغزاوي", "هدى الرملي", "محمود الحيفاوي", 
    "زينب الكرمي", "يوسف اللدي", "نورهان الجنيني", "باسل الطولكرمي",
    "فراس البيراوي", "سماح البيت لحمي", "طارق الجبالي", "هناء الدريدي"
]

# SYSTEM PROMPT (Palestine Islamic Bank Context - Human-like & Diverse Dialects)
SYSTEM_PROMPT = """
You are a professional conversation simulator. Generate the messages for ONE highly realistic, human-like customer inquiry in Arabic to the support system of "Palestine Islamic Bank" (البنك الإسلامي الفلسطيني).

CRITICAL REQUIREMENTS FOR THE CUSTOMER SIDE:
1. ONLY SENDER/CUSTOMER MESSAGES: Return ONLY the messages sent by the customer. Do NOT include any responses from the bank or AI.
2. DIVERSE DIALECTS: Vary the dialect in each generation. Use:
   - "Ammiya" (Ghazawi, Nabulsi, Hebroni/Khalili, Falahi).
   - "Fusha" (Modern Standard Arabic) for formal inquiries.
   - A mix of both, as some people speak formally to a bank.
3. HUMAN BEHAVIOR:
   - Don't just ask questions. Express feelings (frustration if an ATM ate the card, excitement for a new home, politeness).
   - Use Palestinian cultural filler words (يا عمي، الله يخليك، يا طيب، خي، يابا).
   - Include realistic chat habits: typos, sending "سلام" alone first, or "موجودين؟" if the AI takes too long.
4. SPECIFIC BANKING TOPICS:
   - General (استفسارات عامة)
   - Branches & ATMs (الفروع والصرافات الآلية)
   - Accounts (الحسابات، الحساب الشخصي)
   - Salaries & Transfers (الرواتب، الحوالات البنكية، ويسترن يونيون)
   - Cards (بطاقات الصراف الآلي، البطاقات الإئتمانية، بطاقات الدفع المسبق)
   - Financing (التمويل، مرابحة، إجارة)
   - Digital Services (الخدمات الإلكترونية، تطبيق إسلامي موبايل، E-Services)
   - Cheques (الشيكات)
   - Currency Rates & Deposits (أسعار العملات، الودائع)
   - Complaints & Disputes (شكاوى، اعتراضات مالية، احتيال)
   - Bank Products & Campaigns (منتجات البنك، حملات ومشاريع)
   - Others (صناديق الأمانات، أسهم البنك، التسديد الآلي، التأمين)

Requirements:
1. Language: Arabic (Diverse Palestinian Dialects / Fusha).
2. Length: 4 to 8 messages from the CUSTOMER.
3. Format: Return ONLY valid JSON with this structure:
{
  "scenario": "Short English description of the personality and dialect used",
  "messages": ["msg1", "msg2", ...]
}
"""

def call_openrouter(system: str, user: str, model: str = MODEL) -> str:
    """Send a request to OpenRouter and return the raw response text."""
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://your-app.com",
        "X-Title": "Palestine Islamic Bank Simulator",
    }
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user",   "content": user},
        ],
        "temperature": 0.9,
    }
    try:
        response = requests.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=payload, timeout=60)
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]
    except Exception as e:
        print(f"❌  OpenRouter Error: {e}")
        return ""

def get_session_id(phone: str) -> Optional[str]:
    """Fetch the latest session ID for a phone number."""
    try:
        url = BACKEND_URL.replace("/webhook", "/api/v1/sessions")
        response = requests.get(url, timeout=5)
        if response.status_code == 200:
            sessions = response.json()
            for s in sorted(sessions, key=lambda x: x.get('started_at', ''), reverse=True):
                if s.get("customer_phone") == phone:
                    return s.get("id")
    except Exception: pass
    return None

def wait_for_ai_reply(session_id: str, last_known_count: int, timeout: int = 90):
    """Wait for AI to respond in the mapping database."""
    if not session_id: return last_known_count
    url = f"{BACKEND_URL.replace('/webhook', '/api/v1/sessions')}/{session_id}/messages"
    start_time = time.time()
    
    print(f"  ⏳  Waiting for AI Reply...", end="", flush=True)
    while (time.time() - start_time) < timeout:
        try:
            response = requests.get(url, timeout=5)
            if response.status_code == 200:
                messages = response.json()
                outbound = [m for m in messages if m.get("direction") == "outbound"]
                if len(outbound) > last_known_count:
                    new_reply = outbound[-1].get("content")
                    print(f"\r  🤖  AI: {new_reply}")
                    return len(outbound)
        except Exception: pass
        print(".", end="", flush=True)
        time.sleep(2)
    print("\r  ⌛  No reply from system (timeout).")
    return last_known_count

def run_live_scenario(sender_phone: str, name: str):
    """Generate and send one scenario live."""
    print(f"\n📡  Generating Palestine Islamic Bank simulation...")
    raw = call_openrouter(SYSTEM_PROMPT, "Generate 1 realistic conversation about Islamic Banking.")
    if not raw: return

    try:
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            lines = cleaned.splitlines()
            cleaned = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
        
        data = json.loads(cleaned)
        scenario = data.get("scenario", "Islamic Bank Query")
        messages = data.get("messages", [])
        
        print(f"📖  Scenario: {scenario}")
        print(f"👤  Customer: {name}")
        print(f"📞  Phone: {sender_phone}")
        print("-" * 30)
        
        session_id = None
        last_outbound_count = 0
        
        for i, text in enumerate(messages):
            message_id = f"live_{uuid.uuid4().hex[:8]}"
            payload = {
                "entry": [{"changes": [{"value": {
                    "messages": [{"from": sender_phone, "id": message_id, "text": {"body": text}, "type": "text"}],
                    "contacts": [{"profile": {"name": name}}]
                }}]}]
            }
            
            try:
                requests.post(BACKEND_URL, json=payload, timeout=10)
                print(f"  👤  {name}: {text}")
            except:
                print(f"  [!!] Error sending to backend.")
            
            if session_id is None:
                time.sleep(2.0)
                session_id = get_session_id(sender_phone)
            
            # Wait for turn
            last_outbound_count = wait_for_ai_reply(session_id, last_outbound_count)
            
            if i < len(messages) - 1:
                time.sleep(random.uniform(1.5, 3.0))
                
    except Exception as e:
        print(f"❌  Run Error: {e}")

def main():
    print("=" * 60)
    print("  PALESTINE ISLAMIC BANK - AI TESTER")
    print("=" * 60)

    if OPENROUTER_API_KEY == "your-openrouter-api-key-here":
        print("\n❌  ERROR: Missing API Key.")
        return

    sim_id = 1
    while True:
        print(f"\n[Simulation #{sim_id}]")
        sender_phone = f"97059{random.randint(1000000, 9999999)}" # Palestine prefix
        name = random.choice(PALESTINE_NAMES)
        
        run_live_scenario(sender_phone, name)
        
        choice = input("\n➡️  Continue with next test? (y/n): ").strip().lower()
        if choice != 'y':
            break
        sim_id += 1

    print("\n👋  Test finished.")

if __name__ == "__main__":
    main()