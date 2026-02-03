import httpx
from app.core.config import settings
import logging
from typing import Optional

logger = logging.getLogger(__name__)

class WhatsAppClient:
    def __init__(self, phone_number_id: Optional[str] = None, access_token: Optional[str] = None):
        # Prefer passed values, then environment settings if they exist, otherwise None
        self.phone_number_id = phone_number_id or getattr(settings, "WHATSAPP_PHONE_NUMBER_ID", None)
        self.access_token = access_token or getattr(settings, "WHATSAPP_ACCESS_TOKEN", None)
        self.base_url = "https://graph.facebook.com/v24.0"

    def _get_api_url(self):
        if not self.phone_number_id:
            raise Exception("WhatsApp Phone Number ID is not configured (missing in both settings and database)")
        return f"{self.base_url}/{self.phone_number_id}/messages"

    def _get_headers(self):
        if not self.access_token:
            raise Exception("WhatsApp Access Token is not configured (missing in both settings and database)")
        return {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }

    async def send_text_message(self, to_phone: str, text: str):
        payload = {
            "messaging_product": "whatsapp",
            "to": to_phone,
            "type": "text",
            "text": {"body": text}
        }
        
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    self._get_api_url(), 
                    json=payload, 
                    headers=self._get_headers()
                )
                response.raise_for_status()
                return response.json()
            except httpx.HTTPError as e:
                logger.error(f"WhatsApp API Error: {e}")
                logger.error(f"Response: {e.response.text if e.response else 'No response'}")
                raise e

# Default client
whatsapp_client = WhatsAppClient()
