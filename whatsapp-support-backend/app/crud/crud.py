from app.database import supabase
from app.models.models import Session, Message, Customer, ApiConfiguration, Notification, SessionMainType
from app.models.enums import SessionStatus, ChannelType, MessageDirection
from typing import Optional, List, Any
from uuid import UUID
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

# --- Bank Logic ---
async def get_bank_account(phone: str):
    response = supabase.table("bank_accounts").select("*").eq("phone", phone).execute()
    return response.data[0] if response.data else None

async def create_bank_otp(phone: str, otp: str):
    supabase.table("bank_otps").insert({"phone": phone, "otp": otp}).execute()

async def verify_bank_otp(phone: str, otp: str):
    from datetime import datetime, timedelta, timezone
    limit = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    response = supabase.table("bank_otps")\
        .select("*")\
        .eq("phone", phone)\
        .eq("otp", otp)\
        .gt("created_at", limit)\
        .order("created_at", desc=True)\
        .limit(1)\
        .execute()
    return len(response.data) > 0
# --- End Bank Logic ---


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
    update_data = {"status": status.value}
    
    if status == SessionStatus.completed:
        # Calculate duration when completed
        session = await get_session_by_id(db, session_id)
        if session:
            ended_at = datetime.utcnow()
            duration = int((ended_at - session.started_at.replace(tzinfo=None)).total_seconds())
            update_data["ended_at"] = ended_at.isoformat()
            update_data["duration_seconds"] = duration

    response = supabase.table("sessions")\
        .update(update_data)\
        .eq("id", str(session_id))\
        .execute()
    if response.data:
        return Session(**response.data[0])
    raise Exception("Failed to update session status")

async def update_session_satisfaction(db: Any, session_id: UUID, score: int) -> Session:
    response = supabase.table("sessions")\
        .update({"satisfaction_score": score})\
        .eq("id", str(session_id))\
        .execute()
    if response.data:
        return Session(**response.data[0])
    raise Exception("Failed to update session satisfaction")

async def get_session_main_types(db: Any) -> List[Any]:
    response = supabase.table("session_main_types").select("*").execute()
    return response.data if response.data else []

async def update_session_main_type(db: Any, session_id: UUID, type_id: Optional[UUID]) -> Session:
    response = supabase.table("sessions")\
        .update({"main_type_id": str(type_id) if type_id else None})\
        .eq("id", str(session_id))\
        .execute()
    if response.data:
        return Session(**response.data[0])
    raise Exception("Failed to update session type")


async def create_message(
    db: Any, 
    session_id: UUID, 
    content: str, 
    direction: MessageDirection, 
    external_id: Optional[str] = None
) -> Message:
    now = datetime.utcnow()
    
    # 1. Update Session Metrics Dynamically
    session = await get_session_by_id(db, session_id)
    if session:
        session_updates = {}
        
        # Duration: Total time from start to this message
        duration = int((now - session.started_at.replace(tzinfo=None)).total_seconds())
        session_updates["duration_seconds"] = max(0, duration)
        
        # Wait Time: Sum of gaps between inbound and first response
        if direction == MessageDirection.outbound:
            # Get all messages to find the last inbound
            msgs = await get_messages_for_session(db, session_id)
            inbound_msgs = [m for m in msgs if m.direction == MessageDirection.inbound]
            if inbound_msgs:
                last_inbound = inbound_msgs[-1]
                # Check if we already responded to this specific inbound
                outbound_since = [m for m in msgs if m.direction == MessageDirection.outbound and m.sent_at > last_inbound.sent_at]
                
                if not outbound_since:
                    # This is the FIRST response to the last inbound, add the gap to Cumulative Wait Time
                    wait_gap = int((now - last_inbound.sent_at.replace(tzinfo=None)).total_seconds())
                    session_updates["wait_time_seconds"] = (session.wait_time_seconds or 0) + max(0, wait_gap)
        
        if session_updates:
            supabase.table("sessions")\
                .update(session_updates)\
                .eq("id", str(session_id))\
                .execute()

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

async def update_message_classification(db: Any, message_id: UUID, classification: str) -> Message:
    response = supabase.table("messages")\
        .update({"classification": classification})\
        .eq("id", str(message_id))\
        .execute()
    if response.data:
        return Message(**response.data[0])
    raise Exception("Failed to update message classification")


async def get_api_config(db: Any, channel: ChannelType) -> Optional[ApiConfiguration]:
    response = supabase.table("api_configurations")\
        .select("*")\
        .eq("channel", channel.value)\
        .execute()
    
    if response.data:
        return ApiConfiguration(**response.data[0])
    return None

async def create_notification(
    db: Any,
    title: str,
    message: str,
    user_id: Optional[UUID] = None,
    type: str = "escalation",
    action_url: Optional[str] = None
) -> Notification:
    data = {
        "title": title,
        "message": message,
        "user_id": str(user_id) if user_id else None,
        "type": type,
        "action_url": action_url,
        "is_read": False
    }
    response = supabase.table("notifications").insert(data).execute()
    if response.data:
        return Notification(**response.data[0])
    raise Exception("Failed to create notification")

async def get_active_employee_user_ids(db: Any) -> List[UUID]:
    # Fetch ALL user_ids from profiles table to be 100% sure we hit the active user
    response = supabase.table("profiles")\
        .select("user_id")\
        .execute()
    
    user_ids = []
    for item in response.data:
        if item.get("user_id"):
            try:
                user_ids.append(UUID(item["user_id"]))
            except:
                continue
    
    logger.info(f"Targeting {len(user_ids)} users for notification (all profiles).")
    return user_ids

async def get_last_session_by_customer(db: Any, customer_id: UUID) -> Optional[Session]:
    response = supabase.table("sessions")\
        .select("*")\
        .eq("customer_id", str(customer_id))\
        .order("created_at", desc=True)\
        .limit(1)\
        .execute()
    
    if response.data:
        return Session(**response.data[0])
    return None

async def close_inactive_sessions(db: Any, minutes: int = 10, on_close: Optional[Any] = None):
    from datetime import datetime, timedelta, timezone
    
    # 1. Get all candidates (Active/Waiting/Escalated) that haven't been updated recently
    # We check 'updated_at' first as a rough filter to avoid fetching all sessions
    threshold = (datetime.now(timezone.utc) - timedelta(minutes=minutes)).isoformat()
    
    response = supabase.table("sessions")\
        .select("id, status, updated_at")\
        .in_("status", [SessionStatus.active.value, SessionStatus.waiting.value, SessionStatus.escalated.value])\
        .lt("updated_at", threshold)\
        .execute()
    
    if not response.data:
        return 0
        
    closed_count = 0
    for item in response.data:
        session_id = item["id"]
        
        # 2. Check the LAST message of this session
        msg_response = supabase.table("messages")\
            .select("direction, sent_at")\
            .eq("session_id", session_id)\
            .order("sent_at", desc=True)\
            .limit(1)\
            .execute()
            
        should_close = False
        if msg_response.data:
            last_msg = msg_response.data[0]
            # Key Condition: Last message from Bot/Agent (Outbound)
            if last_msg["direction"] == MessageDirection.outbound.value:
                # Double check time on message to be safe regardless of session updated_at trigger
                # Parse sent_at. Format from supabase is typically ISO 8601 string
                try:
                    msg_time_str = last_msg["sent_at"]
                    # Handle potential 'Z' or offset
                    if msg_time_str.endswith('Z'):
                        msg_time_str = msg_time_str.replace('Z', '+00:00')
                    msg_time = datetime.fromisoformat(msg_time_str)
                    
                    if (datetime.now(timezone.utc) - msg_time).total_seconds() > minutes * 60:
                        should_close = True
                except Exception as e:
                    logger.warning(f"Error parsing date for session {session_id}: {e}. Skipping auto-close.")
                    should_close = False
        else:
            # No messages? If it's old and empty, maybe close it?
            # Let's assume yes to clean up empty sessions
            should_close = True
            
        if should_close:
            # 3. Close the session
            update_res = supabase.table("sessions")\
                .update({"status": SessionStatus.completed.value})\
                .eq("id", session_id)\
                .execute()
            
            if update_res.data:
                closed_count += 1
                logger.info(f"Auto-closing session {session_id} (inactive > {minutes} mins after outbound msg).")
                
                # Execute callback (e.g. for classification)
                if on_close:
                    try:
                        # We use asyncio.create_task to not block the cleanup loop
                        import asyncio
                        asyncio.create_task(on_close(session_id))
                    except Exception as e:
                        logger.error(f"Failed to execute on_close callback for session {session_id}: {e}")

                # Notify agents of auto-closure
                try:
                    await create_notification(
                        db,
                        title="Session Completed (Auto)",
                        message=f"Session {session_id} closed due to inactivity.",
                        user_id=None, # Broadcast
                        type="info",
                        action_url=f"/sessions/{session_id}"
                    )
                except Exception as e:
                    logger.error(f"Failed to create auto-close notification: {e}")
    
    return closed_count

async def delete_old_notifications(db: Any, hours: int = 24):
    from datetime import datetime, timedelta, timezone
    
    threshold = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
    
    response = supabase.table("notifications")\
        .delete()\
        .lt("created_at", threshold)\
        .execute()
        
    if response.data:
        logger.info(f"Automatically deleted {len(response.data)} old notifications (> {hours} hours).")
        return len(response.data)
    return 0

async def get_chat_shortcuts(db: Any, user_id: UUID) -> List[Any]:
    response = supabase.table("chat_shortcuts")\
        .select("*")\
        .eq("user_id", str(user_id))\
        .order("created_at", desc=True)\
        .execute()
    return response.data if response.data else []

async def create_chat_shortcut(db: Any, user_id: UUID, title: str, content: str) -> Any:
    data = {
        "user_id": str(user_id),
        "title": title,
        "content": content
    }
    response = supabase.table("chat_shortcuts").insert(data).execute()
    if response.data:
        return response.data[0]
    raise Exception("Failed to create chat shortcut")

async def update_chat_shortcut(db: Any, shortcut_id: UUID, title: str, content: str) -> Any:
    data = {
        "title": title,
        "content": content
    }
    response = supabase.table("chat_shortcuts").update(data).eq("id", str(shortcut_id)).execute()
    if response.data:
        return response.data[0]
    raise Exception("Failed to update chat shortcut")

async def delete_chat_shortcut(db: Any, shortcut_id: UUID) -> bool:
    response = supabase.table("chat_shortcuts").delete().eq("id", str(shortcut_id)).execute()
    return True if response.data else False
