from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, Field

from app.models.enums import ChannelType, MessageDirection, SessionStatus


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
    main_type_id: Optional[UUID] = None
    external_conversation_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)

    # Relationships (optional in Pydantic)
    customer: Optional[Customer] = None
    messages: List["Message"] = []


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
    classification: Optional[str] = None
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


class SessionMainType(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    name: str
    parent_category: Optional[str] = None
    description: Optional[str] = None
    ai_prompt: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.now)


class Complaint(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    reference_number: str
    session_id: Optional[UUID] = None
    customer_id: Optional[UUID] = None
    channel: ChannelType
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    # Masked before it ever reaches this model -- see crud.create_complaint.
    national_id_masked: Optional[str] = None
    category: str
    description: str
    related_account_masked: Optional[str] = None
    preferred_contact: Optional[str] = None
    language: str = "ar"
    status: str = "new"

    # Triage fields (migration 20260822000000). Read out of the customer's own
    # message by app/core/triage rather than asked for slot by slot.
    # `severity` defaults to "medium" to match the column default: rows written
    # before triage existed are complaints of unknown urgency, and unknown must
    # not read as "low".
    severity: str = "medium"
    location: Optional[str] = None
    atm_identifier: Optional[str] = None
    # The customer's own phrase ("من ساعة", "أمس"), not a parsed instant.
    incident_at_text: Optional[str] = None
    ai_summary: Optional[str] = None
    intent: Optional[str] = None
    assigned_to: Optional[UUID] = None
    escalated_session_id: Optional[UUID] = None

    context: Dict[str, Any] = {}
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)


class ChatShortcut(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    user_id: UUID
    title: str
    content: str
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)


# Re-resolve forward refs
Session.model_rebuild()
