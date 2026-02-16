import 'dotenv/config';
import { createClient } from '@deepgram/sdk';

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;

async function testDeepgram() {
    try {
        const deepgram = createClient(DEEPGRAM_API_KEY);
        const { result, error } = await deepgram.manage.getProjects();
        if (error) throw error;
        console.log("✅ Deepgram OK. Projects found:", result.projects.length);
    } catch (error) {
        console.error("❌ Deepgram Failed:", error.message);
    }
}

testDeepgram();
