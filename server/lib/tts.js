// Pluggable TTS provider (G4 voice output, channel-agnostic).
// Default provider: Azure Neural TTS (best Arabic/Levantine fit + compliance for a bank).
// Fallbacks: ElevenLabs (most natural), edge-tts (local dev), Voicebox (local GPU),
// and "polly" which returns null so the caller uses Twilio's built-in <Say> Polly.Zeina.
//
// synthesize(text, { lang }) -> { buffer: Buffer, contentType: string, provider } | null
import axios from 'axios';
import { logger } from './logger.js';

const PROVIDER = (process.env.TTS_PROVIDER || 'azure').toLowerCase();

// Default Arabic voices per provider. Jordanian (ar-JO) is the closest widely
// available locale to Palestinian/Levantine dialect.
const AZURE_VOICE = process.env.AZURE_TTS_VOICE || 'ar-JO-TaimNeural';
const AZURE_REGION = process.env.AZURE_TTS_REGION;
const AZURE_KEY = process.env.AZURE_TTS_KEY;

const ELEVEN_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;
const ELEVEN_MODEL = process.env.ELEVENLABS_MODEL || 'eleven_flash_v2_5';

function escapeXml(s) {
    return s.replace(/[<>&'"]/g, (c) =>
        ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]
    );
}

async function azureSynthesize(text, lang = 'ar') {
    if (!AZURE_KEY || !AZURE_REGION) {
        logger.warn('Azure TTS not configured (AZURE_TTS_KEY / AZURE_TTS_REGION)');
        return null;
    }
    const locale = AZURE_VOICE.split('-').slice(0, 2).join('-') || 'ar-JO';
    // A slightly slower rate + gentle pitch makes the neural voice sound warmer
    // and more natural (less clipped/robotic) on phone audio.
    const rate = process.env.AZURE_TTS_RATE || '-4%';
    const pitch = process.env.AZURE_TTS_PITCH || '+2%';
    const ssml =
        `<speak version='1.0' xmlns:mstts='https://www.w3.org/2001/mstts' xml:lang='${locale}'>` +
        `<voice xml:lang='${locale}' name='${AZURE_VOICE}'>` +
        `<prosody rate='${rate}' pitch='${pitch}'>${escapeXml(text)}</prosody>` +
        `</voice></speak>`;
    const url = `https://${AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`;
    const res = await axios.post(url, ssml, {
        headers: {
            'Ocp-Apim-Subscription-Key': AZURE_KEY,
            'Content-Type': 'application/ssml+xml',
            // Higher-fidelity MP3 for more natural audio; plays directly via Twilio <Play>.
            'X-Microsoft-OutputFormat': 'audio-24khz-96kbitrate-mono-mp3',
            'User-Agent': 'connect-hub',
        },
        responseType: 'arraybuffer',
        timeout: 10000,
    });
    return { buffer: Buffer.from(res.data), contentType: 'audio/mpeg', provider: 'azure' };
}

async function elevenSynthesize(text) {
    if (!process.env.ELEVENLABS_API_KEY || !ELEVEN_VOICE_ID) {
        logger.warn('ElevenLabs TTS not configured (ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID)');
        return null;
    }
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVEN_VOICE_ID}`;
    const res = await axios.post(
        url,
        { text, model_id: ELEVEN_MODEL, voice_settings: { stability: 0.5, similarity_boost: 0.75 } },
        {
            headers: {
                'xi-api-key': process.env.ELEVENLABS_API_KEY,
                'Content-Type': 'application/json',
                accept: 'audio/mpeg',
            },
            responseType: 'arraybuffer',
            timeout: 15000,
        }
    );
    return { buffer: Buffer.from(res.data), contentType: 'audio/mpeg', provider: 'elevenlabs' };
}

async function edgeSynthesize(text) {
    const base = process.env.EDGE_TTS_URL || 'http://localhost:5070';
    const res = await axios.post(`${base}/tts`, { text }, {
        responseType: 'arraybuffer',
        timeout: 15000,
    });
    return { buffer: Buffer.from(res.data), contentType: 'audio/mpeg', provider: 'edge' };
}

async function voiceboxSynthesize(text, lang = 'ar') {
    const base = process.env.VOICEBOX_URL || 'http://127.0.0.1:17493';
    const res = await axios.post(
        `${base}/generate`,
        { text, profile_id: process.env.VOICEBOX_PROFILE_ID, language: lang },
        { responseType: 'arraybuffer', timeout: 30000 }
    );
    return { buffer: Buffer.from(res.data), contentType: 'audio/mpeg', provider: 'voicebox' };
}

// Returns synthesized audio, or null to signal "use Twilio's built-in <Say>".
export async function synthesize(text, { lang = 'ar' } = {}) {
    if (!text) return null;
    try {
        switch (PROVIDER) {
            case 'azure':
                return await azureSynthesize(text, lang);
            case 'elevenlabs':
                return await elevenSynthesize(text);
            case 'edge':
                return await edgeSynthesize(text);
            case 'voicebox':
                return await voiceboxSynthesize(text, lang);
            case 'polly':
            default:
                return null; // caller falls back to Twilio <Say> Polly.Zeina
        }
    } catch (err) {
        // Safe fallback (G4: safe fallback when TTS unavailable) — let caller use <Say>.
        logger.error({ err: err.message, provider: PROVIDER }, 'TTS synthesis failed; falling back');
        return null;
    }
}

export function getTtsProvider() {
    return PROVIDER;
}

// Prefer a natural neural voice everywhere: try the configured provider first,
// then fall back to the free edge-tts neural voice, and only then let the caller
// drop to Twilio's robotic <Say> Polly.Zeina as a last resort.
export async function synthesizeNatural(text, { lang = 'ar' } = {}) {
    if (!text) return null;
    const primary = await synthesize(text, { lang });
    if (primary?.buffer) return primary;
    if (PROVIDER !== 'edge') {
        try {
            const edge = await edgeSynthesize(text);
            if (edge?.buffer) return edge;
        } catch (err) {
            logger.warn({ err: err.message }, 'edge-tts fallback failed');
        }
    }
    return null;
}

// Telephony-grade synthesis: returns raw 8kHz 8-bit mono μ-law bytes, the exact
// format Twilio Media Streams expects (no transcoding needed). Azure-only for now.
// Returns Buffer | null.
export async function synthesizeMulaw(text, lang = 'ar') {
    if (!text) return null;
    if (PROVIDER !== 'azure' || !AZURE_KEY || !AZURE_REGION) {
        // Other providers would need ffmpeg transcoding to μ-law; out of scope here.
        return null;
    }
    try {
        const locale = AZURE_VOICE.split('-').slice(0, 2).join('-') || 'ar-JO';
        const ssml =
            `<speak version='1.0' xml:lang='${locale}'>` +
            `<voice xml:lang='${locale}' name='${AZURE_VOICE}'>${escapeXml(text)}</voice>` +
            `</speak>`;
        const url = `https://${AZURE_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`;
        const res = await axios.post(url, ssml, {
            headers: {
                'Ocp-Apim-Subscription-Key': AZURE_KEY,
                'Content-Type': 'application/ssml+xml',
                'X-Microsoft-OutputFormat': 'raw-8khz-8bit-mono-mulaw',
                'User-Agent': 'connect-hub',
            },
            responseType: 'arraybuffer',
            timeout: 10000,
        });
        return Buffer.from(res.data);
    } catch (err) {
        logger.error({ err: err.message }, 'Azure μ-law synthesis failed');
        return null;
    }
}
