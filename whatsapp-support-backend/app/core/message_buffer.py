"""
Message Buffer System - Prevents Duplicate AI Submissions

When a customer sends multiple messages quickly (split across several WhatsApp messages),
this system collects them into a buffer and waits for the customer to finish typing.

Logic:
1. Each incoming message is saved to the DB immediately (for real-time dashboard display).
2. Instead of triggering AI immediately, the message is added to a per-session buffer.
3. A timer starts (or resets if already running) for that session.
4. If the customer is typing rapidly (messages < 5s apart), we detect "active typing"
   and use a shorter 15s wait. Otherwise, we use the full 30s.
5. When the timer expires (customer stopped typing), ALL buffered messages
   are combined into a single AI request.
6. A lock prevents duplicate AI processing for the same session.
7. Typing state is tracked per session and exposed via API for dashboard display.
"""

import asyncio
import logging
from typing import Dict, List, Optional, Callable, Any
from uuid import UUID
from dataclasses import dataclass, field
from datetime import datetime

logger = logging.getLogger("message_buffer")

# Buffer wait times in seconds
BUFFER_WAIT_SECONDS = 30        # Default wait when message cadence is slow (1 message, or slow typist)
RAPID_TYPING_WAIT_SECONDS = 15  # Shorter wait when rapid typing is detected (faster AI response)
RAPID_TYPING_THRESHOLD = 5      # If messages arrive within this many seconds, it's rapid typing


@dataclass
class BufferedMessage:
    """A single buffered message waiting to be sent to AI."""
    content: str
    message_id: Optional[str] = None       # WhatsApp message ID
    db_message_id: Optional[UUID] = None   # Database message ID
    timestamp: datetime = field(default_factory=datetime.utcnow)


@dataclass
class SessionBuffer:
    """Buffer state for a single session."""
    messages: List[BufferedMessage] = field(default_factory=list)
    timer_task: Optional[asyncio.Task] = None
    is_processing: bool = False  # Lock to prevent duplicate AI calls
    customer_phone: str = ""
    config: dict = field(default_factory=dict)
    last_message_time: Optional[datetime] = None
    is_typing: bool = False      # Whether customer is actively typing
    typing_started_at: Optional[datetime] = None  # When typing was first detected
    rapid_typing_detected: bool = False  # Whether rapid typing pattern was detected


class MessageBufferService:
    """
    Manages message buffering per session to prevent duplicate AI submissions.
    
    Flow:
    - add_message() is called for each incoming message
    - Messages are collected in a per-session buffer
    - A timer resets with each new message (debounce pattern)
    - After BUFFER_WAIT_SECONDS of silence, all messages are combined and sent to AI
    """

    def __init__(self):
        self._buffers: Dict[str, SessionBuffer] = {}
        self._ai_callback: Optional[Callable] = None

    def set_ai_callback(self, callback: Callable):
        """
        Set the callback function that processes AI responses.
        This is called when the buffer timer expires.
        
        Expected signature:
            async def callback(session_id, combined_message, customer_phone, config, message_id, db_message_id)
        """
        self._ai_callback = callback

    async def add_message(
        self,
        session_id: UUID,
        content: str,
        customer_phone: str,
        config: dict,
        message_id: Optional[str] = None,
        db_message_id: Optional[UUID] = None,
    ):
        """
        Add a message to the session buffer.
        Resets the timer each time a new message arrives (debounce).
        Detects rapid typing patterns to optimize wait time.
        """
        key = str(session_id)
        now = datetime.utcnow()

        # Create buffer if it doesn't exist
        if key not in self._buffers:
            self._buffers[key] = SessionBuffer(
                customer_phone=customer_phone,
                config=config,
            )

        buffer = self._buffers[key]

        # If already processing an AI response, don't add more messages to the current batch.
        # Instead, start a new buffer cycle.
        if buffer.is_processing:
            logger.info(
                f"[Buffer] Session {key}: AI is currently processing. "
                f"Starting new buffer cycle for message: {content[:50]}..."
            )
            # Create a fresh buffer for the next batch
            self._buffers[key] = SessionBuffer(
                customer_phone=customer_phone,
                config=config,
            )
            buffer = self._buffers[key]

        # ---- Typing Detection ----
        # Check if this message arrived rapidly after the previous one
        if buffer.last_message_time:
            gap_seconds = (now - buffer.last_message_time).total_seconds()
            if gap_seconds < RAPID_TYPING_THRESHOLD:
                buffer.rapid_typing_detected = True
                logger.info(
                    f"[Buffer] Session {key}: Rapid typing detected! "
                    f"Gap: {gap_seconds:.1f}s (threshold: {RAPID_TYPING_THRESHOLD}s)"
                )

        # Mark customer as typing
        buffer.is_typing = True
        if not buffer.typing_started_at:
            buffer.typing_started_at = now

        # Add message to buffer
        buffered_msg = BufferedMessage(
            content=content,
            message_id=message_id,
            db_message_id=db_message_id,
        )
        buffer.messages.append(buffered_msg)
        buffer.customer_phone = customer_phone
        buffer.config = config
        buffer.last_message_time = now

        # Determine wait time based on typing pattern
        if buffer.rapid_typing_detected:
            wait_seconds = RAPID_TYPING_WAIT_SECONDS
        else:
            wait_seconds = BUFFER_WAIT_SECONDS

        msg_count = len(buffer.messages)
        logger.info(
            f"[Buffer] Session {key}: Message #{msg_count} buffered. "
            f"Content: '{content[:50]}...'. "
            f"Timer will {'reset' if buffer.timer_task else 'start'} ({wait_seconds}s). "
            f"Rapid typing: {buffer.rapid_typing_detected}"
        )

        # Cancel existing timer (reset the debounce)
        if buffer.timer_task and not buffer.timer_task.done():
            buffer.timer_task.cancel()
            try:
                await buffer.timer_task
            except asyncio.CancelledError:
                pass
            logger.info(f"[Buffer] Session {key}: Timer reset (customer still typing)")

        # Start new timer with appropriate wait time
        buffer.timer_task = asyncio.create_task(
            self._timer_expired(key, wait_seconds)
        )

    async def _timer_expired(self, session_key: str, wait_seconds: int = BUFFER_WAIT_SECONDS):
        """
        Called after wait_seconds of no new messages.
        Combines all buffered messages and triggers AI processing.
        """
        try:
            # Wait for the buffer period
            await asyncio.sleep(wait_seconds)
        except asyncio.CancelledError:
            # Timer was reset because a new message arrived
            return

        buffer = self._buffers.get(session_key)
        if not buffer or not buffer.messages:
            logger.warning(f"[Buffer] Session {session_key}: Timer expired but no messages found")
            return

        if buffer.is_processing:
            logger.warning(
                f"[Buffer] Session {session_key}: Timer expired but AI is already processing. Skipping."
            )
            return

        # Lock processing and mark typing as finished
        buffer.is_processing = True
        buffer.is_typing = False

        try:
            # Combine all buffered messages into one
            messages = buffer.messages.copy()
            combined_content = self._combine_messages(messages)
            
            # Use the last message's IDs for reference
            last_msg = messages[-1]
            first_msg = messages[0]

            msg_count = len(messages)
            logger.info(
                f"[Buffer] Session {session_key}: Timer expired! "
                f"Combining {msg_count} message(s) into single AI request. "
                f"Combined: '{combined_content[:100]}...'"
            )

            # Clear the buffer BEFORE processing (new messages during AI processing 
            # will start a new buffer cycle)
            buffer.messages.clear()

            # Call the AI processing callback
            if self._ai_callback:
                asyncio.create_task(
                    self._run_callback(
                        self._ai_callback, 
                        session_key, 
                        buffer,
                        UUID(session_key),
                        combined_content,
                        buffer.customer_phone,
                        buffer.config,
                        last_msg.message_id,
                        first_msg.db_message_id,
                    )
                )
            else:
                logger.error(f"[Buffer] Session {session_key}: No AI callback set!")

        except Exception as e:
            logger.error(f"[Buffer] Session {session_key}: Error during AI processing: {e}")
            # Unlock processing on error
            buffer.is_processing = False
            buffer.rapid_typing_detected = False
            buffer.typing_started_at = None

    async def _run_callback(self, callback, session_key, buffer_obj, *args):
        try:
            await callback(*args)
        finally:
            # Clean up buffer after processing ONLY IF it's the same buffer
            # (a new buffer might have been created if messages arrived while processing)
            current_buffer = self._buffers.get(session_key)
            if current_buffer is buffer_obj:
                del self._buffers[session_key]
                logger.info(f"[Buffer] Session {session_key}: Buffer cleared after processing.")
            else:
                logger.info(f"[Buffer] Session {session_key}: Buffer was replaced during processing, leaving new buffer intact.")

    def _combine_messages(self, messages: List[BufferedMessage]) -> str:
        """
        Combine multiple messages into a single text.
        If there's only one message, return it as-is.
        If multiple, join them with newlines to preserve context.
        """
        if len(messages) == 1:
            return messages[0].content

        # Join multiple messages with newlines
        combined = "\n".join(msg.content for msg in messages)
        return combined

    def get_buffer_status(self, session_id: UUID) -> dict:
        """Get the current buffer status for a session (useful for debugging)."""
        key = str(session_id)
        buffer = self._buffers.get(key)
        if not buffer:
            return {"buffered": False, "count": 0, "is_processing": False, "is_typing": False}

        return {
            "buffered": True,
            "count": len(buffer.messages),
            "is_processing": buffer.is_processing,
            "is_typing": buffer.is_typing,
            "rapid_typing": buffer.rapid_typing_detected,
            "last_message_time": buffer.last_message_time.isoformat() if buffer.last_message_time else None,
            "typing_started_at": buffer.typing_started_at.isoformat() if buffer.typing_started_at else None,
            "timer_active": buffer.timer_task is not None and not buffer.timer_task.done(),
        }

    def get_typing_status(self, session_id: UUID) -> dict:
        """
        Get customer typing status for a session.
        Used by the frontend to show 'customer is typing...' indicator.
        """
        key = str(session_id)
        buffer = self._buffers.get(key)
        if not buffer:
            return {"is_typing": False, "buffered_count": 0}

        return {
            "is_typing": buffer.is_typing,
            "buffered_count": len(buffer.messages),
            "is_processing": buffer.is_processing,
            "rapid_typing": buffer.rapid_typing_detected,
            "typing_started_at": buffer.typing_started_at.isoformat() if buffer.typing_started_at else None,
        }

    def get_all_typing_sessions(self) -> dict:
        """
        Get all sessions where customers are currently typing.
        Used by the frontend to poll for typing indicators across all sessions.
        """
        typing_sessions = {}
        for key, buffer in self._buffers.items():
            if buffer.is_typing or buffer.is_processing:
                typing_sessions[key] = {
                    "is_typing": buffer.is_typing,
                    "buffered_count": len(buffer.messages),
                    "is_processing": buffer.is_processing,
                }
        return typing_sessions

    def is_session_buffering(self, session_id: UUID) -> bool:
        """Check if a session currently has messages being buffered."""
        key = str(session_id)
        buffer = self._buffers.get(key)
        return buffer is not None and (len(buffer.messages) > 0 or buffer.is_processing)

    def clear_session_buffer(self, session_id: UUID):
        """Force clear a session's buffer (e.g., when session is escalated)."""
        key = str(session_id)
        buffer = self._buffers.pop(key, None)
        if buffer and buffer.timer_task and not buffer.timer_task.done():
            buffer.timer_task.cancel()
        logger.info(f"[Buffer] Session {key}: Buffer force-cleared")


# Singleton instance
message_buffer = MessageBufferService()
