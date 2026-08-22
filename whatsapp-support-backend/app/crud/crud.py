import logging
import secrets
from datetime import datetime
from typing import Any, List, Optional, Sequence
from uuid import UUID

from app import database
from app.core.nlp.normalize import mask_identifier, normalize_msisdn
from app.database import supabase
from app.models.enums import ChannelType, MessageDirection, SessionStatus
from app.models.models import (
    ApiConfiguration,
    Complaint,
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
    "available_balance",
    "currency",
    "account_type",
    "account_status",
    "transactions",
    "cards",
    "loans",
)

# The three list-valued fields. Each has its own RPC returning many rows, so
# they cannot be read from the profile row -- see the dispatcher below and
# scripts/sql/bank_db_oss_account_details.sql.
_SECTION_RPCS: dict[str, str] = {
    "transactions": database.BANK_TRANSACTIONS_RPC,
    "cards": database.BANK_CARDS_RPC,
    "loans": database.BANK_LOANS_RPC,
}

# How many rows a section may return to the customer. The bank-side function
# clamps this too (a caller asking for 5000 gets 10); this is the product-level
# number, and the smaller of the two wins.
RECENT_TRANSACTIONS_LIMIT = 5


async def get_bank_account_fields(phone: str, fields: Sequence[str]) -> Optional[dict]:
    """Read ONLY the requested allowlisted fields for `phone` from Bank_db_oss.

    Scalar fields come from one profile RPC; each requested list section costs
    one further RPC, and sections are fetched ONLY when asked for -- a balance
    question must not pull the customer's whole card and financing history.

    Every RPC returns a bounded row set and none of them can be turned into a
    table scan. Returns None when no account matches. Raises BankDbUnavailable
    when Bank_db_oss is unconfigured -- it never falls back to the main
    (service-role) project.
    """
    unknown = set(fields) - set(ACCOUNT_FIELDS)
    if unknown:
        raise ValueError(f"Not on the bank field allowlist: {sorted(unknown)}")

    client = database.get_bank_db_oss_or_raise()
    p_phone = normalize_msisdn(phone)

    # The profile call always runs: it is what establishes that an account
    # exists at all, and every reply carries owner_name from it.
    response = client.rpc(database.BANK_ACCOUNT_PROFILE_RPC, {"p_phone": p_phone}).execute()
    rows = response.data or []
    if not rows:
        return None

    row = rows[0]
    result = {f: row[f] for f in fields if f in row}

    for field in fields:
        rpc_name = _SECTION_RPCS.get(field)
        if rpc_name is None:
            continue
        params: dict = {"p_phone": p_phone}
        if field == "transactions":
            params["p_limit"] = RECENT_TRANSACTIONS_LIMIT
        section = client.rpc(rpc_name, params).execute()
        # An empty section is a real answer ("you have no cards on file"), not a
        # missing one -- the renderer says so rather than falling silent.
        result[field] = section.data or []

    return result


async def get_bank_customer_phone_by_identity(full_name: str, national_id: str) -> Optional[str]:
    """Resolve a customer-stated (full_name, national_id) pair to their phone-on-file.

    Backs the identity-first verification flow: the OTP goes to whatever phone
    Bank_db_oss has on record, not necessarily the number the customer is
    chatting from. Returns None on no match -- caller must not distinguish
    "wrong name" from "wrong national ID" in its reply, or this becomes an
    enumeration oracle for national ID numbers.

    Raises BankDbUnavailable when Bank_db_oss is unconfigured, same as
    get_bank_account_fields.
    """
    client = database.get_bank_db_oss_or_raise()
    response = client.rpc(
        database.BANK_IDENTITY_RPC,
        {"p_full_name": full_name, "p_national_id": national_id},
    ).execute()

    rows = response.data or []
    if not rows:
        return None
    return rows[0].get("phone") or None


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


async def create_customer(
    db: Any, phone: str, name: str, channel: ChannelType = ChannelType.whatsapp
) -> Customer:
    data = {"phone": phone, "name": name, "preferred_channel": channel.value}
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


async def get_session_by_external_conversation_id(
    db: Any, conversation_id: str
) -> Optional[Session]:
    """Durable lookup for the ElevenLabs post-call webhook (see scripts/sql/
    sessions_add_external_conversation_id.sql). Deliberately DB-backed, not
    in-memory: the webhook may land on a different process/replica than the
    one that handled the call."""
    response = (
        supabase.table("sessions")
        .select("*")
        .eq("external_conversation_id", conversation_id)
        .execute()
    )
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


async def create_session(
    db: Any,
    customer_id: UUID,
    channel: ChannelType = ChannelType.whatsapp,
    external_conversation_id: Optional[str] = None,
) -> Session:
    data = {
        "customer_id": str(customer_id),
        "channel": channel.value,
        "status": SessionStatus.active.value,
    }
    if external_conversation_id is not None:
        data["external_conversation_id"] = external_conversation_id
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
    channel: ChannelType = ChannelType.whatsapp,
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
        "channel": channel.value,
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


# --- Complaints ---
# Reference numbers are generated here rather than by a database sequence: a
# sequence would tell every customer how many complaints the bank has received,
# and would make one customer's reference guessable from another's.
_REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no I/O/0/1
_COMPLAINT_STATUSES = ("new", "in_progress", "resolved", "closed")
# Mirrors the CHECK constraint added in migration 20260822000000. Ordered
# worst-first so it doubles as the dashboard sort order.
_COMPLAINT_SEVERITIES = ("critical", "high", "medium", "low")


def _generate_reference_number() -> str:
    suffix = "".join(secrets.choice(_REFERENCE_ALPHABET) for _ in range(6))
    return f"PIB-{datetime.now().year}-{suffix}"


async def create_complaint(
    db: Any,
    *,
    channel: ChannelType,
    category: str,
    description: str,
    session_id: Optional[UUID] = None,
    customer_id: Optional[UUID] = None,
    customer_name: Optional[str] = None,
    customer_phone: Optional[str] = None,
    national_id: Optional[str] = None,
    related_account_number: Optional[str] = None,
    preferred_contact: Optional[str] = None,
    language: str = "ar",
    context: Optional[dict] = None,
    severity: str = "medium",
    location: Optional[str] = None,
    atm_identifier: Optional[str] = None,
    incident_at_text: Optional[str] = None,
    ai_summary: Optional[str] = None,
    intent: Optional[str] = None,
    escalated_session_id: Optional[UUID] = None,
) -> Complaint:
    """Persist a complaint and return it, reference number included.

    Takes the RAW national ID and account number and masks them here, so no
    caller can forget to. Nothing else in the record is transformed.
    """
    data = {
        "reference_number": _generate_reference_number(),
        "session_id": str(session_id) if session_id else None,
        "customer_id": str(customer_id) if customer_id else None,
        "channel": channel.value if isinstance(channel, ChannelType) else str(channel),
        "customer_name": customer_name,
        "customer_phone": customer_phone,
        "national_id_masked": mask_identifier(national_id, visible=4) if national_id else None,
        "category": category,
        "description": description,
        "related_account_masked": (
            mask_identifier(str(related_account_number), visible=4)
            if related_account_number
            else None
        ),
        "preferred_contact": preferred_contact,
        "language": language,
        "status": "new",
        # Guarded rather than trusted: the column has a CHECK constraint, and an
        # unexpected value would fail the whole insert -- losing the complaint
        # over a classifier typo. "medium" is the same safe default the column
        # uses for pre-triage rows.
        "severity": severity if severity in _COMPLAINT_SEVERITIES else "medium",
        "location": location,
        "atm_identifier": atm_identifier,
        "incident_at_text": incident_at_text,
        "ai_summary": ai_summary,
        "intent": intent,
        "escalated_session_id": str(escalated_session_id) if escalated_session_id else None,
        "context": context or {},
    }

    # One retry only, and only for the unique-reference collision: at 32^6 the
    # second attempt failing means something else is wrong, and looping would
    # hide it.
    try:
        response = supabase.table("complaints").insert(data).execute()
    except Exception as e:
        logger.warning(f"Complaint insert failed, retrying with a fresh reference: {e}")
        data["reference_number"] = _generate_reference_number()
        try:
            response = supabase.table("complaints").insert(data).execute()
        except Exception as retry_error:
            logger.error(f"Failed to create complaint: {retry_error}")
            raise Exception("Failed to create complaint")

    if response.data:
        return Complaint(**response.data[0])
    raise Exception("Failed to create complaint")


async def list_complaints(
    db: Any,
    status: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    severity: Optional[str] = None,
) -> List[Complaint]:
    """Most urgent complaints first, then newest.

    Ordering by created_at alone put a captured card behind a week of mild
    grumbles. Postgres has no natural ordering for the severity strings -- 'low'
    sorts before 'medium' alphabetically -- so the sort is done in Python over
    the fetched page using the declared _COMPLAINT_SEVERITIES order.

    Degrades to [] so the dashboard shows an empty state rather than an error
    page when the table is unreachable.
    """
    if status is not None and status not in _COMPLAINT_STATUSES:
        raise ValueError(f"Unknown complaint status: {status}")
    if severity is not None and severity not in _COMPLAINT_SEVERITIES:
        raise ValueError(f"Unknown complaint severity: {severity}")

    try:
        query = supabase.table("complaints").select("*")
        if status:
            query = query.eq("status", status)
        if severity:
            query = query.eq("severity", severity)
        response = query.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
    except Exception as e:
        logger.error(f"Failed to list complaints: {e}")
        return []

    complaints = [Complaint(**row) for row in (response.data or [])]

    # Worst-first within the page already ordered newest-first, so equal
    # severities keep their recency order (Python's sort is stable). An
    # unrecognised severity sorts last rather than crashing the listing.
    rank = {s: i for i, s in enumerate(_COMPLAINT_SEVERITIES)}
    complaints.sort(key=lambda c: rank.get(c.severity, len(rank)))
    return complaints


async def get_complaint_by_id(db: Any, complaint_id: UUID) -> Optional[Complaint]:
    try:
        response = supabase.table("complaints").select("*").eq("id", str(complaint_id)).execute()
    except Exception as e:
        logger.error(f"Failed to fetch complaint {complaint_id}: {e}")
        return None

    rows = response.data or []
    return Complaint(**rows[0]) if rows else None


# --- End Complaints ---


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
