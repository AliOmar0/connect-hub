import logging
from typing import Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

DEEPGRAM_URL = "https://api.deepgram.com/v1/listen"


def _detect_content_type(audio_bytes: bytes) -> str:
    """Best-effort container detection from magic bytes; defaults to OGG."""
    head = audio_bytes[:12]
    if head[:4] == b"OggS":
        return "audio/ogg"
    if head[:4] == b"RIFF":
        return "audio/wav"
    if head[:4] == b"\x1aE\xdf\xa3":
        return "audio/webm"
    if head[:3] == b"ID3" or (len(head) >= 2 and head[0] == 0xFF and (head[1] & 0xE0) == 0xE0):
        return "audio/mpeg"
    # WhatsApp voice notes are OGG/Opus by default.
    return "audio/ogg"


class STTService:
    """
    Speech-to-Text for WhatsApp voice notes.

    Uses Deepgram's REST API over httpx (already a dependency), so there is no
    multi-GB local model to download and CPU transcription is not a bottleneck.
    WhatsApp sends OGG/Opus audio, which Deepgram auto-detects.
    """

    def __init__(self):
        self.api_key = settings.DEEPGRAM_API_KEY
        self.model = settings.VOICE_ASR_MODEL or "nova-2"
        self.language = settings.VOICE_ASR_LANGUAGE or "ar"

    async def transcribe_audio(self, audio_bytes: bytes, filename: str = "voice.ogg") -> Optional[str]:
        if not self.api_key:
            logger.error(
                "DEEPGRAM_API_KEY is not configured. Set it in "
                "whatsapp-support-backend/.env to enable voice transcription."
            )
            return None

        if not audio_bytes:
            logger.error("transcribe_audio called with empty audio bytes")
            return None

        params = {
            "model": self.model,
            "language": self.language,
            "smart_format": "true",
            "punctuate": "true",
        }
        headers = {
            "Authorization": f"Token {self.api_key}",
            # Detect the container from the audio's magic bytes. WhatsApp voice
            # notes are OGG/Opus; we also handle MP3/WAV/WebM defensively.
            "Content-Type": _detect_content_type(audio_bytes),
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    DEEPGRAM_URL,
                    params=params,
                    headers=headers,
                    content=audio_bytes,
                    timeout=60.0,
                )
                response.raise_for_status()
                data = response.json()
        except httpx.HTTPStatusError as e:
            body = e.response.text if e.response is not None else "no response"
            logger.error(f"Deepgram STT HTTP error {e.response.status_code if e.response else '?'}: {body}")
            return None
        except Exception as e:
            logger.error(f"Deepgram STT request error: {e}")
            return None

        try:
            transcript = (
                data["results"]["channels"][0]["alternatives"][0]["transcript"]
            ).strip()
        except (KeyError, IndexError, TypeError) as e:
            logger.error(f"Unexpected Deepgram response shape: {e} | {data}")
            return None

        if not transcript:
            logger.warning("Deepgram returned an empty transcript")
            return None

        return transcript


stt_service = STTService()
