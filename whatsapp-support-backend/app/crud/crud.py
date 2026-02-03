from app.database import supabase
from app.models.models import Session, Message, Customer, ApiConfiguration
from app.models.enums import SessionStatus, ChannelType, MessageDirection
from typing import Optional, List, Any
from uuid import UUID
import logging

logger = logging.getLogger(__name__)

async def get_customer_by_phone(db: Any, phone: str) -> Optional[Customer]:
    response = supabase.table("customers").select("*").eq("phone", phone).execute()
    if response.data:
        return Customer(**response.data[0])
    return None

async def create_customer(db: Any, phone: str, name: str) -> Customer:
    data = {
        "phone": phone,
        "name": name,
        "preferred_channel": ChannelType.whatsapp.value
    }
    response = supabase.table("customers").insert(data).execute()
    if response.data:
        return Customer(**response.data[0])
    raise Exception("Failed to create customer")

async def get_active_sessions(db: Any) -> List[Session]:
    response = supabase.table("sessions")\
        .select("*, customer:customers(*), messages(*)")\
        .neq("status", SessionStatus.completed.value)\
        .order("updated_at", desc=True)\
        .execute()
    
    sessions = []
    for item in response.data:
        sessions.append(Session(**item))
    return sessions

async def get_session_by_id(db: Any, session_id: UUID) -> Optional[Session]:
    response = supabase.table("sessions").select("*").eq("id", str(session_id)).execute()
    if response.data:
        return Session(**response.data[0])
    return None

async def get_active_session_by_customer(db: Any, customer_id: UUID) -> Optional[Session]:
    statuses = [SessionStatus.active.value, SessionStatus.waiting.value, SessionStatus.escalated.value]
    response = supabase.table("sessions")\
        .select("*")\
        .eq("customer_id", str(customer_id))\
        .in_("status", statuses)\
        .order("created_at", desc=True)\
        .execute()
    
    if response.data:
        return Session(**response.data[0])
    return None

async def create_session(db: Any, customer_id: UUID) -> Session:
    data = {
        "customer_id": str(customer_id),
        "channel": ChannelType.whatsapp.value,
        "status": SessionStatus.active.value
    }
    response = supabase.table("sessions").insert(data).execute()
    if response.data:
        return Session(**response.data[0])
    raise Exception("Failed to create session")

async def update_session_status(db: Any, session_id: UUID, status: SessionStatus) -> Session:
    response = supabase.table("sessions")\
        .update({"status": status.value})\
        .eq("id", str(session_id))\
        .execute()
    if response.data:
        return Session(**response.data[0])
    raise Exception("Failed to update session")

async def create_message(
    db: Any, 
    session_id: UUID, 
    content: str, 
    direction: MessageDirection, 
    external_id: Optional[str] = None
) -> Message:
    data = {
        "session_id": str(session_id),
        "content": content,
        "direction": direction.value,
        "channel": ChannelType.whatsapp.value,
        "external_message_id": external_id
    }
    response = supabase.table("messages").insert(data).execute()
    if response.data:
        return Message(**response.data[0])
    raise Exception("Failed to create message")

async def get_messages_for_session(db: Any, session_id: UUID) -> List[Message]:
    response = supabase.table("messages")\
        .select("*")\
        .eq("session_id", str(session_id))\
        .order("sent_at")\
        .execute()
    
    return [Message(**m) for m in response.data]

async def get_api_config(db: Any, channel: ChannelType) -> Optional[ApiConfiguration]:
    response = supabase.table("api_configurations")\
        .select("*")\
        .eq("channel", channel.value)\
        .execute()
    
    if response.data:
        return ApiConfiguration(**response.data[0])
    return None
