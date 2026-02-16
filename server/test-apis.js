import 'dotenv/config';
import axios from 'axios';

const OPENROUTER_API_KEY = "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";
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

async function testAPIs() {
    console.log("--- Testing OpenRouter ---");
    try {
        const response = await axios.post(
            "https://openrouter.ai/api/v1/chat/completions",
            {
                model: "arcee-ai/trinity-large-preview:free",
                messages: [{ role: "user", content: "Hello" }],
            },
            {
                headers: { "Authorization": `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
                timeout: 5000
            }
        );
        console.log("✅ OpenRouter OK:", response.data?.choices?.[0]?.message?.content);
    } catch (error) {
        console.error("❌ OpenRouter Failed:", error.message);
    }

    console.log("\n--- Testing ElevenLabs ---");
    try {
        const voiceId = 'SAz9YHcvj6GT2YYpgXf7';
        const response = await axios.post(
            `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
            { text: "Hello test", model_id: "eleven_multilingual_v2" },
            {
                headers: { "xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json" },
                responseType: 'arraybuffer'
            }
        );
        console.log("✅ ElevenLabs OK (received data size):", response.data.length);
    } catch (error) {
        console.error("❌ ElevenLabs Failed:", error.response?.data?.toString() || error.message);
    }
}

testAPIs();
