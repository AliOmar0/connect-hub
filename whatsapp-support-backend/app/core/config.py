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
    SUPABASE_URL: str
    SUPABASE_KEY: str

    # OpenRouter
    OPENROUTER_API_KEY: str
    OPENROUTER_MODEL: str = "arcee-ai/trinity-large-preview:free"

    # WhatsApp Settings (Defaults, but usually pulled from DB)
    WHATSAPP_VERIFY_TOKEN: str = "pib_verify_token_2024"
    
    # Security WhatsApp (For OTPs)
    SECURITY_WHATSAPP_PHONE_NUMBER_ID: Optional[str] = None
    SECURITY_WHATSAPP_ACCESS_TOKEN: Optional[str] = None
    
    # App
    BACKEND_CORS_ORIGINS: List[str] = ["*"]
    USE_NGROK: bool = False
    NGROK_ID: Optional[str] = Field(None, validation_alias=AliasChoices("NGROK_ID", "ID"))
    NGROK_URL: Optional[str] = Field(None, validation_alias=AliasChoices("NGROK_URL", "URL"))

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
        SUPABASE_URL=os.getenv("SUPABASE_URL", ""),
        SUPABASE_KEY=os.getenv("SUPABASE_KEY", ""),
        OPENROUTER_API_KEY=os.getenv("OPENROUTER_API_KEY", ""),
        OPENROUTER_MODEL=os.getenv("OPENROUTER_MODEL", "arcee-ai/trinity-large-preview:free"),
        SECURITY_WHATSAPP_PHONE_NUMBER_ID=os.getenv("SECURITY_WHATSAPP_PHONE_NUMBER_ID"),
        SECURITY_WHATSAPP_ACCESS_TOKEN=os.getenv("SECURITY_WHATSAPP_ACCESS_TOKEN"),
        NGROK_ID=os.getenv("ID"),
        NGROK_URL=os.getenv("URL")
    )
