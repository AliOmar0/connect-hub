import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import twilio from 'twilio';
import cors from 'cors';
import axios from 'axios';
import { Buffer } from 'buffer';
import { createClient } from '@supabase/supabase-js';

const app = express();
const httpServer = createServer(app);
const wss = new WebSocketServer({ noServer: true });

const port = process.env.PORT || 3001;

// Configuration
const OPENROUTER_API_KEY = "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";
const MODEL_NAME = "arcee-ai/trinity-large-preview:free";
const SYSTEM_PROMPT = `أنت مساعد ذكاء اصطناعي يمثل البنك الإسلامي الفلسطيني. تحدث بلهجة فلسطينية مهذبة واختصر قدر الإمكان.`;
// Using our local Edge TTS server
const TTS_URL = process.env.PIPER_URL || 'http://localhost:5070/tts';

// Supabase Setup
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function getAIResponse(userMessage) {
    try {
        const response = await axios.post(
            "https://openrouter.ai/api/v1/chat/completions",
            { model: MODEL_NAME, messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: userMessage }] },
            { headers: { "Authorization": `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" }, timeout: 10000 }
        );
        return response.data?.choices?.[0]?.message?.content || "عذراً، لم أفهم.";
    } catch (error) {
        return "أهلاً بك، كيف بقدر أساعدك؟";
    }
}

// Log Call to Supabase
async function saveCallLog(callSid, userText, aiText, audioUrl, ttsProvider) {
    try {
        await supabase.from('call_logs').insert({
            call_sid: callSid,
            user_text: userText,
            ai_text: aiText,
            ai_audio_url: audioUrl || `tts://${ttsProvider}`
        });
    } catch (e) {
        console.error("Supabase Log Error:", e.message);
    }
}

// Edge TTS -> Upload to Supabase -> Return Public URL
async function getEdgeTTSAudio(text) {
    try {
        console.log(`[TTS] Requesting Edge TTS...`);

        const response = await axios.post(TTS_URL,
            { text: text },
            {
                responseType: 'arraybuffer',
                timeout: 10000
            }
        );

        const buffer = Buffer.from(response.data);
        const fileName = `edge_${Date.now()}.mp3`;

        // Upload to Supabase Storage
        const { data, error } = await supabase.storage
            .from('audio_logs')
            .upload(fileName, buffer, {
                contentType: 'audio/mpeg',
                upsert: false
            });

        if (error) {
            console.error("[TTS] Supabase Upload Error:", error.message);
            return null;
        }

        const publicUrlData = supabase.storage.from('audio_logs').getPublicUrl(fileName);
        console.log("[TTS] Edge TTS audio ready");
        return publicUrlData.data.publicUrl;

    } catch (error) {
        console.error(`[TTS] Edge TTS Failed: ${error.message}`);
        return null;
    }
}

// --- Routes ---

app.get('/', (req, res) => res.send('Bank AI v31 (Edge TTS - Native Palestinian Voice)'));
app.get('/voice', (req, res) => res.send("Active at +19166596816"));

app.post('/voice', (req, res) => {
    console.log("[Twilio] Inbound Call Received");
    const twiml = new twilio.twiml.VoiceResponse();

    const gather = twiml.gather({
        input: 'speech',
        language: 'ar-PS',
        speechTimeout: 'auto',
        action: '/handle-speech'
    });

    // Greeting with native Palestinian voice via Google as fallback or Edge TTS
    gather.say({ voice: 'Google.ar-XA-Wavenet-A', language: 'ar-XA' }, 'أهلاً بك في البنك الإسلامي الفلسطيني، كيف بقدر أساعدك يا بطل؟');

    twiml.redirect('/voice');
    res.type('text/xml').send(twiml.toString());
});

app.post('/handle-speech', async (req, res) => {
    const userSpeech = req.body.SpeechResult;
    const callSid = req.body.CallSid;
    console.log(`[STT] User said: ${userSpeech}`);
    const twiml = new twilio.twiml.VoiceResponse();

    if (userSpeech) {
        const aiText = await getAIResponse(userSpeech);
        console.log(`[LLM] Response: ${aiText}`);

        // Use Edge TTS (The realistic one)
        let audioUrl = await getEdgeTTSAudio(aiText);

        const gather = twiml.gather({
            input: 'speech',
            language: 'ar-PS',
            speechTimeout: 'auto',
            action: '/handle-speech'
        });

        if (audioUrl) {
            console.log("[TTS] Playing Edge TTS Audio");
            gather.play(audioUrl);
            saveCallLog(callSid, userSpeech, aiText, audioUrl, 'edge-tts');
        } else {
            console.log("[TTS] Fallback to Google Neural");
            gather.say({ voice: 'Google.ar-XA-Wavenet-A', language: 'ar-XA' }, aiText);
            saveCallLog(callSid, userSpeech, aiText, null, 'google-neural');
        }

        twiml.redirect('/voice');
    } else {
        twiml.redirect('/voice');
    }
    res.type('text/xml').send(twiml.toString());
});

// Outbound / Mobile SDK Handlers
app.post('/api/voice-sdk', (req, res) => {
    const twiml = new twilio.twiml.VoiceResponse();
    const to = req.body.To;
    if (!to || to === 'AI' || to === process.env.TWILIO_PHONE_NUMBER) {
        twiml.redirect(`${process.env.NGROK_URL}/voice`);
    } else {
        const dial = twiml.dial({ callerId: process.env.TWILIO_PHONE_NUMBER });
        dial.number(to);
    }
    res.type('text/xml').send(twiml.toString());
});

app.get('/api/token', (req, res) => {
    const apiKey = process.env.TWILIO_API_KEY || process.env.TWILIO_ACCOUNT_SID;
    const apiSecret = process.env.TWILIO_API_SECRET || process.env.TWILIO_AUTH_TOKEN;
    const { AccessToken } = twilio.jwt;
    const { VoiceGrant } = AccessToken;
    const identity = 'pib_agent';
    try {
        const accessToken = new AccessToken(process.env.TWILIO_ACCOUNT_SID, apiKey, apiSecret, { identity });
        accessToken.addGrant(new VoiceGrant({ outgoingApplicationSid: process.env.TWIML_APP_SID, incomingAllow: true }));
        res.json({ token: accessToken.toJwt(), identity });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

httpServer.listen(port, '0.0.0.0', () => console.log(`Server v31 (Edge TTS) on ${port}`));
