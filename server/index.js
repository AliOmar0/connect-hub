import 'dotenv/config';
import express from 'express';
import twilio from 'twilio';
import cors from 'cors';
import axios from 'axios';

const { VoiceResponse } = twilio.twiml;
const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

const OPENROUTER_API_KEY = "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";
const MODEL_NAME = "arcee-ai/trinity-large-preview:free";
const SYSTEM_PROMPT = `أنت مساعد ذكاء اصطناعي للبنك الإسلامي الفلسطيني. أجب باختصار شديد جداً (جملة واحدة). لا تطلب بيانات خاصة.`;

async function getAIResponse(userMessage) {
    console.log(`[LLM] Request: ${userMessage}`);
    try {
        const response = await axios.post(
            "https://openrouter.ai/api/v1/chat/completions",
            {
                model: MODEL_NAME,
                messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: userMessage }],
            },
            {
                headers: {
                    "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://connect-hub.ai",
                    "X-Title": "Connect Hub Voice"
                },
                timeout: 6000
            }
        );
        const result = response.data?.choices?.[0]?.message?.content;
        console.log(`[LLM] Result: ${result?.substring(0, 40)}...`);
        return result || "أهلاً بك، كيف يمكنني مساعدتك؟";
    } catch (error) {
        console.error("[LLM] Error:", error.message);
        return "بعتذر، في مشكلة بالاتصال. كيف بقدر أساعدك بشيء ثاني؟";
    }
}

app.get('/', (req, res) => res.send('Active v7 - Bulletproof Mode'));

app.post('/api/chat', async (req, res) => {
    const content = await getAIResponse(req.body.message);
    res.json({ content });
});

app.post('/api/make-call', async (req, res) => {
    try {
        const call = await client.calls.create({
            url: `${process.env.NGROK_URL}/voice`,
            to: req.body.to,
            from: process.env.TWILIO_PHONE_NUMBER,
        });
        res.json({ sid: call.sid });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/voice', (req, res) => {
    console.log("[Voice] START CALL");
    const twiml = new VoiceResponse();
    const gather = twiml.gather({
        input: ['speech'],
        action: '/handle-speech',
        language: 'ar-SA',
        speechTimeout: 'auto',
        timeout: 5
    });
    gather.say({ voice: 'Polly.Zeina', language: 'ar-SA' }, 'أهلاً بك في البنك الإسلامي الفلسطيني، تفضل كيف بقدر أساعدك؟');

    twiml.say({ voice: 'Polly.Zeina', language: 'ar-SA' }, 'ما سمعت إشي، رح أضل معك. تفضل؟');
    twiml.redirect('/voice');

    res.type('text/xml').send(twiml.toString());
});

app.post('/handle-speech', async (req, res) => {
    console.log("[Voice] SPEECH RECEIVED");
    const userSpeech = req.body.SpeechResult;
    const twiml = new VoiceResponse();

    if (userSpeech) {
        const aiResponse = await getAIResponse(userSpeech);
        const gather = twiml.gather({
            input: ['speech'],
            action: '/handle-speech',
            language: 'ar-SA',
            speechTimeout: 'auto'
        });
        gather.say({ voice: 'Polly.Zeina', language: 'ar-SA' }, aiResponse);
        twiml.redirect('/handle-speech');
    } else {
        const gather = twiml.gather({
            input: ['speech'],
            action: '/handle-speech',
            language: 'ar-SA',
            speechTimeout: 'auto'
        });
        gather.say({ voice: 'Polly.Zeina', language: 'ar-SA' }, 'بعتذر منك، ما سمعت منيح. بتقدر تعيد؟');
    }
    res.type('text/xml').send(twiml.toString());
});

app.listen(port, '0.0.0.0', () => console.log(`Server v7 on ${port}`));
