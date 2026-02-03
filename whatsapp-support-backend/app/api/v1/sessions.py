from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from typing import List, Any
from uuid import UUID

from app.api.v1.deps import get_session
from app.crud import crud
from app.schemas.schemas import SessionResponse, MessageResponse, SendMessageRequest
from app.core.whatsapp import WhatsAppClient
from app.models.enums import MessageDirection, ChannelType
from app.database import supabase
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/sessions", response_model=List[SessionResponse])
async def list_sessions(db: Any = Depends(get_session)):
    # Helper to clean Supabase response into Pydantic models/dicts
    response = supabase.table("sessions")\
        .select("*, customer:customers(*), employee:employees!sessions_employee_id_fkey(*, profile:profiles(*)), messages(*)")\
        .neq("status", "completed")\
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
            satisfaction_score=s.get("satisfaction_score")
        ))
    return result

@router.get("/sessions/{session_id}/messages", response_model=List[MessageResponse])
async def get_session_messages(session_id: UUID, db: Any = Depends(get_session)):
    msgs = await crud.get_messages_for_session(db, session_id)
    return msgs

@router.post("/sessions/{session_id}/send")
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
        await client.send_text_message(to_phone=phone, text=body.text)
    except Exception as e:
        logger.error(f"Manual send error: {e}")
        raise HTTPException(status_code=500, detail="Failed to send WhatsApp message")
        
    # Save Outbound Message
    msg = await crud.create_message(
        db, 
        session_id=session.id, 
        content=body.text, 
        direction=MessageDirection.outbound
    )
    
    return {"status": "sent", "message_id": str(msg.id)}
