# -*- coding: utf-8 -*-
"""
Vision AI Service - analyzes images sent via WhatsApp using multimodal LLM.

Handles image analysis for bank receipts, cards, documents, errors, etc.
Uses OpenRouter/DeepSeek with vision-capable models (Gemini, GPT-4V, Claude).
"""
import base64
import logging
from typing import Optional, List

import httpx

from app.core.config import settings
from app.core.llm import llm_service, USE_DEEPSEEK
from app.core.pii import redact_pii

logger = logging.getLogger(__name__)


class VisionService:
    """
    Vision AI service for analyzing images sent via WhatsApp.
    
    Follows the same pattern as STT service but for image analysis.
    """
    
    def __init__(self):
        self.enabled = settings.VISION_ENABLED
        self.model = settings.VISION_MODEL
        self.max_size_bytes = settings.VISION_MAX_IMAGE_SIZE_MB * 1024 * 1024
        self.supported_types = settings.VISION_SUPPORTED_TYPES
        self.timeout = settings.VISION_TIMEOUT

    @staticmethod
    def _detect_mime_type(image_bytes: bytes) -> str:
        """
        Detect image MIME type from magic bytes.
        Defaults to image/jpeg if unrecognized.
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
        
        return "image/jpeg"

    @staticmethod
    def _bytes_to_data_url(image_bytes: bytes, mime_type: str) -> str:
        """
        Convert raw image bytes to a base64 data URL.
        
        Format: data:{mime};base64,{encoded_data}
        """
        encoded = base64.b64encode(image_bytes).decode('utf-8')
        return f"data:{mime_type};base64,{encoded}"

    async def analyse_image(
        self,
        image_bytes: bytes,
        user_text: Optional[str] = None,
        history: Optional[List[dict]] = None,
        session_types: Optional[List[dict]] = None,
        current_type_id: Optional[str] = None
    ) -> str:
        """
        Analyze an image using a vision-capable LLM model.
        
        Args:
            image_bytes: Raw image data
            user_text: Optional caption text from the customer
            history: Conversation history for context
            session_types: Session types for classification
            current_type_id: Current session type ID
            
        Returns:
            AI response string, or friendly fallback message on error
        """
        # Check if vision is enabled
        if not self.enabled:
            return "نعتذر، خدمة تحليل الصور غير مفعّلة حالياً. هل يمكنك وصف ما تحتاجه؟"
        
        # Validate image bytes
        if not image_bytes or len(image_bytes) == 0:
            logger.error("Vision service called with empty image bytes")
            return "نعتذر، لم نتمكن من استلام الصورة. هل يمكنك إعادة إرسالها؟"
        
        # Check size limit
        if len(image_bytes) > self.max_size_bytes:
            size_mb = len(image_bytes) / (1024 * 1024)
            logger.warning(f"Image too large: {size_mb:.2f} MB (max: {settings.VISION_MAX_IMAGE_SIZE_MB} MB)")
            return f"نعتذر، حجم الصورة كبير جداً ({size_mb:.1f} ميجابايت). الحد الأقصى هو {settings.VISION_MAX_IMAGE_SIZE_MB} ميجابايت. هل يمكنك إرسال صورة أصغر؟"
        
        # Detect MIME type
        mime_type = self._detect_mime_type(image_bytes)
        
        # Validate supported type
        if mime_type not in self.supported_types:
            logger.warning(f"Unsupported image type: {mime_type}")
            return f"نعتذر، لا ندعم هذا النوع من الصور ({mime_type}). الصور المدعومة: JPEG, PNG, WEBP."
        
        try:
            # Convert to base64 data URL
            data_url = self._bytes_to_data_url(image_bytes, mime_type)
            
            # Build dynamic system prompt with vision instructions
            from app.core.system_prompt import SYSTEM_PROMPT
            
            vision_instructions = """

## 4. تحليل الصور

عندما يرسل العميل صورة عبر واتساب، التزمي بالقواعد التالية بدقة:

1. **الصور المقبولة فقط**: الصور المتعلقة بالخدمات المصرفية (الإيصالات)، رسائل الخطأ في التطبيق، أو الوثائق الرسمية (الهوية).
2. **منع الوصف نهائياً**: ممنوع منعاً باتاً وصف محتوى الصورة للعميل (لا تقولي "أرى في الصورة...").
3. **طريقة الرد**:
   - إذا كانت الصورة **تتعلق بمعاملة أو وثيقة رسمية**: اسألي العميل مباشرة: "كيف يمكنني مساعدتك بخصوص هذه المعاملة/الوثيقة؟"
   - إذا كانت الصورة **تحتوي على رسالة خطأ**: ساعدي العميل في فهم الخطأ واسأليه عن المشكلة التي تواجهه ليتم حلها.
   - إذا كانت الصورة **لا تتعلق بالبنك**: اعتذري بلطف وأخبريه أنك تعالجين المعاملات البنكية فقط، واسأليه: "كيف يمكنني مساعدتك اليوم؟"
4. **حماية البيانات**: إذا كانت الصورة تحتوي على بطاقة بنكية، حذري العميل من مشاركة أرقام البطاقة ولا تعيدي كتابة أي بيانات حساسة.
"""
            
            # SECURITY: the WhatsApp caption is attacker-controlled and used to
            # reach the prompt without ever passing the text path's checks.
            if user_text:
                user_text = llm_service.sanitize_input(user_text)
                if llm_service.detect_injection(user_text):
                    logger.warning(
                        "BLOCKED: prompt injection detected in image caption: "
                        + redact_pii(user_text)[:200]
                    )
                    return (
                        "\u0639\u0630\u0631\u0627\u064b\u060c \u0644\u0627 \u064a\u0645\u0643\u0646\u0646\u064a \u062a\u0646\u0641\u064a\u0630 \u0647\u0630\u0627 \u0627\u0644\u0637\u0644\u0628. "
                        "\u0643\u064a\u0641 \u064a\u0645\u0643\u0646\u0646\u064a \u0645\u0633\u0627\u0639\u062f\u062a\u0643 \u0641\u064a \u0627\u0633\u062a\u0641\u0633\u0627\u0631\u0627\u062a\u0643 \u0627\u0644\u0628\u0646\u0643\u064a\u0629\u061f"
                    )

            nonce = llm_service._new_nonce()
            dynamic_prompt = SYSTEM_PROMPT + vision_instructions
            
            # If user sent a caption, try to find context from knowledge base
            if user_text:
                context = llm_service._find_context(user_text)
                if context:
                    # `_find_context` already emits its own "===" header; the
                    # second wrapper here was double-heading it. Fenced instead,
                    # so scraped page text cannot imitate a section delimiter.
                    dynamic_prompt += "\n\n" + llm_service.fence(
                        context, nonce, "knowledge"
                    ) + "\n"
            
            # Build messages array in OpenAI multimodal format
            messages = [
                {"role": "system", "content": dynamic_prompt}
            ]
            
            # Add history if provided (last 10 messages for context)
            if history:
                recent_history = history[-10:] if len(history) > 10 else history
                for msg in recent_history:
                    role = "assistant" if msg.direction.value == "outbound" else "user"
                    messages.append({
                        "role": role,
                        "content": msg.content or ""
                    })
            
            # Build multimodal user message
            user_content = []
            
            # Add image
            user_content.append({
                "type": "image_url",
                "image_url": {"url": data_url}
            })
            
            # Add text (caption or default)
            if user_text:
                # Caption is untrusted: fence it like any other customer text.
                text = llm_service.fence(user_text, nonce, "user_input")
            else:
                text = "هذه صورة مرفقة. الرجاء فحصها حسب تعليمات تحليل الصور والرد مباشرة."
            user_content.append({
                "type": "text",
                "text": text
            })
            
            messages.append({
                "role": "user",
                "content": user_content
            })
            
            # Call LLM with extended timeout for vision
            # Build payload with vision model (OpenRouter format with models array for fallback)
            payload = {
                "model": self.model,  # Vision model
                "messages": messages,
                "max_tokens": 1024
            }
            
            # For OpenRouter, we can use a models array for fallback
            # But for vision, we need a model that supports images
            # DeepSeek does not natively support OpenAI's multimodal vision JSON format yet.
            # We must force OpenRouter for image analysis so it can use Gemini or GPT-4o.
            
            response = await llm_service._chat_completion(
                payload=payload,
                timeout=self.timeout,
                force_openrouter=True
            )
            
            # Extract response text
            if response and 'choices' in response and len(response['choices']) > 0:
                raw_content = response['choices'][0]['message'].get('content', '')
                sanitized = llm_service.sanitize_output(raw_content)
                return sanitized
            else:
                logger.error(f"Vision API returned unexpected response: {response}")
                return "نعتذر، لم نتمكن من تحليل الصورة حالياً. هل يمكنك وصف ما تحتاجه، أو إعادة إرسالها؟"
            
        except httpx.TimeoutException:
            logger.error("Vision API timeout")
            return "نعتذر، استغرق تحليل الصورة وقتاً طويلاً. هل يمكنك وصف ما تحتاجه، أو إعادة إرسال الصورة؟"
        
        except Exception as e:
            logger.error(f"Vision analysis error: {e}", exc_info=True)
            return "نعتذر، لم نتمكن من تحليل الصورة حالياً. هل يمكنك وصف ما تحتاجه، أو إعادة إرسالها؟"


# Module-level singleton
vision_service = VisionService()
