from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List, Optional
import os

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

    # WhatsApp Settings (Defaults, but usually pulled from DB)
    WHATSAPP_VERIFY_TOKEN: str = "pib_verify_token_2024"
    
    # App
    BACKEND_CORS_ORIGINS: List[str] = ["*"]

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
        SUPABASE_KEY=os.getenv("SUPABASE_KEY", "")
    )
