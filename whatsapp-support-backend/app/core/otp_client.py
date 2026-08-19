"""
Client for the standalone OTP service.

The important invariant: **this backend never learns the OTP code.** It asks the
service to send one, and later asks the service whether a code the customer
typed is valid. Previously the webhook expected ``/generate`` to hand back the
code (it never did -- that response has no ``otp`` field, which is why the whole
account flow was dead), stored it in a module-global dict, and compared it with
``==``.
"""
from __future__ import annotations

import logging
from typing import Optional

import httpx

from app.core.config import settings
from app.core.nlp.normalize import mask_identifier

logger = logging.getLogger(__name__)

# "sent" / "rate_limited" / "unavailable"
SendOutcome = str
# "valid" / "invalid" / "error"
VerifyOutcome = str


class OtpServiceClient:
    def __init__(
        self,
        base_url: str,
        secret: Optional[str] = None,
        timeout: float = 10.0,
    ) -> None:
        self._base_url = (base_url or "").rstrip("/")
        self._secret = secret
        self._timeout = timeout

    @property
    def configured(self) -> bool:
        return bool(self._base_url)

    def _headers(self) -> dict:
        headers = {"Content-Type": "application/json"}
        if self._secret:
            headers["X-OTP-Service-Key"] = self._secret
        return headers

    async def generate(self, phone: str, intent: str = "ACCOUNT_INFO") -> SendOutcome:
        """Ask the service to send a code. Never returns the code."""
        if not self.configured:
            logger.error("OTP service is not configured (set OTP_SERVICE_BASE_URL)")
            return "unavailable"
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.post(
                    f"{self._base_url}/generate",
                    json={"phone": phone, "intent": intent},
                    headers=self._headers(),
                )
            if response.status_code == 429:
                return "rate_limited"
            response.raise_for_status()
            return "sent"
        except Exception as e:
            logger.error(f"[OTP] generate failed for {mask_identifier(phone)}: {e}")
            return "unavailable"

    async def verify(self, phone: str, code: str) -> VerifyOutcome:
        """Check a code with the service.

        Returns "invalid" ONLY on an explicit negative from the service.
        Transport failures return "error" so the caller can avoid charging the
        customer an attempt for our own outage.
        """
        if not self.configured:
            logger.error("OTP service is not configured (set OTP_SERVICE_BASE_URL)")
            return "error"
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.post(
                    f"{self._base_url}/verify",
                    json={"phone": phone, "otp": code},
                    headers=self._headers(),
                )
            if response.status_code == 429:
                return "error"
            response.raise_for_status()
            data = response.json()
            return "valid" if data.get("valid") is True else "invalid"
        except Exception as e:
            # Never log `code`.
            logger.error(f"[OTP] verify failed for {mask_identifier(phone)}: {e}")
            return "error"


otp_client = OtpServiceClient(
    settings.otp_base_url,
    settings.OTP_SERVICE_SHARED_SECRET,
    settings.OTP_REQUEST_TIMEOUT,
)
