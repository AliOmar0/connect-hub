# 🖼️ Image Analysis & 🧭 In-App Guidance — Feature Specification

## Overview

This document describes two new features to add to the **Connect Hub** application. It contains **no code** — only detailed specifications, architecture descriptions, step-by-step instructions, and behavior expectations. An AI or developer should use this as a blueprint to write the actual implementation.

| Feature                                 | Description                                                                                                                                                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Image Analysis (Vision AI)**          | When a user sends an image via WhatsApp, the system automatically analyzes it using a vision-capable AI model, understands the content (bank receipt, card, document, app error, etc.), and responds appropriately. |
| **In-App Guidance (Connect Hub)**       | The AI assistant "Eman" can guide employees step-by-step through the Connect Hub dashboard pages to complete their tasks.                                                                                           |
| **Mobile App Guidance (Islami Mobile)** | The AI assistant "Eman" can guide bank customers step-by-step through the "Islami Mobile" banking app screens and features.                                                                                         |

---

## Part 1: Image Analysis (Vision AI)

### 1.1 Current Architecture

The application currently processes WhatsApp messages through a webhook. The flow is:

1. WhatsApp sends a webhook payload to `webhook.py` (`extract_webhook` function).
2. The function inspects `msg_type` and routes accordingly:
   - **text** → saved to DB, then buffered and sent to the LLM for an AI response.
   - **audio** → downloaded from Meta servers, transcribed via Deepgram STT, then the transcription is sent to the LLM.
   - **sticker** → downloaded from Meta servers, uploaded to Supabase Storage, and saved as a message (no AI response).
   - **image** → **currently ignored** — the code returns `"unsupported message type"`.

The relevant files and their roles:

- `app/api/v1/webhook.py` — receives and routes incoming WhatsApp messages.
- `app/core/llm.py` — handles all LLM (AI) calls via OpenRouter or DeepSeek.
- `app/core/whatsapp.py` — WhatsApp API client: get media URLs, download media, send messages.
- `app/core/storage.py` — uploads media (audio, stickers) to Supabase Storage.
- `app/core/config.py` — application settings (API keys, model names, etc.).
- `app/core/system_prompt.py` — the system prompt that defines the AI assistant's identity and behavior.
- `app/core/stt.py` — speech-to-text service (example of how audio processing is structured).

### 1.2 What Needs to Happen

When a customer sends an image via WhatsApp, the system should:

1. **Detect** the message type as `"image"` in the webhook handler.
2. **Extract** the `media_id` and optional `caption` from the WhatsApp payload (`msg_data.get("image", {}).get("id")` and `msg_data.get("image", {}).get("caption")`).
3. **Download** the image from Meta's servers (same pattern as audio: get media URL → download bytes).
4. **Upload** the image to Supabase Storage for display in the dashboard (similar to how `upload_audio` and `upload_sticker` work, but stored under an `images/` folder with the appropriate MIME type).
5. **Save** the inbound message to the database with content like `"[Image]: {caption}"` and the `media_url` and `media_type` fields populated.
6. **Analyze** the image using a vision-capable LLM model by:
   - Converting the image bytes to a base64 data URL.
   - Sending a multimodal message to the LLM that includes both the image and any caption text.
   - Using the existing system prompt plus vision-specific instructions.
7. **Send** the AI's response back to the customer via WhatsApp.
8. **Save** the outbound AI response as a message in the database.

All of this should happen in a **background task** (like `process_voice_message`) so the webhook returns `200 OK` immediately.

### 1.3 File-by-File Changes

#### A) `app/core/config.py` — Add Vision Settings

Add the following settings to the `Settings` class:

- `VISION_ENABLED` (bool, default `True`) — master switch to enable/disable image analysis.
- `VISION_MODEL` (str, default `"google/gemini-2.5-flash"`) — the vision-capable model to use. Must support `image_url` content type in the OpenAI chat completions format.
- `VISION_MAX_IMAGE_SIZE_MB` (int, default `10`) — maximum allowed image size in megabytes. Images larger than this are rejected with a friendly message.
- `VISION_SUPPORTED_TYPES` (List[str], default `["image/jpeg", "image/png", "image/webp"]`) — accepted MIME types.

> [!NOTE]
> No new API keys are needed. The existing `OPENROUTER_API_KEY` or `DEEPSEEK_API_KEY` is reused — we just need to point to a model that supports image inputs.

---

#### B) `app/core/vision.py` — New File: Image Analysis Service

Create a new service class `VisionService` with the following responsibilities:

**MIME Type Detection:**

- A static method that detects the image MIME type from magic bytes (first few bytes of the file).
- PNG starts with `\x89PNG\r\n\x1a\n`, JPEG starts with `\xff\xd8`, WEBP starts with `RIFF....WEBP`.
- Default to `image/jpeg` if unrecognized (most common on WhatsApp).

**Base64 Conversion:**

- A static method that converts raw image bytes to a data URL string in the format `data:{mime};base64,{encoded_data}`.

**Main Analysis Method (`analyse_image`):**

Parameters:

- `image_bytes` (bytes) — the raw image data.
- `user_text` (str, optional) — caption text the customer sent with the image.
- `history` (list, optional) — conversation history for context.
- `session_types` (list, optional) — session types for classification.
- `current_type_id` (str, optional) — current session type.

Behavior:

1. Validate the image: return a friendly error if bytes are empty or exceed the size limit.
2. Convert image to base64 data URL.
3. Build a dynamic system prompt by combining `SYSTEM_PROMPT` from `system_prompt.py` with vision-specific instructions (see below).
4. If the user sent a caption, also run `LLMService._find_context()` on it to pull relevant knowledge base context.
5. Build the messages array in the OpenAI multimodal format:
   - First message: `{"role": "system", "content": dynamic_prompt}`
   - History messages (if any).
   - User message with multimodal content: an array containing an `image_url` object and a `text` object.
6. Call the LLM using `LLMService._chat_completion()` with a 90-second timeout (images take longer).
7. Sanitize the output using `LLMService.sanitize_output()`.
8. Return the AI response string.
9. **On timeout or LLM failure**: catch the exception, log it, and return a friendly fallback message (e.g., "I couldn't analyze that image right now — could you describe what you need, or try resending it?") rather than letting the error propagate to `process_image_message`. The customer should always get _some_ WhatsApp reply, never silence.

> [!NOTE]
> **Cost/rate limiting**: Vision calls are more expensive than text calls (larger payloads, longer processing). Consider whether `VISION_ENABLED` should be paired with a per-user or per-session rate limit (e.g., max N images analyzed per hour) to control cost and reduce abuse potential, especially since this is a public-facing banking WhatsApp number. This isn't required for a first implementation but should be a follow-up if usage is high.

**Vision-Specific Instructions to Include in the Prompt:**

The following behavior rules should be appended to the system prompt when analyzing images:

1. **Bank receipt or transfer image**: Extract key details (amount, date, transaction number) and confirm the information to the customer.
2. **Bank card image**: Immediately warn the customer about sharing card data. **NEVER** repeat any card numbers, CVV, or expiry dates in the response.
3. **App error or screenshot**: Help the customer identify the problem and suggest solutions or next steps.
4. **Official document**: Guide the customer on how to complete their banking transaction with the document.
5. **Branch or ATM location image**: Try to identify the location and provide nearby branch information.
6. **Any other image**: Briefly describe what's visible and ask how you can help.
7. **Security rule**: If any sensitive data is visible (card numbers, account numbers, passwords), never display it in the response and warn the customer to protect their information.

Create a module-level singleton: `vision_service = VisionService()`.

---

#### C) `app/core/storage.py` — Add `upload_image` Method

Add a new method `upload_image` to the `StorageService` class. It should follow the exact same pattern as the existing `upload_audio` and `upload_sticker` methods:

- Accept `image_bytes` (bytes) and optional `filename` (str).
- If no filename provided, generate one: `f"image_{uuid.uuid4().hex}.jpg"`.
- Store under path `images/{filename}` in the `messages` bucket.
- Detect content type from magic bytes (PNG, JPEG, or WEBP).
- Upload to Supabase Storage and return the public URL.
- Log the upload and handle errors gracefully (return `None` on failure).

---

#### D) `app/api/v1/webhook.py` — Handle Image Messages

**Two changes are needed:**

**Change 1: Media type routing (around the `msg_type` checks)**

Currently, after `sticker`, there's a catch-all that ignores everything else. Add an `elif msg_type == "image"` block **before** the catch-all that:

- Extracts `media_id` from `msg_data.get("image", {}).get("id")`.
- Extracts `caption` from `msg_data.get("image", {}).get("caption")`.
- Returns ignored status if `media_id` is missing.

**Change 2: Background task dispatch (around the "Trigger AI process" section)**

> [!NOTE]
> `process_sticker_message` and `process_voice_message` are assumed to already exist in `webhook.py` today (they handle the current sticker/audio flows). Confirm they're present before using them as the reference pattern — if either has drifted from the description in Section 1.1, use the actual current implementation as the template instead of this document.

After the `sticker` background task block, add an `elif msg_type == "image"` block that:

- Calls `background_tasks.add_task(process_image_message, session.id, media_id, sender_phone, message_id, config_data, caption)`.

**New function: `process_image_message`**

Create this function following the exact same pattern as `process_voice_message`. It should:

1. Initialize `WhatsAppClient` with config credentials.
2. Mark the message as read and send a typing indicator.
3. Get the media URL from Meta using `client.get_media_url(media_id)`.
4. Download the image bytes using `client.download_media(media_url)`.
5. Upload to storage using `storage_service.upload_image(image_bytes)`.
6. Save the inbound message to DB via `crud.create_message()` with:
   - `content`: `"[Image]"` or `"[Image]: {caption}"` if caption exists.
   - `media_url`: the stored URL.
   - `media_type`: `"image/jpeg"` (or detected type).
7. Check if AI should respond (same conditions as voice: no employee assigned, not escalated).
8. If AI should respond:
   - Fetch conversation history via `crud.get_messages_for_session()`.
   - Fetch session types via `crud.get_session_main_types()`.
   - Call `vision_service.analyse_image()` with the image bytes, caption, history (last 10 messages), and session type info.
   - Send the response via `client.send_text_message()`.
   - Save the outbound message to DB.
9. Handle all errors with try/except and log them.

Import `vision_service` from `app.core.vision` at the top of the file.

---

#### E) `app/core/system_prompt.py` — Add Vision Instructions

At the end of the `SYSTEM_PROMPT` string (before the closing triple-quote), add a new section titled **"Image Analysis"** that instructs the AI on how to handle images (the same rules described in section B above).

---

### 1.4 Complete Flow After Implementation

```
WhatsApp → Meta Webhook → webhook.py (extract_webhook)
                               │
                               ├── text    → message_buffer → process_ai_response → LLM (text only)
                               ├── audio   → process_voice_message → Deepgram STT → LLM (transcribed text)
                               ├── sticker → process_sticker_message → Storage only (no AI)
                               └── image   → process_image_message → Vision AI → LLM (image + text) ✅ NEW
```

### 1.5 Usage Examples

| Customer Action                                       | System Behavior                                                                          |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 📸 Sends a bank receipt image                         | Extracts amount, date, and transaction number; confirms the transfer                     |
| 📸 Sends an Islami Mobile app error screenshot        | Identifies the error and suggests resolution steps                                       |
| 📸 Sends a credit card photo + "Problem with my card" | Warns about sharing card data, does NOT display any card numbers, directs to call center |
| 📸 Sends a bank branch photo + "Where is this?"       | Tries to identify the branch and provides location info                                  |
| 📸 Sends a document + "How to apply for financing?"   | Explains the application process and required documents                                  |

### 1.6 Technical Constraints

- **No new Python packages required** — `httpx`, `base64`, `logging` are all already available.
- **Model requirement** — The vision model must support `image_url` content in the OpenAI chat completions format. Compatible models include: Google Gemini 2.5 Flash, GPT-4o, Claude Sonnet/Opus.
- **Model recommendation, not a fixed decision** — `google/gemini-2.5-flash` is suggested as a reasonable default (speed, cost, Arabic support), but pricing and availability on OpenRouter change. Verify current cost/availability before locking it in, and keep `VISION_MODEL` configurable so it can be swapped without a code change.
- **OpenRouter compatibility** — OpenRouter passes through multimodal content to supported models.
- **Base64 overhead** — Encoding increases payload size by ~33%. Factor this into rate limit calculations.
- **Timeout** — Use a 90-second timeout for vision calls (longer than the 60-second text timeout).

---

## Part 2: In-App Guidance (Connect Hub Dashboard)

### 2.1 Concept

The AI assistant "Eman" should be able to guide employees and administrators through the Connect Hub dashboard. When someone asks "How do I see sessions?" or "Where are WhatsApp settings?", Eman responds with clear, numbered steps and direct page paths.

### 2.2 Current App Pages

The following pages exist in the Connect Hub dashboard (from `App.tsx` and `PrimaryNav.tsx`):

| Page           | Route Path       | Allowed Roles                     | What It Does                                                                                                                                                                                                   |
| -------------- | ---------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard      | `/dashboard`     | admin, supervisor, manager        | Shows overview statistics: active sessions, avg response time, satisfaction rate, processed messages. Has stat cards at the top and charts below.                                                              |
| Sessions       | `/sessions`      | All roles                         | Lists all chat sessions. Can filter by status (active/closed/escalated). Click a session to view full conversation, reply to customer, escalate, or close it. Reply box at bottom sends directly via WhatsApp. |
| Session Detail | `/sessions/:id`  | All roles                         | Opens a specific session with full chat history, customer info, and reply capability.                                                                                                                          |
| Queue          | `/queue`         | admin, supervisor, manager, agent | Shows escalated sessions awaiting human agent intervention. Agents can claim sessions or assign them to others.                                                                                                |
| Employees      | `/employees`     | admin, supervisor, manager        | Lists all registered employees with their roles. Supports adding new employees, editing roles (admin/supervisor/manager/agent/viewer), and disabling/deleting accounts.                                        |
| Analytics      | `/analytics`     | admin, supervisor, manager        | Detailed charts and reports on team performance: session counts, response times, satisfaction trends. Has time period filters and export options.                                                              |
| Notifications  | `/notifications` | All roles                         | Chronological list of all alerts (new sessions, escalations, customer replies). Unread notifications are highlighted. Clicking navigates to the relevant session/page.                                         |
| Shortcuts      | `/shortcuts`     | admin, supervisor, manager, agent | Manages canned/quick replies. Supports adding, editing, categorizing responses. During chat, typing `/` shows available shortcuts.                                                                             |
| Knowledge Base | `/knowledge`     | admin, supervisor, manager        | Manages the knowledge content the AI uses to answer questions. Supports adding articles/documents, file uploads. Content is auto-indexed for RAG retrieval.                                                    |
| Settings       | `/settings`      | admin, supervisor, manager        | System configuration including: WhatsApp API config (Phone Number ID, Access Token, Verify Token), general settings (app name, language), and AI behavior settings. Each section has its own Save button.      |
| Backend Tester | `/backend-test`  | admin, supervisor, manager        | Development tool for testing API connections, sending test messages, and checking backend service health.                                                                                                      |

### 2.3 What Needs to Happen

#### A) `app/core/app_guide.py` — New File: Navigation Knowledge Base

Create a Python file that contains a dictionary mapping each Connect Hub page to its:

- **Arabic name** and **English name**
- **Route path** (e.g., `/sessions`)
- **Allowed roles** (which user roles can access this page)
- **Description** (what the page does, in 1-2 sentences)
- **Step-by-step navigation instructions** (numbered steps to reach and use the page)
- **Sub-features** (optional: for pages like Settings that have multiple sections, list each sub-section with its own steps)

For each page listed in the table above (Section 2.2), include all the information from the "What It Does" column expanded into clear, numbered navigation steps.

Also create a function `get_navigation_guide_text()` that formats the entire dictionary into a readable text block suitable for injecting into the LLM's system prompt. The text should:

- Have a clear header like "=== Connect Hub App In-App Navigation Guide ==="
- Include an instruction telling the AI to use this information when users ask about app navigation
- List each page with its name, path, allowed roles, description, and numbered steps

#### B) `app/core/system_prompt.py` — Add Guidance Section

At the end of the `SYSTEM_PROMPT`, add a new section titled **"In-App Guidance"** with these rules:

1. When a user asks how to use a feature in the Connect Hub app, identify the page/feature they're asking about.
2. Check if their role allows access to that page.
3. Provide clear, numbered steps to reach and use the feature.
4. If the feature isn't available for their role, explain politely and suggest an alternative or tell them to contact their manager.
5. Include the actual route paths (like `/sessions` or `/settings`) so the user can navigate directly.

#### C) `app/core/llm.py` — Inject Navigation Guide Conditionally

Inside the `get_ai_response` function, after the existing knowledge context injection, add logic to detect when the user is asking about app navigation and inject the navigation guide into the prompt.

**Detection heuristic**: Check if the user's message contains any of these keywords:

- Arabic: كيف, وين, أين, فين, شلون, التطبيق, الصفحة, الإعدادات, الجلسات, لوحة التحكم
- English: dashboard, settings, sessions, queue, employees, shortcuts, knowledge, analytics, notifications, navigate, find, where, how to, go to, open

If any keyword matches, call `get_navigation_guide_text()` and append the result to `dynamic_prompt`.

#### D) (Optional) Frontend: Floating Guide Bot Component

A React component (`GuideBot.tsx`) that provides an in-app help assistant:

- **Appearance**: A floating action button in the bottom-right corner with a help/question icon.
- **Behavior**: Clicking it opens a small chat window overlay.
- **Functionality**: Users can type questions about the app, which are sent to the existing `/api/v1/assistant/chat` endpoint. Responses are displayed in a chat-bubble format.
- **Design**: Uses the app's existing design system (card, primary color, muted backgrounds).

### 2.4 Guidance Examples

| User Question                                 | Expected Eman Response                                                                                                            |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| "How do I see sessions?"                      | Lists the steps: click Sessions icon in sidebar, filter by status, click to open, use reply box to respond.                       |
| "Where are WhatsApp settings?"                | Directs to Settings page, then WhatsApp Configuration section, explains each field (Phone Number ID, Access Token, Verify Token). |
| "How do I add a quick reply?"                 | Directs to Shortcuts page, explains Add button, title/text fields, and how to use `/` during chat.                                |
| "I can't access analytics"                    | Explains that Analytics requires admin/supervisor/manager role, suggests contacting their manager for role upgrade.               |
| "How do I assign a session to another agent?" | Directs to Queue page or Sessions page, explains the assignment flow.                                                             |

---

## Part 3: Mobile Banking App Guidance (Islami Mobile)

### 3.1 Concept

Since Connect Hub handles WhatsApp support for the Palestinian Islamic Bank, customers frequently ask how to perform tasks on the bank's mobile app ("إسلامي موبايل" - Islami Mobile). The AI assistant should know all the mobile app screens and features so it can guide customers through them step by step.

### 3.2 Mobile App Screens & Features

The following is a comprehensive map of all Islami Mobile app screens and features that the AI needs to know about:

#### Login & Authentication

- **Screen**: Login Page
- **Features**: Username/password login, biometric login (fingerprint/Face ID), "Forgot Password" flow (reset via debit card details), first-time registration flow.
- **Common questions**: "I can't log in", "How do I register?", "I forgot my password", "How do I enable fingerprint?", "My account is locked".
- **Steps to guide**: Open app → enter credentials → tap Login. For biometrics: Settings → Security → Enable biometric. For forgot password: Login screen → Forgot Password → enter card details → set new password.

#### Home Screen / Main Dashboard

- **Screen**: Home
- **Features**: Account balance overview (all accounts), quick actions (transfer, pay, recharge), recent transactions list, promotional banners, notification bell.
- **Common questions**: "Where do I see my balance?", "How do I check my transactions?", "What are the quick actions?"
- **Steps to guide**: After login, the home screen shows all account balances. Scroll down for recent transactions. Quick action buttons are in the middle section.

#### Account Management

- **Screen**: Accounts
- **Features**: View all accounts (savings, current, deposit), account details (IBAN, account number, branch), transaction history per account, account statement download/share, mini statement.
- **Common questions**: "What's my IBAN?", "How do I get a statement?", "Show me my account details", "I need my account number".
- **Steps to guide**: Bottom menu → Accounts → select account → view details or tap Statement for full history.

#### Transfers

- **Screen**: Transfers
- **Features**: Transfer between own accounts, transfer to another PIB customer (by account number or mobile), local transfers (to other Palestinian banks via PMA), international transfers (SWIFT), scheduled/recurring transfers, transfer history, saved beneficiaries.
- **Common questions**: "How do I send money?", "How do I transfer to another bank?", "How do I make an international transfer?", "How do I set up a recurring transfer?"
- **Steps to guide**: Bottom menu → Transfers → choose transfer type → select source account → enter beneficiary details → enter amount → review → confirm with OTP.

#### Card Management

- **Screen**: Cards
- **Features**: View all cards (credit, debit, prepaid), card details (masked number, expiry, available limit), activate a new card, block/stop a lost card, set card limits (ATM withdrawal, POS purchase, online purchase), enable/disable international usage, request a replacement card, view card transactions.
- **Common questions**: "I lost my card", "How do I block my card?", "How do I activate my new card?", "How do I change my card limits?", "How do I enable my card for online shopping?"
- **Steps to guide**: Bottom menu → Cards → select card → Settings for limits/blocking. For new card activation: Cards → Activate Card → enter last 4 digits + OTP.

#### Bill Payments

- **Screen**: Payments
- **Features**: Pay utility bills (electricity - JDECO/HEPCO/SELCO, water, municipality), pay telecom bills (Jawwal, Ooredoo), government payments (traffic fines, taxes), saved billers, payment history.
- **Common questions**: "How do I pay my electricity bill?", "How do I pay my Jawwal bill?", "How do I pay a traffic fine?"
- **Steps to guide**: Bottom menu → Payments → Pay Bill → choose category → select provider → enter subscriber number (or scan barcode) → enter amount → confirm.

#### Mobile Recharge

- **Screen**: Recharge
- **Features**: Top up Jawwal credit, top up Ooredoo credit, recharge data bundles, saved numbers, recharge history.
- **Common questions**: "How do I recharge my Jawwal?", "How do I buy a data bundle?", "How do I top up my Ooredoo?"
- **Steps to guide**: Bottom menu → Payments → Recharge → select provider → enter phone number → select amount or bundle → confirm.

#### QR Code Payments

- **Screen**: QR Pay
- **Features**: Scan merchant QR code to pay, generate personal QR code to receive money, QR payment history.
- **Common questions**: "How do I pay with QR?", "How does the merchant scan thing work?", "How do I receive money with QR?"
- **Steps to guide**: Bottom menu → QR → Scan to pay or Show My QR to receive.

#### Checkbook Services

- **Screen**: Checkbooks
- **Features**: Request a new checkbook, view checkbook status, stop/cancel a specific check, view check transaction history.
- **Common questions**: "How do I request a checkbook?", "I need to stop a check", "Where can I see my checks?"
- **Steps to guide**: More menu → Checkbooks → Request New or Manage Existing.

#### Beneficiary Management

- **Screen**: Beneficiaries
- **Features**: Add new beneficiary (local/international), edit existing beneficiaries, delete beneficiaries, favorite beneficiaries for quick access.
- **Common questions**: "How do I add a new beneficiary?", "How do I save someone for transfers?"
- **Steps to guide**: More menu → Beneficiaries → Add New → enter name, bank, account/IBAN → save with OTP.

#### Notifications & Alerts

- **Screen**: Notifications
- **Features**: Transaction alerts, promotional offers, system messages, security alerts, enable/disable push notifications.
- **Common questions**: "How do I turn off notifications?", "I'm not getting notifications", "What are these alerts?"
- **Steps to guide**: Bell icon on home screen → view all notifications. Settings → Notifications → toggle on/off.

#### Profile & Settings

- **Screen**: Settings / Profile
- **Features**: View/update personal info, change password, change PIN, manage biometric settings, language preference (Arabic/English), dark mode toggle, privacy & terms, app version, logout.
- **Common questions**: "How do I change my password?", "How do I switch to English?", "How do I enable dark mode?", "How do I change my PIN?"
- **Steps to guide**: Profile icon (top left or More menu) → Settings → choose option. For password: Settings → Security → Change Password.

#### Branch & ATM Locator

- **Screen**: Locator
- **Features**: Map view of all PIB branches, map view of all ATMs, search by city/area, branch details (address, phone, working hours), directions via Google Maps.
- **Common questions**: "Where is the nearest branch?", "Where's the closest ATM?", "What are the branch hours?", "How do I get directions?"
- **Steps to guide**: More menu → Branch/ATM Locator → use map or list view → tap on a location for details and directions.

#### Customer Support

- **Screen**: Support / Contact
- **Features**: Call center (1700 220 220), WhatsApp chat (059 444 3444), email support, FAQ section, complaint submission.
- **Common questions**: "How do I contact the bank?", "I want to file a complaint", "What's the bank's number?"
- **Steps to guide**: More menu → Contact Us → choose channel. For complaints: Contact Us → Submit Complaint → fill form.

#### Offers & Promotions

- **Screen**: Offers
- **Features**: Current promotions, credit card offers, seasonal campaigns, loyalty rewards.
- **Common questions**: "Are there any offers?", "What promotions do you have?", "Any credit card deals?"
- **Steps to guide**: Home screen banners or More menu → Offers → browse current promotions.

### 3.3 What Needs to Happen

#### A) `app/core/app_guide.py` — Add Mobile App Dictionary

In the same `app_guide.py` file (created in Part 2), add a second dictionary called `MOBILE_APP_GUIDE` that maps each mobile app feature to:

- **Arabic name** and **English name**
- **Keywords** that customers might use when asking about this feature (in both Arabic and English)
- **Description** of what the feature does
- **Step-by-step instructions** for how to navigate to and use the feature
- **Common customer questions** that map to this feature
- **Security warnings** (if applicable, e.g., card management, transfers)

Include **all** the screens and features listed in Section 3.2 above.

Also create a function `get_mobile_app_guide_text()` that formats the mobile app dictionary into a text block for the system prompt, similar to `get_navigation_guide_text()`.

#### B) `app/core/llm.py` — Inject Mobile Guide Conditionally

Add a second keyword check in `get_ai_response` for mobile app-related queries. Use keywords like:

- Arabic: تطبيق, موبايل, جوال, إسلامي موبايل, برنامج, البنك, حسابي, بطاقتي, حوالة, فاتورة, رصيد, صراف, فرع, كلمة المرور, تسجيل, دخول
- English: app, mobile, islami, login, transfer, card, bill, balance, ATM, branch, password, register

If any keyword matches, call `get_mobile_app_guide_text()` and append it to `dynamic_prompt`.

#### C) `app/core/system_prompt.py` — Add Mobile Guidance Rules

Add a section to the system prompt with these rules for mobile app guidance:

1. When a customer asks about the mobile app, provide step-by-step navigation instructions.
2. Use both Arabic and English names for screens/buttons (e.g., "Transfers (التحويلات)") since the app supports both languages.
3. Always mention the OTP/verification step for sensitive operations (transfers, card changes, beneficiary additions).
4. **Security rules**: Never ask for or store passwords, PINs, OTPs, or full card numbers. Proactively warn customers not to share these.
5. If the customer's question requires an action that can only be done at a branch (like changing their phone number on file), clearly state that and provide branch locator guidance.
6. If you're unsure about a specific screen layout or button name, direct the customer to call 1700 220 220 for live assistance.

### 3.4 Mobile App Guidance Examples

| Customer Message                        | Expected AI Response                                                                                                         |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| "How do I transfer money?"              | Step-by-step guide: Open app → Transfers → choose type → enter details → confirm with OTP.                                   |
| "I lost my card!"                       | Urgent guidance: Open app → Cards → select card → Stop Card immediately. Also mention calling 1700 220 220.                  |
| "How do I check my balance?"            | Open app → Home screen shows all balances. Or tap Accounts for detailed view.                                                |
| "How do I pay my electricity bill?"     | Payments → Pay Bill → Electricity → select provider → enter subscriber number → confirm.                                     |
| "I forgot my password"                  | Login screen → Forgot Password → enter debit card details → set new password. If locked, call 1700 220 220.                  |
| "Where is the nearest ATM?"             | More menu → Branch/ATM Locator → select ATM → use map view. Alternatively, visit islamicbank.ps for full map.                |
| "How do I enable fingerprint login?"    | After login → Settings → Security → Enable Biometric → verify with password → done.                                          |
| "Can I make an international transfer?" | Yes, Transfers → International Transfer → enter SWIFT details → confirm with OTP. Note: may require prior beneficiary setup. |

### 3.5 Security Considerations for Mobile Guidance

> [!CAUTION]
>
> - **NEVER ask customers for their passwords, PINs, or OTPs** — even for "verification". The AI should never request this information.
> - **NEVER display full card numbers** — always use masked format (e.g., \***\* \*\*** \*\*\*\* 1234).
> - When discussing login issues, always offer the "Forgot Password" self-service flow before suggesting a branch visit.
> - When discussing lost/stolen cards, treat it as **urgent** — guide the customer to block the card immediately and suggest calling the call center as backup.
> - When discussing transfers, always mention the OTP verification step so customers know it's expected.

---

## Part 3.6: Cross-Cutting Notes for Parts 2 & 3

Parts 2 and 3 both inject guidance text into `get_ai_response()` based on keyword matching, but they serve **different audiences** — Part 2 is for internal employees using the Connect Hub dashboard, Part 3 is for external bank customers on WhatsApp. This section resolves two issues that fall out of that overlap.

### 3.6.1 Channel/audience disambiguation

Before running either keyword check, `get_ai_response()` needs to know **which guide is even eligible** for this conversation:

- If the message came through the WhatsApp customer webhook (Part 1's flow) → only the **mobile app guide** (Part 3) should ever be injected. Customers don't have Connect Hub access, so injecting Part 2's dashboard guide wastes prompt space and could confuse the AI into describing an internal tool to an external user.
- If the message came through the internal assistant chat endpoint (`/api/v1/assistant/chat`, used by the optional `GuideBot.tsx`) → only the **Connect Hub guide** (Part 2) should be eligible. Employees asking "how do I pay a bill" almost certainly mean helping a customer navigate the mobile app, not doing it themselves — but treat this as a product decision to confirm, not an assumption baked into the code.

Concretely: determine the caller's channel/context **before** the keyword checks (e.g., a `channel: "whatsapp" | "dashboard"` parameter passed into `get_ai_response()`), and only run the keyword check for the guide that applies to that channel. Don't run both keyword lists against every message regardless of source.

### 3.6.2 Keyword list precision (Part 3 in particular)

Part 3's English/Arabic keyword lists include generic banking vocabulary — `card`, `balance`, `transfer`, `branch`, `بطاقتي`, `رصيد`, `حوالة`, `فرع` — that will appear in a large share of ordinary customer messages that are **not** navigation questions (e.g., "my balance is wrong" or "the transfer didn't go through" are complaints/support issues, not "how do I use the app" questions). Matching on these alone will over-trigger the mobile guide injection and bloat most prompts unnecessarily.

Recommended tightening: require a **navigation-intent word** (كيف, وين, أين, "how do I", "where is", "how to") to co-occur with a **feature word** (card, transfer, balance, etc.) before injecting the guide, rather than matching on the feature word alone. This mirrors how Part 2's keyword list already leans on navigation-style words (`كيف`, `وين`, `where`, `how to`, `navigate`, `find`) — Part 3 should follow the same pattern for consistency and to avoid the false-positive rate a single-word match would produce.

---

## Part 4: Summary of All Changes

### New Files to Create

| File                    | Purpose                                                                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `app/core/vision.py`    | Vision AI service — downloads images, converts to base64, sends to multimodal LLM, returns analysis                                |
| `app/core/app_guide.py` | Navigation knowledge base — contains both Connect Hub dashboard and Islami Mobile app guidance data with text formatting functions |

### Existing Files to Modify

| File                        | What to Change                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `app/core/config.py`        | Add `VISION_ENABLED`, `VISION_MODEL`, `VISION_MAX_IMAGE_SIZE_MB`, `VISION_SUPPORTED_TYPES` settings                                                                                                                                                                                                                                                                            |
| `app/core/storage.py`       | Add `upload_image()` method following the same pattern as `upload_audio()` and `upload_sticker()`                                                                                                                                                                                                                                                                              |
| `app/core/system_prompt.py` | Append image analysis rules, Connect Hub navigation guidance rules, and mobile app guidance rules to the end of `SYSTEM_PROMPT`                                                                                                                                                                                                                                                |
| `app/core/llm.py`           | In `get_ai_response()`, determine the message's channel (WhatsApp customer vs. internal dashboard assistant) and only run the matching keyword check — Part 3's mobile guide for WhatsApp, Part 2's dashboard guide for internal chat (see Part 3.6). Use a navigation-intent + feature-word co-occurrence check rather than single-keyword matching to avoid over-triggering. |
| `app/api/v1/webhook.py`     | Add `image` type handling in `extract_webhook()` (media ID extraction + background task dispatch), create `process_image_message()` function, import `vision_service`                                                                                                                                                                                                          |

### Optional Frontend Change

| File                                     | Purpose                                                            |
| ---------------------------------------- | ------------------------------------------------------------------ |
| `src/components/InAppGuide/GuideBot.tsx` | Floating help button with embedded chat window for in-app guidance |

### Key Technical Decisions

> [!IMPORTANT]
>
> - **No new Python packages needed** — all required modules (`httpx`, `base64`, `logging`, `json`) are already dependencies.
> - **Same API keys** — reuse existing OpenRouter/DeepSeek credentials with a vision-capable model.
> - **Background processing** — all image analysis runs as a `background_task` to avoid blocking the webhook response.
> - **Conditional prompt injection** — guidance text is only added to the prompt when keywords suggest the user is asking about navigation, keeping normal responses lean.
> - **Model choice** — `google/gemini-2.5-flash` is recommended as the default vision model (fast, free-tier available on OpenRouter, strong Arabic support).
