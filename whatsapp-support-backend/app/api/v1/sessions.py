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
    sessions = await crud.get_active_sessions(db)
    response = []
    for s in sessions:
        last_msg = ""
        if s.messages:
            # Sort by sent_at or created_at
            sorted_msgs = sorted(s.messages, key=lambda m: m.sent_at or m.created_at, reverse=True)
            if sorted_msgs:
                last_msg = sorted_msgs[0].content or ""
        
        c_name = s.customer.name if s.customer else "Unknown"
        
        response.append(SessionResponse(
            id=s.id,
            customer_name=c_name,
            last_message=last_msg,
            status=s.status,
            started_at=s.started_at
        ))
    return response

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
