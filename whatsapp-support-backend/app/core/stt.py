import torch
from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor, pipeline
import logging
import io
import os
import numpy as np
import librosa
from typing import Optional

import warnings
# Suppress noisy Transformers generation warnings
warnings.filterwarnings("ignore", message=".*SuppressTokensLogitsProcessor.*")
warnings.filterwarnings("ignore", message=".*SuppressTokensAtBeginLogitsProcessor.*")

logger = logging.getLogger(__name__)

class STTService:
    def __init__(self):
        self.model_id = "openai/whisper-medium"
        self.device = "cuda:0" if torch.cuda.is_available() else "cpu"
        self.torch_dtype = torch.float16 if torch.cuda.is_available() else torch.float32
        
        logger.info(f"Loading Local STT Model: {self.model_id} on {self.device}")
        
        try:
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
        """
        Transcribe audio using the local Whisper model.
        """
        if not self.pipe:
            logger.error("STT Pipeline is not initialized.")
            return None

        try:
            # WhatsApp sends OGG/Opus. We need to decode it to a format the pipeline understands (numpy array)
            # librosa is great for this.
            audio_io = io.BytesIO(audio_bytes)
            
            # Load the audio with librosa (resamples to 16kHz which whisper expects)
            y, sr = librosa.load(audio_io, sr=16000)
            
            # Run inference
            # generate_kwargs for Arabic support
            result = self.pipe(y, generate_kwargs={"language": "arabic", "task": "transcribe"})
            
            return result.get("text")
        except Exception as e:
            logger.error(f"Local Transcription Error: {e}")
            return None

# Initialize the service (this will load the model into memory)
stt_service = STTService()
