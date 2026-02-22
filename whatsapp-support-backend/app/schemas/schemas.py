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
    channel: str
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_email: Optional[str] = None
    employee_id: Optional[UUID] = None
    employee_name: Optional[str] = None
    last_message: Optional[str] = None
    status: SessionStatus
    started_at: datetime
    wait_time_seconds: Optional[int] = None
    duration_seconds: Optional[int] = None
    satisfaction_score: Optional[int] = None
    main_type_id: Optional[UUID] = None

    class Config:
        from_attributes = True

class UpdateSessionRequest(BaseModel):
    main_type_id: Optional[UUID] = None
    status: Optional[SessionStatus] = None
    satisfaction_score: Optional[int] = None
