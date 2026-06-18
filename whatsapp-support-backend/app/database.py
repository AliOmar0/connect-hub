from supabase import create_client, Client
from app.core.config import settings
import logging
import sys

logger = logging.getLogger(__name__)

# Create the Supabase client with error handling at startup
try:
    if not settings.SUPABASE_URL or settings.SUPABASE_URL.startswith("https://your_"):
        raise ValueError("SUPABASE_URL is not configured — check your .env file.")
    if not settings.SUPABASE_KEY or settings.SUPABASE_KEY == "your_supabase_service_role_key":
        raise ValueError("SUPABASE_KEY is not configured — check your .env file.")

    supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
    logger.info("Supabase client initialised successfully.")

except ValueError as e:
    logger.critical(f"Supabase configuration error: {e}")
    sys.exit(1)

except Exception as e:
    logger.critical(
        f"Failed to connect to Supabase at {settings.SUPABASE_URL!r}. "
        f"Check your SUPABASE_URL and SUPABASE_KEY. Error: {e}"
    )
    sys.exit(1)


async def get_supabase() -> Client:
    """
    FastAPI dependency to get the Supabase client.
    The client is initialised once at module load; this simply returns it.
    """
    return supabase


async def check_supabase_connection() -> bool:
    """
    Health-check helper — performs a lightweight query to verify the
    Supabase connection is alive.  Returns True on success, False otherwise.
    """
    try:
        supabase.table("sessions").select("id").limit(1).execute()
        return True
    except Exception as e:
        logger.error(f"Supabase health-check failed: {e}")
        return False
