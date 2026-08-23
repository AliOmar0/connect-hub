from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from typing import List, Any
from uuid import UUID
import httpx

from app.api.v1.deps import get_session, require_write_access
from app.crud import crud
from app.api.v1.deps import get_session
from app.crud import crud
from app.schemas.schemas import SessionResponse, MessageResponse, SendMessageRequest, UpdateSessionRequest
from app.core.whatsapp import WhatsAppClient
from app.core.message_buffer import message_buffer
from app.models.enums import MessageDirection, ChannelType, SessionStatus
from app.database import supabase
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/sessions/typing-status")
async def get_all_typing_status():
    """
    Get typing status for all sessions.
    Frontend polls this endpoint to show 'customer is typing...' indicators
    in the sessions list sidebar.
    
    Returns: { "session_id": { is_typing, buffered_count, is_processing }, ... }
    """
    return message_buffer.get_all_typing_sessions()


@router.get("/sessions/{session_id}/typing")
async def get_session_typing_status(session_id: UUID):
    """
    Get typing/buffer status for a specific session.
    Frontend polls this endpoint to show typing indicator in the chat view.
    
    Returns: { is_typing, buffered_count, is_processing, rapid_typing, typing_started_at }
    """
    return message_buffer.get_typing_status(session_id)

@router.get("/sessions", response_model=List[SessionResponse])
async def list_sessions(db: Any = Depends(get_session)):
    # Helper to clean Supabase response into Pydantic models/dicts
    response = supabase.table("sessions")\
        .select("*, customer:customers(*), employee:employees!sessions_employee_id_fkey(*, profile:profiles(*)), messages(*)")\
        .order("updated_at", desc=True)\
        .execute()
    
    sessions_data = response.data
    
    result = []
    for s in sessions_data:
        # Extract messages for last_message
        last_msg = ""
        msgs = s.get("messages", [])
        if msgs:
            # Sort by sent_at or created_at
            sorted_msgs = sorted(msgs, key=lambda m: m.get("sent_at") or m.get("created_at"), reverse=True)
            if sorted_msgs:
                last_msg = sorted_msgs[0].get("content") or ""
        
        # Extract customer info
        cust = s.get("customer") or {}
        c_name = cust.get("name") or "Unknown"
        c_phone = cust.get("phone")
        c_email = cust.get("email")

        # Extract employee info
        emp = s.get("employee") or {}
        emp_profile = emp.get("profile") or {}
        emp_name = None
        if emp_profile:
             f_name = emp_profile.get("first_name") or ""
             l_name = emp_profile.get("last_name") or ""
             emp_name = f"{f_name} {l_name}".strip()
        
        result.append(SessionResponse(
            id=s["id"],
            channel=s.get("channel", "whatsapp"),
            customer_name=c_name,
            customer_phone=c_phone,
            customer_email=c_email,
            employee_id=s.get("employee_id"),
            employee_name=emp_name,
            last_message=last_msg,
            status=s["status"],
            started_at=s["started_at"],
            wait_time_seconds=s.get("wait_time_seconds"),
            duration_seconds=s.get("duration_seconds"),
            satisfaction_score=s.get("satisfaction_score"),
            main_type_id=s.get("main_type_id"),
            external_conversation_id=s.get("external_conversation_id"),
        ))
    return result

@router.get("/sessions/{session_id}/messages", response_model=List[MessageResponse])
async def get_session_messages(session_id: UUID, db: Any = Depends(get_session)):
    msgs = await crud.get_messages_for_session(db, session_id)
    return msgs

@router.post(
    "/sessions/{session_id}/send",
    dependencies=[Depends(require_write_access)],
)
async def send_message(
    session_id: UUID, 
    body: SendMessageRequest, 
    db: Any = Depends(get_session)
):
    session = await crud.get_session_by_id(db, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    if not session.customer_id:
        raise HTTPException(status_code=400, detail="Session has no customer linked")
        
    # Fetch customer details via Supabase
    res = supabase.table("customers").select("*").eq("id", str(session.customer_id)).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Customer not found")
        
    customer_data = res.data[0]
    phone = customer_data.get("phone")
    
    if not phone:
        raise HTTPException(status_code=400, detail="Customer has no phone number")
        
    # Fetch dynamic WhatsApp config
    api_config = await crud.get_api_config(db, ChannelType.whatsapp)
    phone_id = None
    token = None
    if api_config and api_config.is_active:
        phone_id = api_config.phone_number_id
        token = api_config.access_token_encrypted

    # Create client with either dynamic or default config
    client = WhatsAppClient(phone_number_id=phone_id, access_token=token)
    
    try:
        if body.media_url:
            # Handle media sending
            if body.media_type and body.media_type.startswith("audio"):
                # 1. Download from our storage
                async with httpx.AsyncClient() as http_client:
                    resp = await http_client.get(body.media_url)
                    resp.raise_for_status()
                    media_bytes = resp.content
                
                # 2. Upload to Meta
                media_id = await client.upload_media(media_bytes, "voice.ogg", "audio/ogg")
                if not media_id:
                    raise HTTPException(status_code=500, detail="Failed to upload audio to WhatsApp")
                
                # 3. Send as audio
                await client.send_audio_message(to_phone=phone, media_id=media_id)
            else:
                # For now, default to text if media type not supported for manual send
                await client.send_text_message(to_phone=phone, text=body.text or "[Media]")
        else:
            await client.send_text_message(to_phone=phone, text=body.text)
    except Exception as e:
        logger.error(f"Manual send error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to send WhatsApp message: {str(e)}")
        
    # Save Outbound Message
    msg = await crud.create_message(
        db, 
        session_id=session.id, 
        content=body.text or "[Media]", 
        direction=MessageDirection.outbound,
        media_url=body.media_url,
        media_type=body.media_type
    )
    
    return {"status": "sent", "message_id": str(msg.id)}

@router.patch(
    "/sessions/{session_id}",
    dependencies=[Depends(require_write_access)],
)
async def update_session(
    session_id: UUID, 
    body: UpdateSessionRequest, 
    db: Any = Depends(get_session)
):
    """
    Update session details (main_type_id or status)
    """
    payload = body.model_dump(exclude_unset=True)
    
    if "main_type_id" in payload:
        await crud.update_session_main_type(db, session_id, body.main_type_id)
        
    if "status" in payload:
        await crud.update_session_status(db, session_id, body.status)
        
    if "satisfaction_score" in payload:
        await crud.update_session_satisfaction(db, session_id, body.satisfaction_score)
        
    return {"status": "updated"}
