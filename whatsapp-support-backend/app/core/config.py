import os
from typing import List, Optional

from dotenv import load_dotenv
from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict
from typing_extensions import Annotated

# Load .env file explicitly
load_dotenv()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", case_sensitive=True, extra="ignore"
    )

    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "WhatsApp Support Backend"

    # Supabase (Used for both API and DB via Supabase Client)
    SUPABASE_URL: str = Field(
        ..., validation_alias=AliasChoices("SUPABASE_URL", "VITE_SUPABASE_URL")
    )
    SUPABASE_KEY: str = Field(
        ..., validation_alias=AliasChoices("SUPABASE_KEY", "SUPABASE_SERVICE_ROLE_KEY")
    )

    # "Bank_db_oss" — separate Supabase project holding customers/accounts, queried
    # to answer customer account questions (balance/IBAN lookups) after OTP
    # verification. Optional: falls back to the main SUPABASE_URL/KEY above
    # when unset, so single-DB setups keep working.
    # BANK_DB_OSS_KEY MUST be the bank project's PUBLISHABLE (anon) key.
    # service_role bypasses RLS, which would defeat the read-only grants in
    # scripts/sql/bank_db_oss_readonly.sql -- the app refuses to start with one.
    BANK_DB_OSS_URL: Optional[str] = None
    BANK_DB_OSS_KEY: Optional[str] = None
    # When True, the server refuses to boot unless Bank_db_oss and the OTP
    # service are both configured. Set False to run without account lookups.
    BANK_LOOKUP_ENABLED: bool = True

    # OpenRouter
    OPENROUTER_API_KEY: str
    OPENROUTER_MODEL: str = "google/gemma-4-31b-it:free"

    # DeepSeek (primary answering model when DEEPSEEK_API_KEY is set; OpenRouter
    # is used as fallback). DeepSeek's API is OpenAI-compatible.
    DEEPSEEK_API_KEY: Optional[str] = None
    DEEPSEEK_MODEL: str = "deepseek-v4-flash"
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com/v1"

    # WhatsApp Settings (Defaults, but usually pulled from DB)
    # No default: a shipped-in-source verify token is a token everyone knows.
    WHATSAPP_VERIFY_TOKEN: str = ""

    # Speech-to-Text (voice messages). Deepgram is used via REST (httpx) so no
    # heavy local model/deps are required. Arabic by default.
    DEEPGRAM_API_KEY: Optional[str] = None
    VOICE_ASR_MODEL: str = "nova-3"
    VOICE_ASR_LANGUAGE: str = "ar"

    # Security WhatsApp (For OTPs)
    SECURITY_WHATSAPP_PHONE_NUMBER_ID: Optional[str] = None
    SECURITY_WHATSAPP_ACCESS_TOKEN: Optional[str] = None

    # Meta App Secret used to verify X-Hub-Signature-256 on inbound webhooks.
    # When unset, signature verification is skipped (logs a warning) so local/dev
    # setups keep working; set it in production to reject forged webhook calls.
    WHATSAPP_APP_SECRET: Optional[str] = None

    # Set to False to skip signature verification entirely (local dev / simulators).
    # Must be True in production when WHATSAPP_APP_SECRET is also set.
    WHATSAPP_VERIFY_SIGNATURE: bool = True

    # Escape hatch for local dev / simulators. Signature verification now FAILS
    # CLOSED when WHATSAPP_APP_SECRET is unset; set this to True to accept
    # unsigned webhooks anyway. Never enable in production.
    WHATSAPP_ALLOW_UNSIGNED: bool = False

    # App
    # SECURITY: default to blocking all cross-origin requests. A wildcard here
    # would let ANY website read authenticated API responses. Set explicit
    # origins (comma-separated in .env) for browsers that need access; the
    # webhook route (Meta callbacks) never goes through CORS regardless.
    # NoDecode: read as a raw string (not JSON) so a plain comma-separated
    # value in .env parses correctly instead of crashing at startup.
    BACKEND_CORS_ORIGINS: Annotated[List[str], NoDecode] = []
    USE_NGROK: bool = False
    NGROK_ID: Optional[str] = Field(None, validation_alias=AliasChoices("NGROK_ID", "ID"))
    NGROK_URL: Optional[str] = Field(None, validation_alias=AliasChoices("NGROK_URL", "URL"))
    # OTP service. OTP_SERVICE_BASE_URL is canonical; OTP_SERVICE_URL is the
    # deprecated legacy form (it used to hardcode a third-party ngrok subdomain
    # *including* the /generate path). Default is empty on purpose: if that
    # tunnel ever lapses, whoever claims the subdomain next receives customer
    # phone numbers and can send texts that look like our OTPs.
    OTP_SERVICE_BASE_URL: Optional[str] = None
    OTP_SERVICE_URL: str = ""  # DEPRECATED - use OTP_SERVICE_BASE_URL
    OTP_SERVICE_SHARED_SECRET: Optional[str] = None
    OTP_REQUEST_TIMEOUT: float = 10.0
    OTP_CODE_LENGTH: int = 6
    OTP_MAX_ATTEMPTS: int = 3
    OTP_SESSION_TTL_SECONDS: int = 300  # mirrors the OTP service's 5-min expiry
    OTP_RESEND_COOLDOWN_SECONDS: int = 60
    OTP_MAX_SENDS_PER_PHONE_PER_15MIN: int = 3

    # JWT Authentication (shared with Node.js backend - uses same Supabase JWT secret)
    SUPABASE_JWT_SECRET: str = Field(
        ..., validation_alias=AliasChoices("SUPABASE_JWT_SECRET", "JWT_SECRET")
    )
    JWT_ALGORITHM: str = "HS256"
    JWT_AUTHORIZED_ROLES: List[str] = ["viewer", "agent", "manager", "supervisor", "admin"]

    # RAG Configuration (FR-03.03)
    QDRANT_URL: Optional[str] = None  # Remote Qdrant URL (optional, uses local if not set)
    QDRANT_STORAGE_PATH: str = "./qdrant_storage"  # Local storage path
    QDRANT_COLLECTION: str = "pib_knowledge"
    RAG_TOP_K: int = 3  # Number of results to retrieve
    RAG_SIMILARITY_THRESHOLD: float = 0.75  # Minimum cosine similarity
    RAG_MAX_UPLOAD_BYTES: int = 5 * 1024 * 1024  # 5 MB max file size
    EMBEDDING_MODEL: str = "paraphrase-multilingual-MiniLM-L12-v2"  # Multilingual for Arabic

    @property
    def otp_base_url(self) -> str:
        """OTP service base URL, tolerating the deprecated path-suffixed form."""
        if self.OTP_SERVICE_BASE_URL:
            return self.OTP_SERVICE_BASE_URL.rstrip("/")
        u = (self.OTP_SERVICE_URL or "").rstrip("/")
        for suffix in ("/generate", "/webhook"):
            if u.endswith(suffix):
                return u[: -len(suffix)]
        return u

    @property
    def otp_generate_url(self) -> str:
        return f"{self.otp_base_url}/generate"

    @property
    def otp_verify_url(self) -> str:
        return f"{self.otp_base_url}/verify"

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def _split_cors_origins(cls, v):
        """Accept a plain comma-separated string (e.g. from .env) in addition
        to a JSON array, since pydantic-settings otherwise requires JSON
        syntax for List[str] env vars and silently breaks startup otherwise."""
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return []
            if v.startswith("["):
                # Already JSON — let pydantic's default decoder handle it.
                import json

                return json.loads(v)
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    # NLP Pipeline (Intent / Language / Entity)
    # Path to a fine-tuned AraBERT/CAMeL-BERT intent checkpoint. When unset or
    # missing, the deterministic heuristic classifier is used as fallback.
    INTENT_MODEL_PATH: Optional[str] = None
    # Optional Arabic NER model (CAMeL-Lab token-classification) to augment
    # branch/product extraction. Rules-only when disabled.
    NER_MODEL_PATH: Optional[str] = None
    ENABLE_ARABIC_NER: bool = False

    # Rate limiting (NFR-03.03) - simple in-memory sliding-window limiter.
    # NOTE: in-memory means limits are per-process; fine for a single instance,
    # but won't be shared across horizontally-scaled replicas (use a shared
    # store like Redis for that case).
    RATE_LIMIT_IP_PER_MIN: int = 60
    RATE_LIMIT_SESSION_PER_MIN: int = 10
    RATE_LIMIT_ENABLED: bool = True
    # Only enable behind a proxy you control (Render/Vercel/nginx). When False,
    # X-Forwarded-For is ignored, because any client can forge it.
    TRUST_PROXY_HEADERS: bool = False

    # Data retention (NFR-03.05) - automated cleanup of old records.
    DATA_RETENTION_DAYS: int = 30

    # Bank website scraper (Scraper_Service) - crawls the bank's public
    # website and feeds extracted pages into the existing knowledge base
    # pipeline (see app/core/scraper/).
    BANK_WEBSITE_BASE_URL: str = "https://islamicbank.ps"
    SCRAPER_ENABLED: bool = True
    SCRAPER_USER_AGENT: str = "PIB-KnowledgeBaseBot/1.0"
    SCRAPER_MAX_DEPTH: int = 5
    SCRAPER_MAX_PAGES: int = 200
    SCRAPER_MIN_REQUEST_DELAY_SECONDS: float = 1.0
    SCRAPER_MAX_RETRIES: int = 3
    SCRAPER_RETRY_BASE_BACKOFF_SECONDS: float = 2.0
    SCRAPER_SCHEDULE_INTERVAL_HOURS: int = 24

    # Vision AI (Image Analysis) - analyzes images sent via WhatsApp
    # Uses the same OpenRouter/DeepSeek infrastructure as text LLM
    VISION_ENABLED: bool = True
    VISION_MODEL: str = "google/gemini-2.5-flash"  # Vision-capable model
    VISION_MAX_IMAGE_SIZE_MB: int = 10  # Maximum image size in MB
    VISION_SUPPORTED_TYPES: List[str] = ["image/jpeg", "image/png", "image/webp"]
    VISION_TIMEOUT: int = 90  # Timeout for vision API calls (seconds)


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
        BANK_DB_OSS_URL=os.getenv("BANK_DB_OSS_URL"),
        BANK_DB_OSS_KEY=os.getenv("BANK_DB_OSS_KEY"),
        OTP_SERVICE_BASE_URL=os.getenv("OTP_SERVICE_BASE_URL"),
        OTP_SERVICE_SHARED_SECRET=os.getenv("OTP_SERVICE_SHARED_SECRET"),
        NGROK_ID=os.getenv("ID"),
        NGROK_URL=os.getenv("URL"),
    )
