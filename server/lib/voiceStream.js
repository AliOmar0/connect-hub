// Real-time streaming voice with barge-in (G4).
//
// Architecture (preferred path from the work plan):
//   Twilio Media Streams (WebSocket, 8kHz μ-law)
//     -> Deepgram streaming ASR (interim + final)
//     -> processMessage() (same AI decision path as text/WhatsApp)
//     -> Azure μ-law TTS (8kHz, no transcoding)
//     -> audio frames streamed back to Twilio
//
// Barge-in: when the caller starts speaking while the bot is playing audio, we
// stop sending TTS frames and send Twilio a "clear" event to flush buffered audio.
//
// Latency is instrumented per component (ASR, AI, TTS) and as a total turn time.
//
// NOTE: This is the streaming path. The production-stable path remains the
// interruptible <Gather> flow in index.js. Deepgram Arabic streaming quality and
// the end-to-end timing should be validated on a live call before relying on it;
// see docs/PERSON_2_IMPLEMENTATION.md for the honest scope note.
import { createClient } from '@deepgram/sdk';
import { logger } from './logger.js';
import { synthesizeMulaw } from './tts.js';
import { appendTurn } from './redis.js';

const SILENCE_TIMEOUT_MS = Number(process.env.VOICE_SILENCE_TIMEOUT_MS || 8000);
const FRAME_BYTES = 160; // 20ms of 8kHz 8-bit μ-law
const FRAME_INTERVAL_MS = 20;

export function attachVoiceStream(wss, processMessage) {
    wss.on('connection', (ws) => {
        const state = {
            streamSid: null,
            callSid: null,
            botSpeaking: false,
            sending: false,
            lastSpeechAt: Date.now(),
            turnStart: 0,
            dg: null,
            silenceTimer: null,
        };

        const log = logger.child({ component: 'voice-stream' });

        // --- Deepgram live ASR ---
        function startAsr() {
            if (!process.env.DEEPGRAM_API_KEY) {
                log.warn('DEEPGRAM_API_KEY not set - streaming ASR disabled');
                return;
            }
            const dg = createClient(process.env.DEEPGRAM_API_KEY);
            const connection = dg.listen.live({
                encoding: 'mulaw',
                sample_rate: 8000,
                channels: 1,
                language: process.env.VOICE_ASR_LANGUAGE || 'ar',
                model: process.env.VOICE_ASR_MODEL || 'nova-2',
                interim_results: true,
                endpointing: 300,
            });

            connection.on('open', () => log.info('Deepgram ASR connected'));
            connection.on('error', (err) =>
                log.error({ err: err?.message || String(err) }, 'Deepgram error')
            );

            connection.on('Results', async (data) => {
                const alt = data?.channel?.alternatives?.[0];
                const transcript = alt?.transcript?.trim();
                if (!transcript) return;

                state.lastSpeechAt = Date.now();

                // Barge-in: caller spoke while the bot was talking -> stop & flush.
                if (state.botSpeaking) {
                    bargeIn();
                }

                if (data.is_final && data.speech_final) {
                    state.turnStart = Date.now();
                    const asrDoneAt = Date.now();
                    await handleUtterance(transcript, asrDoneAt);
                }
            });

            state.dg = connection;
        }

        function bargeIn() {
            state.sending = false;
            state.botSpeaking = false;
            if (state.streamSid) {
                ws.send(JSON.stringify({ event: 'clear', streamSid: state.streamSid }));
            }
            log.info('Barge-in: cleared bot audio');
        }

        async function handleUtterance(transcript, asrDoneAt) {
            try {
                await appendTurn(state.callSid || 'voice', 'user', transcript);
                const aiText = await processMessage(transcript, state.callSid || 'voice', null);
                const aiDoneAt = Date.now();

                const audio = await synthesizeMulaw(aiText, 'ar');
                const ttsDoneAt = Date.now();

                if (audio) {
                    await streamAudio(audio);
                }
                await appendTurn(state.callSid || 'voice', 'assistant', aiText);

                log.info(
                    {
                        asrMs: asrDoneAt - state.turnStart,
                        aiMs: aiDoneAt - asrDoneAt,
                        ttsMs: ttsDoneAt - aiDoneAt,
                        totalMs: ttsDoneAt - state.turnStart,
                    },
                    'voice turn latency'
                );
            } catch (err) {
                log.error({ err: err.message }, 'utterance handling failed');
            }
        }

        // Stream μ-law audio back as 20ms frames, honoring barge-in.
        async function streamAudio(buffer) {
            state.sending = true;
            state.botSpeaking = true;
            for (let i = 0; i < buffer.length && state.sending; i += FRAME_BYTES) {
                const frame = buffer.subarray(i, i + FRAME_BYTES);
                ws.send(
                    JSON.stringify({
                        event: 'media',
                        streamSid: state.streamSid,
                        media: { payload: frame.toString('base64') },
                    })
                );
                await new Promise((r) => setTimeout(r, FRAME_INTERVAL_MS));
            }
            state.botSpeaking = false;
            state.sending = false;
        }

        function resetSilenceTimer() {
            if (state.silenceTimer) clearInterval(state.silenceTimer);
            state.silenceTimer = setInterval(() => {
                if (Date.now() - state.lastSpeechAt > SILENCE_TIMEOUT_MS && !state.botSpeaking) {
                    handleUtterance('هل ما زلت معي؟', Date.now());
                    state.lastSpeechAt = Date.now();
                }
            }, 1000);
        }

        ws.on('message', (raw) => {
            let msg;
            try {
                msg = JSON.parse(raw.toString());
            } catch {
                return;
            }
            switch (msg.event) {
                case 'start':
                    state.streamSid = msg.start?.streamSid || msg.streamSid;
                    state.callSid = msg.start?.callSid;
                    log.info({ callSid: state.callSid }, 'media stream started');
                    startAsr();
                    resetSilenceTimer();
                    break;
                case 'media':
                    // Inbound caller audio (base64 μ-law) -> Deepgram.
                    if (state.dg && msg.media?.payload) {
                        state.dg.send(Buffer.from(msg.media.payload, 'base64'));
                    }
                    break;
                case 'stop':
                    cleanup();
                    break;
                default:
                    break;
            }
        });

        ws.on('close', cleanup);

        function cleanup() {
            if (state.silenceTimer) clearInterval(state.silenceTimer);
            try {
                state.dg?.finish?.();
            } catch {
                /* noop */
            }
        }
    });
}
