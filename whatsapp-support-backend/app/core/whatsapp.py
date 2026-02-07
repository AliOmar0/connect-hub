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

    async def get_media_url(self, media_id: str) -> Optional[str]:
        """
        Get the direct URL for a media file using its media_id.
        """
        url = f"{self.base_url}/{media_id}"
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(
                    url,
                    headers=self._get_headers()
                )
                response.raise_for_status()
                return response.json().get("url")
            except httpx.HTTPError as e:
                logger.error(f"WhatsApp Media URL Error: {e}")
                return None

    async def download_media(self, media_url: str) -> Optional[bytes]:
        """
        Download media content from Meta's servers.
        """
        async with httpx.AsyncClient() as client:
            try:
                # Media download requires the same access token
                response = await client.get(
                    media_url,
                    headers={"Authorization": f"Bearer {self.access_token}"}
                )
                response.raise_for_status()
                return response.content
            except httpx.HTTPError as e:
                logger.error(f"WhatsApp Media Download Error: {e}")
                return None

# Default client
whatsapp_client = WhatsAppClient()
