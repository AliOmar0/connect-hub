import 'dotenv/config';
import axios from 'axios';

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

async function listVoices() {
    try {
        const response = await axios.get("https://api.elevenlabs.io/v1/voices", {
            headers: { "xi-api-key": ELEVENLABS_API_KEY }
        });
        const arabicVoices = response.data.voices.filter(v => v.labels?.accent === 'arabic' || v.preview_url?.includes('arabic') || v.name.toLowerCase().includes('arabic') || v.high_quality_base_model_ids?.includes('eleven_multilingual_v2'));

        console.log("Available Voices:");
        response.data.voices.slice(0, 5).forEach(v => {
            console.log(`- ${v.name} (ID: ${v.voice_id})`);
        });

        const mimi = response.data.voices.find(v => v.name === 'Mimi');
        if (mimi) console.log(`\nFound Mimi: ${mimi.voice_id}`);
    } catch (error) {
        console.error("Error:", error.message);
    }
}

listVoices();
