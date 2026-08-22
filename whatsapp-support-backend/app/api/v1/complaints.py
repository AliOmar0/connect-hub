"""
Complaints read API, backing the /complaints dashboard page.

Read-only on purpose. Complaints are written by the intake flows only -- the
WhatsApp slot machine in app/api/v1/webhook.py and the voice tool in
app/api/v1/voice_agent.py -- so there is no endpoint here that could be used to
forge a record from a browser.

Endpoints:
    GET /complaints        - most urgent first, optional status/severity filter
    GET /complaints/{id}   - one complaint

Security: mounted with Depends(verify_jwt) in app/main.py, so every request
carries a staff Supabase token. Values are already masked at write time
(national ID, account number), so nothing is masked again here.
"""

from __future__ import annotations

import logging
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from app.crud import crud
from app.models.models import Complaint

logger = logging.getLogger(__name__)
router = APIRouter()

_STATUSES = ("new", "in_progress", "resolved", "closed")
# Mirrors the CHECK constraint in migration 20260822000000.
_SEVERITIES = ("critical", "high", "medium", "low")


@router.get("/complaints", response_model=List[Complaint])
async def list_complaints(
    status: Optional[str] = Query(None, description=f"One of {', '.join(_STATUSES)}"),
    severity: Optional[str] = Query(None, description=f"One of {', '.join(_SEVERITIES)}"),
    limit: int = Query(100, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> List[Complaint]:
    """List complaints, most urgent first then newest."""
    if status is not None and status not in _STATUSES:
        raise HTTPException(status_code=400, detail=f"status must be one of {list(_STATUSES)}")
    if severity is not None and severity not in _SEVERITIES:
        raise HTTPException(status_code=400, detail=f"severity must be one of {list(_SEVERITIES)}")
    return await crud.list_complaints(
        None, status=status, severity=severity, limit=limit, offset=offset
    )


@router.get("/complaints/{complaint_id}", response_model=Complaint)
async def get_complaint(complaint_id: UUID) -> Complaint:
    complaint = await crud.get_complaint_by_id(None, complaint_id)
    if complaint is None:
        raise HTTPException(status_code=404, detail="Complaint not found")
    return complaint
