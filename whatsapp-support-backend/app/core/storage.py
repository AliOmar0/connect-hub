from app.database import supabase
import uuid
import logging

logger = logging.getLogger(__name__)

class StorageService:
    BUCKET_NAME = "messages"

    def __init__(self):
        # Attempt to create bucket on initialization (if possible)
        try:
            # Note: This is synchronous in the current SDK
            supabase.storage.create_bucket(self.BUCKET_NAME, options={"public": True})
            logger.info(f"Storage bucket '{self.BUCKET_NAME}' created or already exists.")
        except Exception:
            # Usually fails if it already exists, which is fine
            pass

    async def upload_audio(self, audio_bytes: bytes, filename: str = None) -> str:
        """
        Upload audio bytes to Supabase Storage and return the public URL.
        """
        try:
            if not filename:
                filename = f"voice_{uuid.uuid4().hex}.ogg"
            
            # Ensure bucket exists (or at least try to upload)
            # In Supabase, if the bucket doesn't exist, we might need to create it via the dashboard,
            # but we can attempt to upload first.
            
            path = f"audio/{filename}"
            
            # Use storage.from_(BUCKET_NAME).upload(path, bytes)
            # Note: For public access, the bucket must be set as public in Supabase dashboard.
            
            # We use the blocking upload for simplicity as the SDK might be blocking, 
            # or try to run in threadpool if it's purely blocking.
            # But the 'supabase' python sdk's storage is currently synchronous.
            
            res = supabase.storage.from_(self.BUCKET_NAME).upload(
                path=path,
                file=audio_bytes,
                file_options={"content-type": "audio/ogg"}
            )
            
            # Get public URL
            public_url = supabase.storage.from_(self.BUCKET_NAME).get_public_url(path)
            
            logger.info(f"Uploaded audio to {public_url}")
            return public_url
            
        except Exception as e:
            logger.error(f"Error uploading audio to storage: {e}")
            return None

    async def upload_sticker(self, sticker_bytes: bytes, filename: str = None) -> str:
        """
        Upload sticker bytes to Supabase Storage and return the public URL.
        """
        try:
            if not filename:
                filename = f"sticker_{uuid.uuid4().hex}.webp"
            
            path = f"stickers/{filename}"
            
            res = supabase.storage.from_(self.BUCKET_NAME).upload(
                path=path,
                file=sticker_bytes,
                file_options={"content-type": "image/webp"}
            )
            
            public_url = supabase.storage.from_(self.BUCKET_NAME).get_public_url(path)
            
            logger.info(f"Uploaded sticker to {public_url}")
            return public_url
            
        except Exception as e:
            logger.error(f"Error uploading sticker to storage: {e}")
            return None

    async def upload_image(self, image_bytes: bytes, filename: str = None) -> str:
        """
        Upload image bytes to Supabase Storage and return the public URL.
        Detects content type from magic bytes (PNG, JPEG, WEBP).
        """
        try:
            if not filename:
                filename = f"image_{uuid.uuid4().hex}.jpg"
            
            # Detect content type from magic bytes
            content_type = self._detect_image_type(image_bytes)
            
            path = f"images/{filename}"
            
            res = supabase.storage.from_(self.BUCKET_NAME).upload(
                path=path,
                file=image_bytes,
                file_options={"content-type": content_type}
            )
            
            public_url = supabase.storage.from_(self.BUCKET_NAME).get_public_url(path)
            
            logger.info(f"Uploaded image to {public_url}")
            return public_url
            
        except Exception as e:
            logger.error(f"Error uploading image to storage: {e}")
            return None

    @staticmethod
    def _detect_image_type(image_bytes: bytes) -> str:
        """
        Detect image MIME type from magic bytes.
        Defaults to image/jpeg if unrecognized (most common on WhatsApp).
        """
        if len(image_bytes) < 12:
            return "image/jpeg"
        
        head = image_bytes[:12]
        
        # PNG: \x89PNG\r\n\x1a\n
        if head[:8] == b'\x89PNG\r\n\x1a\n':
            return "image/png"
        
        # JPEG: \xff\xd8
        if head[:2] == b'\xff\xd8':
            return "image/jpeg"
        
        # WEBP: RIFF....WEBP
        if head[:4] == b'RIFF' and head[8:12] == b'WEBP':
            return "image/webp"
        
        # Default to JPEG (most common on WhatsApp)
        return "image/jpeg"

storage_service = StorageService()
