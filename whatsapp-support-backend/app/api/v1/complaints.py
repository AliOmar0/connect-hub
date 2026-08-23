"""
Complaints API, backing the /complaints dashboard page.

There is deliberately still NO create endpoint. Complaints are written by the
intake flows only -- the WhatsApp slot machine in app/api/v1/webhook.py and the
voice tool in app/api/v1/voice_agent.py -- so nothing here can forge a record
from a browser. What staff CAN do is move an existing complaint through its
lifecycle, which is what PATCH below is for: until it existed a complaint was
written once as 'new' and never changed, so an employee had no way to record
that they had handled one.

Endpoints:
    GET   /complaints        - most urgent first, optional status/severity filter
    GET   /complaints/{id}   - one complaint
    PATCH /complaints/{id}   - change status (admin/supervisor/manager only)

Security: mounted with Depends(verify_jwt) in app/main.py, so every request
carries a staff Supabase token. The write route additionally requires
require_admin_access -- verify_jwt alone resolves an absent role claim to
"viewer", which must not be able to close complaints. Values are already masked
at write time (national ID, account number), so nothing is masked again here.
"""

from __future__ import annotations

import logging
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.api.v1.deps import require_admin_access
from app.crud import crud
from app.models.models import Complaint

logger = logging.getLogger(__name__)
router = APIRouter()

_STATUSES = ("new", "in_progress", "resolved", "closed")
# Mirrors the CHECK constraint in migration 20260822000000.
_SEVERITIES = ("critical", "high", "medium", "low")


class UpdateComplaintRequest(BaseModel):
    """Status only. Everything else on a complaint is what the customer said,
    and staff editing that would destroy the record of the report itself."""

    status: str


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


@router.patch(
    "/complaints/{complaint_id}",
    response_model=Complaint,
    dependencies=[Depends(require_admin_access)],
)
async def update_complaint(
    complaint_id: UUID, payload: UpdateComplaintRequest
) -> Complaint:
    """Move a complaint to another status.

    Goes through the backend rather than letting the dashboard UPDATE the row
    directly: the RLS policy on `complaints` grants UPDATE to admin/supervisor
    only, and managers are expected to work the queue too. The service-role
    client here covers all three, with require_admin_access as the gate.
    """
    if payload.status not in _STATUSES:
        raise HTTPException(
            status_code=400, detail=f"status must be one of {list(_STATUSES)}"
        )

    try:
        complaint = await crud.update_complaint_status(None, complaint_id, payload.status)
    except Exception as e:
        logger.error(f"Failed to update complaint {complaint_id}: {e}")
        raise HTTPException(status_code=500, detail="Could not update complaint") from e

    if complaint is None:
        raise HTTPException(status_code=404, detail="Complaint not found")

    if payload.status == "resolved":
        # Staff-facing only. The customer is told about a resolution by whoever
        # handled it -- this flow has no way to know what was actually done.
        try:
            await crud.create_notification(
                None,
                user_id=None,
                title="✅ Complaint Resolved",
                message=f"Complaint {complaint.reference_number} was marked resolved.",
                type="info",
                action_url=f"/complaints/{complaint.id}",
            )
        except Exception as e:
            logger.warning(f"Could not create resolution notification: {e}")

    return complaint
