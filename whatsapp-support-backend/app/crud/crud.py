import logging
from datetime import datetime
from typing import Any, List, Optional, Sequence
from uuid import UUID

from app import database
from app.core.nlp.normalize import normalize_msisdn
from app.database import supabase
from app.models.enums import ChannelType, MessageDirection, SessionStatus
from app.models.models import (
    ApiConfiguration,
    Customer,
    Message,
    Notification,
    Session,
)

logger = logging.getLogger(__name__)


# --- Bank Logic ---
# Allowlist of every field this backend may ever read from Bank_db_oss. The
# bank-side RPC returns exactly these columns; nothing here selects "*".
#
# These are the RPC's OUT parameter names, not raw columns: the bank schema is
# normalised (customers.full_name + accounts.account_number/balance +
# currencies via accounts.currency_id), and the join lives in
# scripts/sql/bank_db_oss_readonly.sql. There is no `iban` in that schema --
# see AccountField in app/core/bank/intents.py.
ACCOUNT_FIELDS: tuple[str, ...] = (
    "owner_name",
    "account_number",
    "balance",
    "currency",
)


async def get_bank_account_fields(phone: str, fields: Sequence[str]) -> Optional[dict]:
    """Read ONLY the requested allowlisted fields for `phone` from Bank_db_oss.

    Goes through the read-only client's single permitted RPC, which returns at
    most one row and cannot be turned into a table scan. Returns None when no
    account matches. Raises BankDbUnavailable when Bank_db_oss is unconfigured
    -- it never falls back to the main (service-role) project.
    """
    unknown = set(fields) - set(ACCOUNT_FIELDS)
    if unknown:
        raise ValueError(f"Not on the bank field allowlist: {sorted(unknown)}")

    client = database.get_bank_db_oss_or_raise()
    response = client.rpc(database.BANK_ACCOUNT_RPC, {"p_phone": normalize_msisdn(phone)}).execute()

    rows = response.data or []
    if not rows:
        return None
    row = rows[0]
    return {f: row[f] for f in fields if f in row}


# --- End Bank Logic ---


async def get_customer_by_phone(db: Any, phone: str) -> Optional[Customer]:
    try:
        response = supabase.table("customers").select("*").eq("phone", phone).execute()
    except Exception as e:
        # Reads degrade to "not found" rather than propagating.
        logger.error(f"Failed to look up customer by phone: {e}")
        return None
    if response.data:
        return Customer(**response.data[0])
    return None


async def create_customer(db: Any, phone: str, name: str) -> Customer:
    data = {"phone": phone, "name": name, "preferred_channel": ChannelType.whatsapp.value}
    try:
        response = supabase.table("customers").insert(data).execute()
    except Exception as e:
        raise Exception(f"Failed to create customer: {e}") from e
    if response.data:
        return Customer(**response.data[0])
    raise Exception("Failed to create customer")


async def get_active_sessions(db: Any) -> List[Session]:
    response = (
        supabase.table("sessions")
        .select("*, customer:customers(*), messages(*)")
        .neq("status", SessionStatus.completed.value)
        .order("updated_at", desc=True)
        .execute()
    )

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
    statuses = [
        SessionStatus.active.value,
        SessionStatus.waiting.value,
        SessionStatus.escalated.value,
    ]
    response = (
        supabase.table("sessions")
        .select("*")
        .eq("customer_id", str(customer_id))
        .in_("status", statuses)
        .order("created_at", desc=True)
        .execute()
    )

    if response.data:
        return Session(**response.data[0])
    return None


async def create_session(db: Any, customer_id: UUID) -> Session:
    data = {
        "customer_id": str(customer_id),
        "channel": ChannelType.whatsapp.value,
        "status": SessionStatus.active.value,
    }
    try:
        response = supabase.table("sessions").insert(data).execute()
    except Exception as e:
        raise Exception(f"Failed to create session: {e}") from e
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

    try:
        response = (
            supabase.table("sessions").update(update_data).eq("id", str(session_id)).execute()
        )
    except Exception as e:
        raise Exception(f"Failed to update session status: {e}") from e
    if response.data:
        return Session(**response.data[0])
    raise Exception("Failed to update session status")


async def update_session_satisfaction(db: Any, session_id: UUID, score: int) -> Session:
    response = (
        supabase.table("sessions")
        .update({"satisfaction_score": score})
        .eq("id", str(session_id))
        .execute()
    )
    if response.data:
        return Session(**response.data[0])
    raise Exception("Failed to update session satisfaction")


async def get_session_main_types(db: Any) -> List[Any]:
    response = supabase.table("session_main_types").select("*").execute()
    return response.data if response.data else []


async def update_session_main_type(db: Any, session_id: UUID, type_id: Optional[UUID]) -> Session:
    response = (
        supabase.table("sessions")
        .update({"main_type_id": str(type_id) if type_id else None})
        .eq("id", str(session_id))
        .execute()
    )
    if response.data:
        return Session(**response.data[0])
    raise Exception("Failed to update session type")


async def create_message(
    db: Any,
    session_id: UUID,
    content: str,
    direction: MessageDirection,
    external_id: Optional[str] = None,
    media_url: Optional[str] = None,
    media_type: Optional[str] = None,
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
                outbound_since = [
                    m
                    for m in msgs
                    if m.direction == MessageDirection.outbound and m.sent_at > last_inbound.sent_at
                ]

                if not outbound_since:
                    # This is the FIRST response to the last inbound, add the gap to Cumulative Wait Time
                    wait_gap = int(
                        (now - last_inbound.sent_at.replace(tzinfo=None)).total_seconds()
                    )
                    session_updates["wait_time_seconds"] = (session.wait_time_seconds or 0) + max(
                        0, wait_gap
                    )

        if session_updates:
            supabase.table("sessions").update(session_updates).eq("id", str(session_id)).execute()

    data = {
        "session_id": str(session_id),
        "content": content,
        "direction": direction.value,
        "channel": ChannelType.whatsapp.value,
        "external_message_id": external_id,
        "media_url": media_url,
        "media_type": media_type,
    }
    try:
        response = supabase.table("messages").insert(data).execute()
    except Exception as e:
        raise Exception(f"Failed to create message: {e}") from e
    if response.data:
        return Message(**response.data[0])
    raise Exception("Failed to create message")


async def get_message_by_external_id(db: Any, external_id: str) -> Optional[Message]:
    response = (
        supabase.table("messages").select("*").eq("external_message_id", external_id).execute()
    )
    if response.data:
        return Message(**response.data[0])
    return None


async def get_messages_for_session(
    db: Any, session_id: UUID, limit: Optional[int] = None
) -> List[Message]:
    query = (
        supabase.table("messages").select("*").eq("session_id", str(session_id)).order("sent_at")
    )

    if limit is not None:
        query = query.limit(limit)

    try:
        response = query.execute()
    except Exception as e:
        # Reads degrade instead of propagating: a transient Supabase error
        logger.error(f"Failed to fetch messages for session {session_id}: {e}")
        return []

    return [Message(**m) for m in response.data]


async def update_message_classification(db: Any, message_id: UUID, classification: str) -> Message:
    response = (
        supabase.table("messages")
        .update({"classification": classification})
        .eq("id", str(message_id))
        .execute()
    )
    if response.data:
        return Message(**response.data[0])
    raise Exception("Failed to update message classification")


async def get_api_config(db: Any, channel: ChannelType) -> Optional[ApiConfiguration]:
    # Prefer the ACTIVE configuration, most recently verified first. Falls back to
    # any config for the channel if none are marked active yet. This avoids the
    # old behaviour of blindly returning row[0], which broke inbound routing when
    # more than one row existed for a channel.
    response = (
        supabase.table("api_configurations")
        .select("*")
        .eq("channel", channel.value)
        .eq("is_active", True)
        .order("last_verified_at", desc=True)
        .execute()
    )

    if not response.data:
        # No active row — fall back to any config for the channel.
        response = (
            supabase.table("api_configurations").select("*").eq("channel", channel.value).execute()
        )

    if response.data:
        return ApiConfiguration(**response.data[0])
    return None


async def create_notification(
    db: Any,
    title: str,
    message: str,
    user_id: Optional[UUID] = None,
    type: str = "escalation",
    action_url: Optional[str] = None,
) -> Notification:
    data = {
        "title": title,
        "message": message,
        "user_id": str(user_id) if user_id else None,
        "type": type,
        "action_url": action_url,
        "is_read": False,
    }
    response = supabase.table("notifications").insert(data).execute()
    if response.data:
        return Notification(**response.data[0])
    raise Exception("Failed to create notification")


async def get_active_employee_user_ids(db: Any) -> List[UUID]:
    # Fetch ALL user_ids from profiles table to be 100% sure we hit the active user
    response = supabase.table("profiles").select("user_id").execute()

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
    response = (
        supabase.table("sessions")
        .select("*")
        .eq("customer_id", str(customer_id))
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )

    if response.data:
        return Session(**response.data[0])
    return None


async def close_inactive_sessions(db: Any, minutes: int = 10, on_close: Optional[Any] = None):
    from datetime import datetime, timedelta, timezone

    # 1. Get all candidates (Active/Waiting/Escalated) that haven't been updated recently
    # We check 'updated_at' first as a rough filter to avoid fetching all sessions
    threshold = (datetime.now(timezone.utc) - timedelta(minutes=minutes)).isoformat()

    response = (
        supabase.table("sessions")
        .select("id, status, updated_at")
        .in_(
            "status",
            [
                SessionStatus.active.value,
                SessionStatus.waiting.value,
                SessionStatus.escalated.value,
            ],
        )
        .lt("updated_at", threshold)
        .execute()
    )

    if not response.data:
        return 0

    closed_count = 0
    for item in response.data:
        session_id = item["id"]

        # 2. Check the LAST message of this session
        msg_response = (
            supabase.table("messages")
            .select("direction, sent_at")
            .eq("session_id", session_id)
            .order("sent_at", desc=True)
            .limit(1)
            .execute()
        )

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
                    if msg_time_str.endswith("Z"):
                        msg_time_str = msg_time_str.replace("Z", "+00:00")
                    msg_time = datetime.fromisoformat(msg_time_str)

                    if (datetime.now(timezone.utc) - msg_time).total_seconds() > minutes * 60:
                        should_close = True
                except Exception as e:
                    logger.warning(
                        f"Error parsing date for session {session_id}: {e}. Skipping auto-close."
                    )
                    should_close = False
        else:
            # No messages? If it's old and empty, maybe close it?
            # Let's assume yes to clean up empty sessions
            should_close = True

        if should_close:
            # 3. Close the session — the UPDATE is conditioned on the status
            # STILL matching what we read in step 1 (`.eq("status", item["status"])`).
            # PostgREST executes this as a single atomic `UPDATE ... WHERE id = ?
            # AND status = ?`, so if an agent replied or escalated the session
            # between the read and this write, the status will no longer match,
            # the row won't be updated, and `update_res.data` comes back empty —
            # closing this time-of-check/time-of-use race without needing an RPC.
            update_res = (
                supabase.table("sessions")
                .update({"status": SessionStatus.completed.value})
                .eq("id", session_id)
                .eq("status", item["status"])
                .execute()
            )

            if update_res.data:
                closed_count += 1
                logger.info(
                    f"Auto-closing session {session_id} (inactive > {minutes} mins after outbound msg)."
                )

                # Execute callback (e.g. for classification)
                if on_close:
                    try:
                        # We use asyncio.create_task to not block the cleanup loop
                        import asyncio

                        asyncio.create_task(on_close(session_id))
                    except Exception as e:
                        logger.error(
                            f"Failed to execute on_close callback for session {session_id}: {e}"
                        )

                # Notify agents of auto-closure
                try:
                    await create_notification(
                        db,
                        title="Session Completed (Auto)",
                        message=f"Session {session_id} closed due to inactivity.",
                        user_id=None,  # Broadcast
                        type="info",
                        action_url=f"/sessions/{session_id}",
                    )
                except Exception as e:
                    logger.error(f"Failed to create auto-close notification: {e}")

    return closed_count


async def delete_old_notifications(db: Any, hours: int = 24):
    from datetime import datetime, timedelta, timezone

    threshold = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()

    response = supabase.table("notifications").delete().lt("created_at", threshold).execute()

    if response.data:
        logger.info(
            f"Automatically deleted {len(response.data)} old notifications (> {hours} hours)."
        )
        return len(response.data)
    return 0


async def get_chat_shortcuts(db: Any, user_id: UUID) -> List[Any]:
    response = (
        supabase.table("chat_shortcuts")
        .select("*")
        .eq("user_id", str(user_id))
        .order("created_at", desc=True)
        .execute()
    )
    return response.data if response.data else []


async def create_chat_shortcut(db: Any, user_id: UUID, title: str, content: str) -> Any:
    data = {"user_id": str(user_id), "title": title, "content": content}
    response = supabase.table("chat_shortcuts").insert(data).execute()
    if response.data:
        return response.data[0]
    raise Exception("Failed to create chat shortcut")


async def update_chat_shortcut(db: Any, shortcut_id: UUID, title: str, content: str) -> Any:
    data = {"title": title, "content": content}
    response = supabase.table("chat_shortcuts").update(data).eq("id", str(shortcut_id)).execute()
    if response.data:
        return response.data[0]
    raise Exception("Failed to update chat shortcut")


async def delete_chat_shortcut(db: Any, shortcut_id: UUID) -> bool:
    response = supabase.table("chat_shortcuts").delete().eq("id", str(shortcut_id)).execute()
    return True if response.data else False
