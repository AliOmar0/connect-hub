from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from uuid import UUID
from app.models.enums import SessionStatus, MessageDirection

class SendMessageRequest(BaseModel):
    text: str

class MessageResponse(BaseModel):
    id: UUID
    direction: MessageDirection
    content: Optional[str] = None
    sent_at: datetime
    
    class Config:
        from_attributes = True

class SessionResponse(BaseModel):
    id: UUID
    customer_name: Optional[str] = None
    last_message: Optional[str] = None
    status: SessionStatus
    started_at: datetime
    
    class Config:
        from_attributes = True
