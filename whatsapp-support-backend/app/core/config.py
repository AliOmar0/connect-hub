from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, AliasChoices
from typing import List, Optional
import os
from dotenv import load_dotenv

# Load .env file explicitly
load_dotenv()

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )

    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "WhatsApp Support Backend"
    
    # Supabase (Used for both API and DB via Supabase Client)
    SUPABASE_URL: str = Field(..., validation_alias=AliasChoices("SUPABASE_URL", "VITE_SUPABASE_URL"))
    SUPABASE_KEY: str = Field(..., validation_alias=AliasChoices("SUPABASE_KEY", "SUPABASE_SERVICE_ROLE_KEY"))

    # OpenRouter
    OPENROUTER_API_KEY: str
    OPENROUTER_MODEL: str = "google/gemma-4-31b-it:free"

    # DeepSeek (primary answering model when DEEPSEEK_API_KEY is set; OpenRouter
    # is used as fallback). DeepSeek's API is OpenAI-compatible.
    DEEPSEEK_API_KEY: Optional[str] = None
    DEEPSEEK_MODEL: str = "deepseek-v4-pro"
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com/v1"

    # WhatsApp Settings (Defaults, but usually pulled from DB)
    WHATSAPP_VERIFY_TOKEN: str = "pib_verify_token_2024"
    
    # Security WhatsApp (For OTPs)
    SECURITY_WHATSAPP_PHONE_NUMBER_ID: Optional[str] = None
    SECURITY_WHATSAPP_ACCESS_TOKEN: Optional[str] = None

    # Meta App Secret used to verify X-Hub-Signature-256 on inbound webhooks.
    # When unset, signature verification is skipped (logs a warning) so local/dev
    # setups keep working; set it in production to reject forged webhook calls.
    WHATSAPP_APP_SECRET: Optional[str] = None
    
    # App
    BACKEND_CORS_ORIGINS: List[str] = ["*"]
    USE_NGROK: bool = False
    NGROK_ID: Optional[str] = Field(None, validation_alias=AliasChoices("NGROK_ID", "ID"))
    NGROK_URL: Optional[str] = Field(None, validation_alias=AliasChoices("NGROK_URL", "URL"))
    OTP_SERVICE_URL: str = "https://cupulate-azaria-tented.ngrok-free.dev/generate"
    
    # RAG Configuration (FR-03.03)
    QDRANT_URL: Optional[str] = None  # Remote Qdrant URL (optional, uses local if not set)
    QDRANT_STORAGE_PATH: str = "./qdrant_storage"  # Local storage path
    QDRANT_COLLECTION: str = "pib_knowledge"
    RAG_TOP_K: int = 3  # Number of results to retrieve
    RAG_SIMILARITY_THRESHOLD: float = 0.75  # Minimum cosine similarity
    RAG_MAX_UPLOAD_BYTES: int = 5 * 1024 * 1024  # 5 MB max file size
    EMBEDDING_MODEL: str = "paraphrase-multilingual-MiniLM-L12-v2"  # Multilingual for Arabic

    # NLP Pipeline (Intent / Language / Entity)
    # Path to a fine-tuned AraBERT/CAMeL-BERT intent checkpoint. When unset or
    # missing, the deterministic heuristic classifier is used as fallback.
    INTENT_MODEL_PATH: Optional[str] = None
    # Optional Arabic NER model (CAMeL-Lab token-classification) to augment
    # branch/product extraction. Rules-only when disabled.
    NER_MODEL_PATH: Optional[str] = None
    ENABLE_ARABIC_NER: bool = False

# Initialize settings
try:
    settings = Settings()
except Exception as e:
    print(f"\nConfiguration Error: {e}")
    # In case of error, we'll try to get them directly from environment as a fallback
    # We use empty strings as defaults to allow the class to instantiate even if env is missing,
    # though it will fail later when trying to use these values.
    # Better to have defaults in the class definition if we want it to never fail instantiation.
    settings = Settings(
        SUPABASE_URL=os.getenv("SUPABASE_URL", os.getenv("VITE_SUPABASE_URL", "")),
        SUPABASE_KEY=os.getenv("SUPABASE_KEY", os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")),
        OPENROUTER_API_KEY=os.getenv("OPENROUTER_API_KEY", ""),
        OPENROUTER_MODEL=os.getenv("OPENROUTER_MODEL", "arcee-ai/trinity-large-preview:free"),
        DEEPSEEK_API_KEY=os.getenv("DEEPSEEK_API_KEY"),
        DEEPSEEK_MODEL=os.getenv("DEEPSEEK_MODEL", "deepseek-v4-pro"),
        SECURITY_WHATSAPP_PHONE_NUMBER_ID=os.getenv("SECURITY_WHATSAPP_PHONE_NUMBER_ID"),
        SECURITY_WHATSAPP_ACCESS_TOKEN=os.getenv("SECURITY_WHATSAPP_ACCESS_TOKEN"),
        NGROK_ID=os.getenv("ID"),
        NGROK_URL=os.getenv("URL")
    )
