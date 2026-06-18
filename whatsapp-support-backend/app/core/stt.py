import logging
import io
import os
from typing import Optional

logger = logging.getLogger(__name__)


class STTService:
    def __init__(self):
        self.model_id = "openai/whisper-medium"
        self.device = "cpu"
        self.torch_dtype = None
        self.model = None
        self.processor = None
        self.pipe = None

    async def _ensure_loaded(self):
        if self.pipe is not None:
            return
        try:
            import torch
            from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor, pipeline

            self.device = "cuda:0" if torch.cuda.is_available() else "cpu"
            self.torch_dtype = torch.float16 if torch.cuda.is_available() else torch.float32

            logger.info(f"Loading Local STT Model: {self.model_id} on {self.device}")

            self.model = AutoModelForSpeechSeq2Seq.from_pretrained(
                self.model_id,
                torch_dtype=self.torch_dtype,
                low_cpu_mem_usage=True,
                use_safetensors=True
            )
            self.model.to(self.device)
            self.processor = AutoProcessor.from_pretrained(self.model_id)

            self.pipe = pipeline(
                "automatic-speech-recognition",
                model=self.model,
                tokenizer=self.processor.tokenizer,
                feature_extractor=self.processor.feature_extractor,
                torch_dtype=self.torch_dtype,
                device=self.device,
            )
            logger.info("Local STT Model loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load local STT model: {e}")
            self.pipe = None

    async def transcribe_audio(self, audio_bytes: bytes, filename: str = "voice.ogg") -> Optional[str]:
        await self._ensure_loaded()
        if not self.pipe:
            logger.error("STT Pipeline is not initialized.")
            return None

        try:
            import librosa
            import numpy as np
            audio_io = io.BytesIO(audio_bytes)
            y, sr = librosa.load(audio_io, sr=16000)
            result = self.pipe(y, generate_kwargs={"language": "arabic", "task": "transcribe"})
            return result.get("text")
        except Exception as e:
            logger.error(f"Local Transcription Error: {e}")
            return None

stt_service = STTService()
