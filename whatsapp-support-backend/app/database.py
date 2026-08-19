import base64
import json
import logging
import sys
from typing import Optional

from supabase import Client, create_client

from app.core.config import settings
from app.core.readonly_db import ReadOnlyClient, create_readonly_client

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


# ---------------------------------------------------------------------------
# "Bank_db_oss" - separate Supabase project holding live customer bank accounts.
#
# This client is READ-ONLY by construction (see app/core/readonly_db.py) and
# fails CLOSED: when it is not configured it stays ``None`` and every caller
# raises. It must never fall back to the main ``supabase`` client, which is
# authenticated with the service-role key and can read and write everything.
# ---------------------------------------------------------------------------

BANK_ACCOUNT_RPC = "get_bank_account_by_phone"


class BankDbUnavailable(RuntimeError):
    """Raised when bank account data is requested but Bank_db_oss is not configured."""


def _looks_like_service_role(key: str) -> bool:
    """Best-effort detection of a service-role / secret key.

    service_role BYPASSES RLS, which would silently defeat every policy in
    scripts/sql/bank_db_oss_readonly.sql. The key here must be the project's
    publishable/anon key.
    """
    if not key:
        return False
    if key.startswith("sb_secret_"):
        return True
    parts = key.split(".")
    if len(parts) == 3:  # looks like a JWT - inspect the (unverified) payload
        try:
            payload = parts[1]
            payload += "=" * (-len(payload) % 4)
            claims = json.loads(base64.urlsafe_b64decode(payload))
            return claims.get("role") == "service_role"
        except Exception:
            return False
    return False


def _build_bank_client() -> Optional[ReadOnlyClient]:
    url = settings.BANK_DB_OSS_URL
    key = settings.BANK_DB_OSS_KEY

    if not url or not key or url.startswith("https://your_") or key.startswith("your_"):
        logger.warning(
            "BANK_DB_OSS_URL/BANK_DB_OSS_KEY not configured - bank account lookups "
            "are DISABLED. (They are never served from the main Supabase project.)"
        )
        return None

    if url == settings.SUPABASE_URL and key == settings.SUPABASE_KEY:
        raise RuntimeError(
            "BANK_DB_OSS_* points at the main Supabase project with the same key. "
            "Bank account data must live in its own project with a read-only key."
        )

    if _looks_like_service_role(key):
        raise RuntimeError(
            "BANK_DB_OSS_KEY looks like a service-role/secret key. service_role "
            "bypasses RLS, which defeats the read-only grants in the bank project. "
            "Use the bank project's publishable (anon) key instead."
        )

    # No table is allowlisted: the only read path is the RPC, which returns at
    # most one row for a phone the caller already knows. Direct table access
    # would be an enumeration surface even read-only, and nothing needs it.
    client = create_readonly_client(
        url,
        key,
        allowed_tables=set(),
        allowed_rpc={BANK_ACCOUNT_RPC},
    )
    logger.info("Bank_db_oss read-only client initialised.")
    return client


# Never sys.exit() here: app.database is imported at test-collection time via
# app.crud.crud, and exiting would abort the whole pytest run. Startup refusal
# is enforced in app/main.py::_validate_startup instead.
try:
    bank_db_oss: Optional[ReadOnlyClient] = _build_bank_client()
except RuntimeError as e:
    logger.critical(f"Bank_db_oss misconfiguration: {e}")
    bank_db_oss = None
    _BANK_DB_ERROR: Optional[str] = str(e)
else:
    _BANK_DB_ERROR = None


def get_bank_db_oss_or_raise() -> ReadOnlyClient:
    """Return the read-only bank client, or raise if it is unavailable."""
    if bank_db_oss is None:
        raise BankDbUnavailable(
            _BANK_DB_ERROR
            or "Bank_db_oss is not configured (set BANK_DB_OSS_URL and BANK_DB_OSS_KEY)."
        )
    return bank_db_oss


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
