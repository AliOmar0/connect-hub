# -*- coding: utf-8 -*-
"""
Navigation Knowledge Base for Connect Hub Dashboard and Islami Mobile App.

Provides structured guidance for:
- Part 2: In-App Guidance for Connect Hub dashboard (employees/admins)
- Part 3: Mobile App Guidance for Islami Mobile banking app (customers)
"""
from typing import Dict, List


# =============================================================================
# Part 2: Connect Hub Dashboard Navigation Guide
# =============================================================================

CONNECT_HUB_PAGES = {
    "dashboard": {
        "arabic_name": "لوحة التحكم",
        "english_name": "Dashboard",
        "route_path": "/dashboard",
        "allowed_roles": ["admin", "supervisor", "manager"],
        "description": "Shows overview statistics: active sessions, avg response time, satisfaction rate, processed messages. Has stat cards at the top and charts below.",
        "navigation_steps": [
            "1. Click the Dashboard icon in the left sidebar (first icon)",
            "2. View the stat cards at the top showing: active sessions, avg response time, satisfaction rate, processed messages",
            "3. Scroll down to see detailed charts and trends",
            "4. Use date filters (if available) to adjust the time period"
        ],
        "common_tasks": [
            "View overall system performance",
            "Check active session count",
            "Monitor response times",
            "Track satisfaction metrics"
        ]
    },
    "sessions": {
        "arabic_name": "الجلسات",
        "english_name": "Sessions",
        "route_path": "/sessions",
        "allowed_roles": ["viewer", "agent", "admin", "supervisor", "manager"],
        "description": "Lists all chat sessions. Can filter by status (active/closed/escalated). Click a session to view full conversation, reply to customer, escalate, or close it.",
        "navigation_steps": [
            "1. Click the Sessions icon in the left sidebar",
            "2. Use the status filter buttons at the top to filter by: Active, Closed, Escalated",
            "3. Click on any session row to open the session detail view",
            "4. In session detail: view full chat history on the left, customer info on the right",
            "5. Use the reply box at the bottom to send a message (sends via WhatsApp)",
            "6. Use the Escalate button to transfer to a human agent",
            "7. Use the Close button to mark the session as resolved"
        ],
        "common_tasks": [
            "View all customer conversations",
            "Reply to customers",
            "Escalate sessions to agents",
            "Close resolved sessions"
        ]
    },
    "session_detail": {
        "arabic_name": "تفاصيل الجلسة",
        "english_name": "Session Detail",
        "route_path": "/sessions/:id",
        "allowed_roles": ["viewer", "agent", "admin", "supervisor", "manager"],
        "description": "Opens a specific session with full chat history, customer info, and reply capability.",
        "navigation_steps": [
            "1. Navigate to Sessions page first",
            "2. Click on any session to open its detail view",
            "3. View the full message history in the chat area",
            "4. See customer information in the right panel",
            "5. Use the message input at the bottom to reply",
            "6. Access action buttons: Escalate, Close, Assign"
        ],
        "common_tasks": [
            "Read full conversation history",
            "Send a reply to customer",
            "View customer details",
            "Escalate or close session"
        ]
    },
    "queue": {
        "arabic_name": "قائمة الانتظار",
        "english_name": "Queue",
        "route_path": "/queue",
        "allowed_roles": ["admin", "supervisor", "manager", "agent"],
        "description": "Shows escalated sessions awaiting human agent intervention. Agents can claim sessions or assign them to others.",
        "navigation_steps": [
            "1. Click the Queue icon in the sidebar",
            "2. View list of escalated sessions waiting for agent pickup",
            "3. Click 'Claim' to take ownership of a session",
            "4. Click 'Assign' to assign a session to a specific agent",
            "5. Use filters to sort by priority, wait time, or type"
        ],
        "common_tasks": [
            "View escalated sessions",
            "Claim a session for yourself",
            "Assign sessions to other agents",
            "Prioritize urgent cases"
        ]
    },
    "employees": {
        "arabic_name": "الموظفون",
        "english_name": "Employees",
        "route_path": "/employees",
        "allowed_roles": ["admin", "supervisor", "manager"],
        "description": "Lists all registered employees with their roles. Supports adding new employees, editing roles, and disabling/deleting accounts.",
        "navigation_steps": [
            "1. Click the Employees icon in the sidebar",
            "2. View the list of all registered employees",
            "3. Click 'Add Employee' button to create a new account",
            "4. Fill in: Name, Email, Role (admin/supervisor/manager/agent/viewer)",
            "5. Click on an existing employee row to edit their details",
            "6. Use the toggle or buttons to disable/enable accounts",
            "7. Use the delete button to remove an account (requires confirmation)"
        ],
        "common_tasks": [
            "Add a new employee",
            "Edit employee role",
            "Disable an account",
            "Delete an employee"
        ]
    },
    "analytics": {
        "arabic_name": "التحليلات",
        "english_name": "Analytics",
        "route_path": "/analytics",
        "allowed_roles": ["admin", "supervisor", "manager"],
        "description": "Detailed charts and reports on team performance: session counts, response times, satisfaction trends. Has time period filters and export options.",
        "navigation_steps": [
            "1. Click the Analytics icon in the sidebar",
            "2. View detailed performance charts and metrics",
            "3. Use the time period filter at the top (e.g., Last 7 days, Last 30 days)",
            "4. Review: session counts, response times, satisfaction trends",
            "5. Use the Export button to download reports (CSV/PDF)",
            "6. Filter by employee, team, or session type if needed"
        ],
        "common_tasks": [
            "View performance trends",
            "Compare team metrics",
            "Export analytics reports",
            "Analyze response times"
        ]
    },
    "notifications": {
        "arabic_name": "الإشعارات",
        "english_name": "Notifications",
        "route_path": "/notifications",
        "allowed_roles": ["viewer", "agent", "admin", "supervisor", "manager"],
        "description": "Chronological list of all alerts (new sessions, escalations, customer replies). Unread notifications are highlighted. Clicking navigates to the relevant session/page.",
        "navigation_steps": [
            "1. Click the bell icon in the top navigation bar",
            "2. View the chronological list of notifications",
            "3. Unread notifications appear highlighted",
            "4. Click on any notification to navigate to the relevant session",
            "5. Use 'Mark all as read' to clear all notifications"
        ],
        "common_tasks": [
            "View new alerts",
            "Navigate to escalated sessions",
            "See customer replies",
            "Mark notifications as read"
        ]
    },
    "shortcuts": {
        "arabic_name": "الردود السريعة",
        "english_name": "Shortcuts",
        "route_path": "/shortcuts",
        "allowed_roles": ["admin", "supervisor", "manager", "agent"],
        "description": "Manages canned/quick replies. Supports adding, editing, categorizing responses. During chat, typing '/' shows available shortcuts.",
        "navigation_steps": [
            "1. Click the Shortcuts icon in the sidebar",
            "2. View existing quick replies and categories",
            "3. Click 'Add Shortcut' to create a new quick reply",
            "4. Fill in: Title, Text content, Category",
            "5. Click on existing shortcut to edit or delete",
            "6. During a chat, type '/' to see available shortcuts",
            "7. Select a shortcut to insert it into your message"
        ],
        "common_tasks": [
            "Create a quick reply",
            "Edit existing shortcuts",
            "Organize by category",
            "Use shortcuts in chat"
        ]
    },
    "knowledge_base": {
        "arabic_name": "قاعدة المعرفة",
        "english_name": "Knowledge Base",
        "route_path": "/knowledge",
        "allowed_roles": ["admin", "supervisor", "manager"],
        "description": "Manages the knowledge content the AI uses to answer questions. Supports adding articles/documents, file uploads. Content is auto-indexed for RAG retrieval.",
        "navigation_steps": [
            "1. Click the Knowledge Base icon in the sidebar",
            "2. View existing articles and documents",
            "3. Click 'Add Article' to create a new knowledge entry",
            "4. Fill in: Title, Content, Tags",
            "5. Click 'Upload File' to upload a PDF/DOCX document",
            "6. The system automatically indexes content for AI retrieval",
            "7. Use search to find specific articles",
            "8. Click on an article to edit or delete"
        ],
        "common_tasks": [
            "Add new knowledge article",
            "Upload documents",
            "Edit existing content",
            "Manage AI knowledge"
        ]
    },
    "settings": {
        "arabic_name": "الإعدادات",
        "english_name": "Settings",
        "route_path": "/settings",
        "allowed_roles": ["admin", "supervisor", "manager"],
        "description": "System configuration including: WhatsApp API config, general settings, and AI behavior settings. Each section has its own Save button.",
        "navigation_steps": [
            "1. Click the Settings icon in the sidebar",
            "2. View the settings sections: WhatsApp Configuration, General Settings, AI Settings",
            "3. WhatsApp Configuration:",
            "   - Phone Number ID: Enter your WhatsApp Business Phone Number ID",
            "   - Access Token: Enter the permanent access token from Meta",
            "   - Verify Token: Enter the verify token for webhook verification",
            "   - Click 'Save' to apply changes",
            "4. General Settings:",
            "   - App Name: Customize the application name",
            "   - Language: Select default language (Arabic/English)",
            "   - Click 'Save' to apply",
            "5. AI Behavior Settings:",
            "   - Adjust AI response parameters",
            "   - Configure model selection",
            "   - Click 'Save' to apply"
        ],
        "common_tasks": [
            "Configure WhatsApp API",
            "Update access tokens",
            "Change app language",
            "Adjust AI behavior"
        ]
    },
    "backend_tester": {
        "arabic_name": "اختبار الخلفية",
        "english_name": "Backend Tester",
        "route_path": "/backend-test",
        "allowed_roles": ["admin", "supervisor", "manager"],
        "description": "Development tool for testing API connections, sending test messages, and checking backend service health.",
        "navigation_steps": [
            "1. Click the Backend Tester icon in the sidebar",
            "2. Use the API connection tester to verify endpoints",
            "3. Send test messages to verify WhatsApp integration",
            "4. Check backend service health status",
            "5. View logs and responses"
        ],
        "common_tasks": [
            "Test API connections",
            "Send test messages",
            "Check service health",
            "Debug integration issues"
        ]
    }
}


# =============================================================================
# Part 3: Islami Mobile App Navigation Guide
# =============================================================================

MOBILE_APP_SCREENS = {
    "login": {
        "arabic_name": "تسجيل الدخول",
        "english_name": "Login",
        "keywords": {
            "arabic": ["تسجيل الدخول", "دخول", "كلمة المرور", "نسيت كلمة المرور", "البصمة", "قفل الحساب"],
            "english": ["login", "password", "forgot password", "fingerprint", "locked", "register"]
        },
        "description": "Login page with username/password, biometric login (fingerprint/Face ID), and forgot password flow.",
        "navigation_steps": [
            "1. Open the Islami Mobile app",
            "2. Enter your username and password",
            "3. Tap 'Login' button",
            "4. For biometric login: After first login, go to Settings → Security → Enable Biometric",
            "5. Forgot Password: Tap 'Forgot Password' → Enter debit card details → Set new password",
            "6. First-time registration: Tap 'Register' → Follow the registration steps"
        ],
        "common_questions": [
            "I can't log in",
            "How do I register?",
            "I forgot my password",
            "How do I enable fingerprint login?",
            "My account is locked"
        ],
        "security_warning": "Never share your password, PIN, or OTP with anyone. Bank staff will never ask for these."
    },
    "home": {
        "arabic_name": "الصفحة الرئيسية",
        "english_name": "Home",
        "keywords": {
            "arabic": ["الرصيد", "الحساب", "الصفحة الرئيسية", "الرئيسية", "المعاملات الأخيرة"],
            "english": ["balance", "home", "main", "recent transactions", "dashboard"]
        },
        "description": "Home screen showing account balance overview, quick actions, recent transactions, and promotional banners.",
        "navigation_steps": [
            "1. After login, the home screen is displayed automatically",
            "2. View all your account balances at the top",
            "3. Quick action buttons in the middle: Transfer, Pay, Recharge",
            "4. Scroll down to see recent transactions",
            "5. Tap the bell icon for notifications"
        ],
        "common_questions": [
            "Where do I see my balance?",
            "How do I check my transactions?",
            "What are the quick actions?"
        ]
    },
    "accounts": {
        "arabic_name": "الحسابات",
        "english_name": "Accounts",
        "keywords": {
            "arabic": ["الحساب", "رقم الحساب", "IBAN", "كشف حساب", "بيانات الحساب"],
            "english": ["account", "IBAN", "statement", "account number", "account details"]
        },
        "description": "View all accounts (savings, current, deposit), account details, transaction history, and statements.",
        "navigation_steps": [
            "1. Tap 'Accounts' in the bottom menu",
            "2. View list of all your accounts (savings, current, deposit)",
            "3. Tap on any account to view details",
            "4. See: IBAN, account number, branch",
            "5. Tap 'Statement' to view full transaction history",
            "6. Download or share the statement"
        ],
        "common_questions": [
            "What's my IBAN?",
            "How do I get a statement?",
            "Show me my account details",
            "I need my account number"
        ]
    },
    "transfers": {
        "arabic_name": "التحويلات",
        "english_name": "Transfers",
        "keywords": {
            "arabic": ["تحويل", "حوالة", "إرسال فلوس", "مستفيد", "تحويل دولي"],
            "english": ["transfer", "send money", "beneficiary", "international", "swift"]
        },
        "description": "Transfer between own accounts, to other PIB customers, local banks via PMA, or international SWIFT transfers.",
        "navigation_steps": [
            "1. Tap 'Transfers' in the bottom menu",
            "2. Choose transfer type:",
            "   - Between My Accounts",
            "   - To PIB Customer (by account number or mobile)",
            "   - Local Transfer (other Palestinian banks)",
            "   - International Transfer (SWIFT)",
            "3. Select source account",
            "4. Enter beneficiary details",
            "5. Enter amount",
            "6. Review details",
            "7. Confirm with OTP"
        ],
        "common_questions": [
            "How do I send money?",
            "How do I transfer to another bank?",
            "How do I make an international transfer?",
            "How do I set up a recurring transfer?"
        ],
        "security_warning": "Always verify beneficiary details before confirming. You'll receive an OTP to authorize the transfer."
    },
    "cards": {
        "arabic_name": "البطاقات",
        "english_name": "Cards",
        "keywords": {
            "arabic": ["بطاقة", "ضياع البطاقة", "إيقاف البطاقة", "تفعيل البطاقة", "حدود البطاقة"],
            "english": ["card", "lost card", "block card", "activate card", "card limits"]
        },
        "description": "View all cards, activate new cards, block lost cards, set limits, enable/disable international usage.",
        "navigation_steps": [
            "1. Tap 'Cards' in the bottom menu",
            "2. View all your cards (credit, debit, prepaid)",
            "3. Tap on a card to view details: masked number, expiry, limit",
            "4. For settings: Tap 'Settings' or gear icon",
            "5. Set limits: ATM withdrawal, POS purchase, online purchase",
            "6. Enable/disable international usage",
            "7. To block a lost card: Tap 'Stop Card' → Confirm",
            "8. To activate a new card: Cards → Activate Card → Enter last 4 digits + OTP"
        ],
        "common_questions": [
            "I lost my card",
            "How do I block my card?",
            "How do I activate my new card?",
            "How do I change my card limits?",
            "How do I enable my card for online shopping?"
        ],
        "security_warning": "URGENT: If your card is lost or stolen, block it immediately in the app and call 1700 220 220. Never share your card number, CVV, or PIN."
    },
    "payments": {
        "arabic_name": "المدفوعات",
        "english_name": "Payments",
        "keywords": {
            "arabic": ["فاتورة", "كهرباء", "ماء", "جوال", "أوريدو", "غرامات", "ضرائب"],
            "english": ["bill", "electricity", "water", "jawwal", "ooredoo", "fine", "tax"]
        },
        "description": "Pay utility bills (electricity, water, municipality), telecom bills, government payments, traffic fines.",
        "navigation_steps": [
            "1. Tap 'Payments' in the bottom menu",
            "2. Tap 'Pay Bill'",
            "3. Choose category:",
            "   - Electricity: JDECO, HEPCO, SELCO",
            "   - Water",
            "   - Municipality",
            "   - Telecom: Jawwal, Ooredoo",
            "   - Government: Traffic fines, taxes",
            "4. Select provider",
            "5. Enter subscriber number (or scan barcode)",
            "6. Enter amount",
            "7. Confirm payment"
        ],
        "common_questions": [
            "How do I pay my electricity bill?",
            "How do I pay my Jawwal bill?",
            "How do I pay a traffic fine?"
        ]
    },
    "recharge": {
        "arabic_name": "تعبئة الرصيد",
        "english_name": "Recharge",
        "keywords": {
            "arabic": ["تعبئة", "رصيد", "جوال", "أوريدو", "باقة"],
            "english": ["recharge", "top up", "credit", "jawwal", "ooredoo", "bundle"]
        },
        "description": "Top up Jawwal or Ooredoo credit, recharge data bundles.",
        "navigation_steps": [
            "1. Tap 'Payments' in the bottom menu",
            "2. Tap 'Recharge'",
            "3. Select provider: Jawwal or Ooredoo",
            "4. Enter phone number",
            "5. Select amount or data bundle",
            "6. Confirm recharge"
        ],
        "common_questions": [
            "How do I recharge my Jawwal?",
            "How do I buy a data bundle?",
            "How do I top up my Ooredoo?"
        ]
    },
    "qr_pay": {
        "arabic_name": "الدفع بالكود",
        "english_name": "QR Pay",
        "keywords": {
            "arabic": ["كود", "QR", "مسح", "دفع"],
            "english": ["qr", "code", "scan", "pay"]
        },
        "description": "Scan merchant QR code to pay, or generate personal QR code to receive money.",
        "navigation_steps": [
            "1. Tap 'QR' in the bottom menu",
            "2. To pay: Point camera at merchant's QR code",
            "3. Enter amount and confirm",
            "4. To receive: Tap 'Show My QR'",
            "5. Let the other person scan your QR code"
        ],
        "common_questions": [
            "How do I pay with QR?",
            "How does the merchant scan thing work?",
            "How do I receive money with QR?"
        ]
    },
    "checkbooks": {
        "arabic_name": "دفاتر الشيكات",
        "english_name": "Checkbooks",
        "keywords": {
            "arabic": ["شيك", "دفتر شيكات", "إيقاف شيك"],
            "english": ["check", "checkbook", "stop check"]
        },
        "description": "Request new checkbook, view status, stop a specific check.",
        "navigation_steps": [
            "1. Tap 'More' in the bottom menu",
            "2. Tap 'Checkbooks'",
            "3. View existing checkbooks",
            "4. Tap 'Request New' to order a checkbook",
            "5. Tap on a checkbook to manage it",
            "6. To stop a check: Select the check → Tap 'Stop Check'"
        ],
        "common_questions": [
            "How do I request a checkbook?",
            "I need to stop a check",
            "Where can I see my checks?"
        ]
    },
    "beneficiaries": {
        "arabic_name": "المستفيدون",
        "english_name": "Beneficiaries",
        "keywords": {
            "arabic": ["مستفيد", "إضافة مستفيد", "تحويل لمستفيد"],
            "english": ["beneficiary", "add beneficiary", "saved beneficiary"]
        },
        "description": "Add, edit, delete beneficiaries for transfers. Mark favorites for quick access.",
        "navigation_steps": [
            "1. Tap 'More' in the bottom menu",
            "2. Tap 'Beneficiaries'",
            "3. View saved beneficiaries",
            "4. Tap 'Add New'",
            "5. Choose: Local or International",
            "6. Enter: Name, Bank, Account/IBAN",
            "7. Save with OTP confirmation",
            "8. Mark as favorite for quick access"
        ],
        "common_questions": [
            "How do I add a new beneficiary?",
            "How do I save someone for transfers?"
        ],
        "security_warning": "Verify beneficiary details carefully. Always use OTP to confirm new beneficiaries."
    },
    "notifications_mobile": {
        "arabic_name": "الإشعارات",
        "english_name": "Notifications",
        "keywords": {
            "arabic": ["إشعارات", "تنبيهات", "تفعيل الإشعارات"],
            "english": ["notification", "alert", "push notification"]
        },
        "description": "Transaction alerts, promotional offers, security alerts, system messages.",
        "navigation_steps": [
            "1. Tap the bell icon on the home screen",
            "2. View all notifications",
            "3. To enable/disable: Settings → Notifications → Toggle on/off"
        ],
        "common_questions": [
            "How do I turn off notifications?",
            "I'm not getting notifications",
            "What are these alerts?"
        ]
    },
    "settings_mobile": {
        "arabic_name": "الإعدادات",
        "english_name": "Settings",
        "keywords": {
            "arabic": ["إعدادات", "كلمة المرور", "الرقم السري", "البصمة", "اللغة", "الوضع المظلم"],
            "english": ["settings", "password", "pin", "fingerprint", "language", "dark mode"]
        },
        "description": "View/update personal info, change password/PIN, manage biometrics, language preference.",
        "navigation_steps": [
            "1. Tap 'More' in the bottom menu",
            "2. Tap 'Settings' or tap your profile icon",
            "3. To change password: Settings → Security → Change Password",
            "4. To change PIN: Settings → Security → Change PIN",
            "5. To enable biometrics: Settings → Security → Enable Biometric",
            "6. To change language: Settings → Language → Select Arabic/English",
            "7. To enable dark mode: Settings → Appearance → Toggle Dark Mode"
        ],
        "common_questions": [
            "How do I change my password?",
            "How do I switch to English?",
            "How do I enable dark mode?",
            "How do I change my PIN?"
        ],
        "security_warning": "Never share your password, PIN, or OTP. Bank staff will never ask for these."
    },
    "locator": {
        "arabic_name": "مواقع الفروع والصرافات",
        "english_name": "Branch/ATM Locator",
        "keywords": {
            "arabic": ["فرع", "صراف آلي", "أقرب فرع", "موقع", "عنوان"],
            "english": ["branch", "atm", "location", "nearest", "address", "directions"]
        },
        "description": "Map view of all PIB branches and ATMs, with details and directions.",
        "navigation_steps": [
            "1. Tap 'More' in the bottom menu",
            "2. Tap 'Branch/ATM Locator'",
            "3. View map with all branches and ATMs",
            "4. Use list view for text-based browsing",
            "5. Tap on a location to see details: address, phone, working hours",
            "6. Tap 'Directions' to open in Google Maps"
        ],
        "common_questions": [
            "Where is the nearest branch?",
            "Where's the closest ATM?",
            "What are the branch hours?",
            "How do I get directions?"
        ]
    },
    "support": {
        "arabic_name": "الدعم والمساعدة",
        "english_name": "Support/Contact",
        "keywords": {
            "arabic": ["اتصال", "مركز الاتصال", "شكوى", "الدعم", "المساعدة"],
            "english": ["contact", "call center", "complaint", "support", "help"]
        },
        "description": "Call center, WhatsApp chat, email support, FAQ, complaint submission.",
        "navigation_steps": [
            "1. Tap 'More' in the bottom menu",
            "2. Tap 'Contact Us'",
            "3. Choose contact channel:",
            "   - Call Center: 1700 220 220",
            "   - WhatsApp: 059 444 3444",
            "   - Email: support@islamicbank.ps",
            "   - FAQ section",
            "4. To submit a complaint: Contact Us → Submit Complaint → Fill form"
        ],
        "common_questions": [
            "How do I contact the bank?",
            "I want to file a complaint",
            "What's the bank's number?"
        ]
    },
    "offers": {
        "arabic_name": "العروض",
        "english_name": "Offers",
        "keywords": {
            "arabic": ["عروض", "تخفيضات", "حملات", "مكافآت"],
            "english": ["offers", "promotions", "deals", "rewards"]
        },
        "description": "Current promotions, credit card offers, seasonal campaigns, loyalty rewards.",
        "navigation_steps": [
            "1. Check home screen banners for current offers",
            "2. Tap 'More' in the bottom menu",
            "3. Tap 'Offers'",
            "4. Browse current promotions and deals"
        ],
        "common_questions": [
            "Are there any offers?",
            "What promotions do you have?",
            "Any credit card deals?"
        ]
    }
}


# =============================================================================
# Formatting Functions for System Prompt Injection
# =============================================================================

def get_navigation_guide_text() -> str:
    """
    Format Connect Hub dashboard navigation guide for system prompt injection.
    
    Returns a formatted text block with all pages, roles, and navigation steps.
    """
    guide_text = "\n\n=== Connect Hub App In-App Navigation Guide ===\n"
    guide_text += "Use this information when users ask about navigating the Connect Hub dashboard.\n\n"
    
    for page_key, page_data in CONNECT_HUB_PAGES.items():
        guide_text += f"## {page_data['english_name']} ({page_data['arabic_name']})\n"
        guide_text += f"Route: {page_data['route_path']}\n"
        guide_text += f"Allowed Roles: {', '.join(page_data['allowed_roles'])}\n"
        guide_text += f"Description: {page_data['description']}\n"
        guide_text += "Navigation Steps:\n"
        for step in page_data['navigation_steps']:
            guide_text += f"  {step}\n"
        guide_text += "\n"
    
    return guide_text


def get_mobile_app_guide_text() -> str:
    """
    Format Islami Mobile app navigation guide for system prompt injection.
    
    Returns a formatted text block with all screens, keywords, and navigation steps.
    """
    guide_text = "\n\n=== Islami Mobile App Navigation Guide ===\n"
    guide_text += "Use this information when customers ask about using the Islami Mobile banking app.\n"
    guide_text += "Always use both Arabic and English names for screens/buttons.\n"
    guide_text += "Always mention OTP verification for sensitive operations.\n\n"
    
    for screen_key, screen_data in MOBILE_APP_SCREENS.items():
        guide_text += f"## {screen_data['english_name']} ({screen_data['arabic_name']})\n"
        guide_text += f"Keywords (Arabic): {', '.join(screen_data['keywords']['arabic'])}\n"
        guide_text += f"Keywords (English): {', '.join(screen_data['keywords']['english'])}\n"
        guide_text += f"Description: {screen_data['description']}\n"
        guide_text += "Navigation Steps:\n"
        for step in screen_data['navigation_steps']:
            guide_text += f"  {step}\n"
        if 'security_warning' in screen_data:
            guide_text += f"⚠️ Security Warning: {screen_data['security_warning']}\n"
        guide_text += "\n"
    
    guide_text += "\n=== Security Rules for Mobile App Guidance ===\n"
    guide_text += "1. NEVER ask customers for their passwords, PINs, or OTPs.\n"
    guide_text += "2. NEVER display full card numbers - use masked format (**** **** **** 1234).\n"
    guide_text += "3. For lost/stolen cards: Guide to block immediately and call 1700 220 220.\n"
    guide_text += "4. For login issues: Offer Forgot Password flow before suggesting branch visit.\n"
    guide_text += "5. For transfers: Always mention OTP verification step.\n"
    guide_text += "6. If unsure about a specific screen, direct customer to call 1700 220 220.\n"
    
    return guide_text
