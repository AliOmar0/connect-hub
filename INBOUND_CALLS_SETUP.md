
# 📞 Inbound Calls & Edge TTS Setup

Your system is now fully configured to use **Edge TTS** for realistic Arabic voice generation. This replaces the old Docker/XTTS setup with a lightweight python script.

## ✅ Current Architecture

1.  **Incoming Call** -> Twilio -> `server/index.js` (Port 3001)
2.  **AI Response** -> OpenRouter (Arcee Trinity) -> Text
3.  **TTS Request** -> `http://localhost:5070/tts` (POST) -> `edge_tts_server.py`
4.  **Audio Generation** -> Edge Cloud (Microsoft Azure Backend) -> MP3
5.  **Storage** -> Supabase Storage (public URL)
6.  **Playback** -> Twilio plays the MP3 URL

## 🚀 How to Run

You need **two** terminal windows running:

### Terminal 1: TTS Server
```bash
python edge_tts_server.py
```
*Note: This runs on port 5070.*

### Terminal 2: Backend Server
```bash
node server/index.js
```
*Note: This runs on port 3001.*

## 🧪 Testing

1.  **Call your Twilio Number**: `+19166596816`
2.  **Speak**: Say something in Arabic (e.g., "أريد فتح حساب").
3.  **Listen**: You should hear a realistic Palestinian/Jordanian voice (`ar-JO-SanaNeural`).

## 🛠️ Troubleshooting

-   **"Piper Error"**: Means the TTS server crashed or returned an error. Check Terminal 1 logs.
-   **"Method Not Allowed"**: Ensure `server/index.js` is POSTing to `/tts`, not `/`.
-   **Silence**: Check Supabase logs to see if audio URL was generated.

## 🧹 Cleanup Done
-   Removed unused `piper/`, `context-chatterbox/` folders.
-   Removed unused Docker files.
-   Added unnecessary files to `.gitignore`.
