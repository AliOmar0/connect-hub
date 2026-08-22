"""
Shared test fixtures and configuration.
"""
import sys
import os
import shutil
import tempfile
import pytest
from unittest.mock import MagicMock, AsyncMock
from uuid import uuid4
from datetime import datetime, timezone

# Add app to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Send every test's Qdrant traffic to a throwaway directory, BEFORE any app
# module imports settings.
#
# Local Qdrant takes an exclusive lock on its storage folder, so a test that
# opens the real store either fights the dev server for the lock or, worse,
# writes into the live knowledge base. This was masked for a while: the storage
# path used to be relative ("./qdrant_storage"), so pytest run from the repo
# root silently got its own empty store while uvicorn used another. Anchoring
# the path to the backend root (app/core/config.py) fixed the split-brain and
# made the real isolation problem visible -- this is the actual fix.
_TEST_QDRANT_DIR = os.path.join(
    tempfile.gettempdir(), f"pib_qdrant_test_{os.getpid()}"
)
os.environ["QDRANT_STORAGE_PATH"] = _TEST_QDRANT_DIR
# A remote URL would take precedence over the path and reach a real server.
os.environ.pop("QDRANT_URL", None)


def pytest_sessionfinish(session, exitstatus):
    """Remove the throwaway Qdrant directory after the run."""
    shutil.rmtree(_TEST_QDRANT_DIR, ignore_errors=True)


# Configure pytest-asyncio
pytest_plugins = ["pytest_asyncio"]


@pytest.fixture(autouse=True)
def _isolated_qdrant_client():
    """Drop the cached Qdrant client between tests.

    app.core.rag caches the client in a module global, so without this the first
    test to open one holds its lock for the whole session and every later test
    that needs a fresh handle fails with "already accessed by another instance".
    """
    import app.core.rag as rag

    previous = getattr(rag, "_qdrant_client", None)
    rag._qdrant_client = None
    try:
        yield
    finally:
        client = getattr(rag, "_qdrant_client", None)
        if client is not None:
            try:
                client.close()
            except Exception:
                pass
        rag._qdrant_client = previous


@pytest.fixture(scope="session")
def event_loop():
    """Create event loop for async tests."""
    import asyncio
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def mock_supabase():
    """Mock Supabase client."""
    with patch("app.crud.crud.supabase") as mock:
        yield mock


@pytest.fixture
def mock_llm_service():
    """Mock LLM service."""
    with patch("app.core.llm.llm_service") as mock:
        yield mock


@pytest.fixture
def mock_whatsapp_client():
    """Mock WhatsApp client."""
    with patch("app.api.v1.webhook.WhatsAppClient") as mock:
        mock_instance = AsyncMock()
        mock.return_value = mock_instance
        yield mock_instance


@pytest.fixture
def mock_stt_service():
    """Mock STT service."""
    with patch("app.api.v1.webhook.stt_service") as mock:
        yield mock


@pytest.fixture
def mock_storage_service():
    """Mock storage service."""
    with patch("app.api.v1.webhook.storage_service") as mock:
        yield mock


@pytest.fixture
def sample_session():
    """Create a sample session for testing."""
    from app.models.models import Session
    from app.models.enums import SessionStatus, ChannelType
    
    return Session(
        id=uuid4(),
        customer_id=uuid4(),
        channel=ChannelType.whatsapp,
        status=SessionStatus.active,
        started_at=datetime.now(timezone.utc),
    )


@pytest.fixture
def sample_customer():
    """Create a sample customer for testing."""
    from app.models.models import Customer
    from app.models.enums import ChannelType
    
    return Customer(
        id=uuid4(),
        phone="+970599123456",
        name="أحمد محمد",
        preferred_channel=ChannelType.whatsapp,
    )


@pytest.fixture
def sample_message():
    """Create a sample message for testing."""
    from app.models.models import Message
    from app.models.enums import MessageDirection, ChannelType
    
    return Message(
        id=uuid4(),
        session_id=uuid4(),
        content="مرحباً، ما هو رصيدي؟",
        direction=MessageDirection.inbound,
        channel=ChannelType.whatsapp,
        external_message_id="wamid_123",
    )


@pytest.fixture
def sample_nlp_result():
    """Create a sample NLP result."""
    from app.models.nlp import NLPResult
    from app.models.nlp import IntentLabel, LanguageLabel
    
    return NLPResult(
        intent=IntentLabel.ACCOUNT_INQUIRY,
        intent_confidence=0.95,
        language=LanguageLabel.MSA,
        language_confidence=0.98,
        entities=[],
        requires_confirmation=False,
        fallback_triggered=False,
    )


@pytest.fixture(autouse=True)
def clear_otp_sessions():
    """Clear pending verifications and OTP send throttles before each test."""
    from app.core.verification_state import otp_send_limiter, verification_store
    verification_store.clear_all()
    otp_send_limiter.reset()
    yield
    verification_store.clear_all()
    otp_send_limiter.reset()


@pytest.fixture(autouse=True)
def clear_message_buffer():
    """Clear message buffer before each test."""
    from app.core.message_buffer import message_buffer
    message_buffer._buffers.clear()
    yield
    message_buffer._buffers.clear()


@pytest.fixture(autouse=True)
def clear_processed_messages():
    """Clear processed message IDs before each test."""
    from app.api.v1.webhook import _processed_message_ids
    _processed_message_ids.clear()
    yield
    _processed_message_ids.clear()


# Mock settings for tests that need it
@pytest.fixture
def mock_settings():
    """Mock application settings."""
    with patch("app.core.config.settings") as mock:
        mock.SUPABASE_URL = "https://test.supabase.co"
        mock.SUPABASE_KEY = "test_key"
        mock.SUPABASE_JWT_SECRET = "test_jwt_secret"
        mock.JWT_ALGORITHM = "HS256"
        mock.JWT_AUTHORIZED_ROLES = ["admin", "agent", "supervisor"]
        mock.OPENROUTER_API_KEY = "test_openrouter_key"
        mock.OPENROUTER_MODEL = "test-model"
        mock.DEEPSEEK_API_KEY = None
        mock.DEEPSEEK_MODEL = "deepseek-chat"
        mock.DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1"
        mock.WHATSAPP_VERIFY_TOKEN = "test_verify_token"
        mock.WHATSAPP_APP_SECRET = "test_app_secret"
        mock.WHATSAPP_VERIFY_SIGNATURE = True
        mock.OTP_SERVICE_URL = ""
        mock.OTP_SERVICE_BASE_URL = "http://localhost:8001"
        mock.OTP_SERVICE_SHARED_SECRET = "test_otp_secret"
        mock.OTP_CODE_LENGTH = 6
        mock.OTP_MAX_ATTEMPTS = 3
        mock.OTP_SESSION_TTL_SECONDS = 300
        mock.BANK_LOOKUP_ENABLED = True
        mock.BANK_DB_OSS_URL = "https://bank.supabase.co"
        mock.BANK_DB_OSS_KEY = "test_anon_key"
        mock.QDRANT_URL = "http://localhost:6333"
        mock.QDRANT_COLLECTION = "test_collection"
        mock.QDRANT_API_KEY = None
        mock.BACKEND_CORS_ORIGINS = []
        mock.PROJECT_NAME = "Test Project"
        mock.API_V1_STR = "/api/v1"
        mock.SCRAPER_ENABLED = False
        mock.USE_NGROK = False
        mock.NGROK_ID = None
        mock.NGROK_URL = None
        yield mock


# Import patch for fixtures
from unittest.mock import patch