from pydantic import BaseModel, Field
from typing import Optional, List, Any, Dict
from uuid import UUID, uuid4
from datetime import datetime
from app.models.enums import ChannelType, SessionStatus, MessageDirection

class Customer(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    external_id: Optional[str] = None
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    channel_identifier: Optional[str] = None
    preferred_channel: Optional[ChannelType] = None
    metadata: Dict[str, Any] = {}
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

class Employee(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    profile_id: Optional[UUID] = None
    employee_code: Optional[str] = None
    department: Optional[str] = None
    assigned_channels: List[ChannelType] = []
    is_active: bool = True
    performance_score: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

class Session(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    customer_id: Optional[UUID] = None
    employee_id: Optional[UUID] = None
    channel: ChannelType
    status: SessionStatus = SessionStatus.waiting
    started_at: datetime = Field(default_factory=datetime.now)
    ended_at: Optional[datetime] = None
    wait_time_seconds: Optional[int] = None
    duration_seconds: Optional[int] = None
    satisfaction_score: Optional[int] = None
    escalated_to: Optional[UUID] = None
    resolution_notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    
    # Relationships (optional in Pydantic)
    customer: Optional[Customer] = None
    messages: List['Message'] = []

class Message(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    session_id: Optional[UUID] = None
    direction: MessageDirection
    content: Optional[str] = None
    media_url: Optional[str] = None
    media_type: Optional[str] = None
    channel: ChannelType
    external_message_id: Optional[str] = None
    sent_at: datetime = Field(default_factory=datetime.now)
    delivered_at: Optional[datetime] = None
    read_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.now)

class ApiConfiguration(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    channel: ChannelType
    api_key_encrypted: Optional[str] = None
    api_secret_encrypted: Optional[str] = None
    webhook_url: Optional[str] = None
    phone_number_id: Optional[str] = None
    business_account_id: Optional[str] = None
    access_token_encrypted: Optional[str] = None
    is_active: bool = False
    last_verified_at: Optional[datetime] = None
    config_metadata: Dict[str, Any] = {}
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

class Notification(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    user_id: Optional[UUID] = None
    title: str
    message: Optional[str] = None
    is_read: bool = False
    type: Optional[str] = None
    action_url: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.now)

# Re-resolve forward refs
Session.model_rebuild()
