from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.core.decision_engine import decision_engine
from app.models.decision import DecisionResult

router = APIRouter()

class DecisionRequest(BaseModel):
    user_message: str
    session_id: str = None
    channel: str = "web"

@router.post("/evaluate", response_model=DecisionResult)
async def evaluate_decision(request: DecisionRequest):
    """
    Unified endpoint for all external channels (e.g. Node.js backend) 
    to retrieve the exact AI policy decision (Respond, Clarify, Escalate, Mock).
    """
    try:
        decision = await decision_engine.evaluate(
            user_message=request.user_message,
            session_id=request.session_id
        )
        return decision
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
