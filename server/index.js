import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import twilio from 'twilio';
import cors from 'cors';
import axios from 'axios';
import { createClient } from '@deepgram/sdk';

const app = express();
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

const port = process.env.PORT || 3001;

// Configuration
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const OPENROUTER_API_KEY = "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";
const MODEL_NAME = "arcee-ai/trinity-large-preview:free";
const VOICE_ID = 'SAz9YHcvj6GT2YYpgXf7'; // Layla (Arabic) - Premium

const SYSTEM_PROMPT = `أنت مساعد ذكاء اصطناعي يمثل البنك الإسلامي الفلسطيني (PIB).
تحدث بإيجاز شديد (جملة واحدة أو جملتين).
لغتُك هي العربية الفصحى الحديثة الودودة.
مهمتك مساعدة العملاء في استفساراتهم العامة عن الحسابات والبطاقات.
لا تطلب أبداً معلومات سرية.`;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Twilio Client
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

// Deepgram Client
const deepgram = createClient(DEEPGRAM_API_KEY);

// Helper: Get AI Response
async function getAIResponse(userMessage, history = []) {
    console.log(`[LLM] Requesting for: "${userMessage}"`);
    try {
        const response = await axios.post(
            "https://openrouter.ai/api/v1/chat/completions",
            {
                model: MODEL_NAME,
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    ...history.slice(-3),
                    { role: "user", content: userMessage }
                ],
            },
            {
                headers: {
                    "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://connect-hub.ai",
                    "X-Title": "PIB Voice Assistant"
                },
                timeout: 10000
            }
        );
        return response.data?.choices?.[0]?.message?.content || "عذراً، لم أسمعك جيداً.";
    } catch (error) {
        console.error("[LLM] Error:", error.message);
        return "أهلاً بك، كيف يمكنني مساعدتك؟";
    }
}

// Helper: TTS (ElevenLabs) 
async function getElevenLabsAudio(text) {
    console.log(`[TTS] Generating audio for: "${text.substring(0, 30)}..."`);
    try {
        const response = await axios.post(
            `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream?output_format=ulaw_8000`,
            {
                text: text,
                model_id: "eleven_multilingual_v2",
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75,
                    style: 0.0,
                    use_speaker_boost: true
                }
            },
            {
                headers: {
                    "xi-api-key": ELEVENLABS_API_KEY,
                    "Content-Type": "application/json",
                },
                responseType: 'arraybuffer'
            }
        );
        return Buffer.from(response.data).toString('base64');
    } catch (error) {
        console.error("[TTS] ElevenLabs Error:", error.response?.data?.toString() || error.message);
        return null;
    }
}

// REST Routes
app.get('/', (req, res) => res.send('PIB Voice Gateway Active v2'));

app.post('/api/chat', async (req, res) => {
    const response = await getAIResponse(req.body.message, req.body.history || []);
    res.json({ content: response });
});

app.post('/api/make-call', async (req, res) => {
    const { to } = req.body;
    try {
        const call = await client.calls.create({
            url: `${process.env.NGROK_URL}/voice`,
            to,
            from: process.env.TWILIO_PHONE_NUMBER,
        });
        res.json({ sid: call.sid });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// TwiML Outbound Entry
app.post('/voice', (req, res) => {
    console.log("[Twilio] Call received, starting stream...");
    const twiml = new twilio.twiml.VoiceResponse();

    // Start media stream immediately
    const connect = twiml.connect();
    connect.stream({
        url: `wss://${process.env.NGROK_URL.replace('https://', '')}/streams`
    });

    res.type('text/xml').send(twiml.toString());
});

// WebSocket Handler
wss.on('connection', (ws) => {
    console.log('[WS] Connection Established');

    let streamSid = '';
    let isSpeaking = false;

    // Deepgram Streaming
    const dgConnection = deepgram.listen.live({
        model: "nova-2",
        language: "ar",
        smart_format: true,
        encoding: "mulaw",
        sample_rate: 8000,
        interim_results: false
    });

    dgConnection.on('open', () => {
        console.log('[STT] Deepgram Connection Open');
    });

    const speak = async (text) => {
        if (!text) return;
        isSpeaking = true;
        const audio = await getElevenLabsAudio(text);
        if (audio && streamSid) {
            ws.send(JSON.stringify({
                event: 'media',
                streamSid: streamSid,
                media: { payload: audio }
            }));
        }
        isSpeaking = false;
    };

    dgConnection.on('results', async (data) => {
        const transcript = data.channel.alternatives[0].transcript;
        if (transcript && data.is_final) {
            console.log(`[STT] Heard: ${transcript}`);
            if (isSpeaking) {
                console.log("[STT] User interrupted, but we'll respond after this thought...");
            }
            const aiText = await getAIResponse(transcript);
            await speak(aiText);
        }
    });

    ws.on('message', async (message) => {
        const msg = JSON.parse(message);

        switch (msg.event) {
            case 'start':
                streamSid = msg.start.streamSid;
                console.log(`[WS] Stream Started: ${streamSid}`);
                // Send Initial Greeting from ElevenLabs
                await speak("السلام عليكم ورحمة الله وبركاته، معكم المساعد الذكي للبنك الإسلامي الفلسطيني. كيف بقدر أساعدك اليوم؟");
                break;
            case 'media':
                if (dgConnection.getReadyState() === 1 && !isSpeaking) {
                    dgConnection.send(Buffer.from(msg.media.payload, 'base64'));
                }
                break;
            case 'stop':
                console.log('[WS] Stream Stopped');
                dgConnection.finish();
                break;
        }
    });

    ws.on('close', () => {
        console.log('[WS] Connection Closed');
        dgConnection.finish();
    });
});

httpServer.listen(port, '0.0.0.0', () => {
    console.log(`---------------------------------`);
    console.log(`PREMIUM AI VOICE GATEWAY RUNNING`);
    console.log(`Voice: ElevenLabs Layla (Premium)`);
    console.log(`STT: Deepgram Nova-2 (Arabic)`);
    console.log(`---------------------------------`);
});
