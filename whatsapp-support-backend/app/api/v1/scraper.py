"""
Scraper API Endpoints (Bank Scraper Vector Knowledge Base feature).

Implements Requirements 5.2, 5.3, 9.4, 10.1, 10.2, 10.3.

Endpoints:
- POST /scraper/jobs             - Start a manual Crawl_Job (admin/supervisor only)
- GET  /scraper/jobs             - Paginated Crawl_Job history (all 5 roles)
- GET  /scraper/jobs/current     - The currently running Crawl_Job, or null (all 5 roles)
- GET  /scraper/jobs/{job_id}    - Single Crawl_Job detail with per-page outcomes (all 5 roles)

This router is registered under `settings.API_V1_STR` in `app/main.py` (task
13.2) with the existing `dependencies=[Depends(verify_jwt)]` pattern used by
every other v1 router, so every route below already runs behind a verified
JWT by the time it executes. `require_scraper_admin` layers an *additional*
role check on top of that for the state-changing POST endpoint, since
`verify_jwt` alone only proves the caller is one of the 5
`JWT_AUTHORIZED_ROLES` - it does not restrict *which* of those 5 roles may
trigger a crawl (Requirements 10.1, 10.2). The 3 GET endpoints intentionally
have no extra role gate: all 5 roles are allowed to view history/status
(Requirement 10.3), so a successful `verify_jwt` is already sufficient.

Design decisions made in this task (see task 12.1 instructions):

1. Per-page outcomes on `GET /scraper/jobs/{job_id}`: `ingestor.ingest_page`
   does not currently stamp `scraped_pages.last_crawl_job_id` with the
   job that produced each row (`runner.py` calls `ingestor.ingest_page`
   without threading a `job_id` through). Wiring that end-to-end would touch
   `runner.py`'s call site and `ingestor.py`'s several `scraped_pages`
   insert/update call sites, all of which are already covered by passing
   property tests (Property 13/15/16) from tasks 9.2-9.4. To avoid
   destabilizing those tests in this API-layer task, this endpoint queries
   `scraped_pages` filtered by `last_crawl_job_id` as designed, but the
   column will simply be empty until a follow-up task threads `job_id`
   through the ingestion bridge. Documented here as a known gap (option a).

2. `POST /scraper/jobs` blocking vs. background: per design.md's endpoint
   table ("Starts a Crawl_Job") and Requirement 5.2 ("start a new Crawl_Job
   immediately"), this endpoint does NOT await the full crawl. It checks
   `CrawlAlreadyRunningError` synchronously up front so `409` is returned
   immediately, then kicks off `CrawlJobRunner.run(...)` via
   `asyncio.create_task` and returns a "started" response right away. A full
   crawl can take much longer than an HTTP request should reasonably block
   for, and the caller can poll `GET /scraper/jobs/current` for progress.
"""

import asyncio
import logging
from datetime import datetime
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.api.v1.deps import verify_jwt
from app.database import supabase
from app.core.scraper import CrawlAlreadyRunningError, CrawlJobRunner

logger = logging.getLogger(__name__)
router = APIRouter()

# Roles permitted to start or configure a Crawl_Job (Requirements 10.1, 10.2).
_SCRAPER_ADMIN_ROLES = {"admin", "supervisor"}


# --- Pydantic Models ---

class CrawlJobOut(BaseModel):
    """Mirrors the `crawl_jobs` table columns."""
    id: UUID
    status: str
    trigger_type: str
    triggered_by: Optional[UUID] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    pages_visited: int = 0
    pages_succeeded: int = 0
    pages_failed: int = 0
    failure_reason: Optional[str] = None
    created_at: datetime


class ScrapedPageOutcomeOut(BaseModel):
    """Per-page outcome for a Crawl_Job, sourced from `scraped_pages` rows
    whose `last_crawl_job_id` matches the requested job (see module
    docstring note 1 for the current state of that wiring)."""
    url: str
    status: str
    checksum: Optional[str] = None
    retry_count: int = 0
    last_attempted_at: Optional[datetime] = None
    error_message: Optional[str] = None
    knowledge_document_id: Optional[UUID] = None


class CrawlJobDetailOut(CrawlJobOut):
    """Single Crawl_Job detail, additionally including per-page outcomes
    (Requirement 10.3)."""
    pages: List[ScrapedPageOutcomeOut] = []


class StartCrawlJobResponse(BaseModel):
    """Immediate response for POST /scraper/jobs (see module docstring
    decision 2 - the crawl runs in the background, this is not the final
    CrawlJobResult)."""
    status: str
    message: str


def _parse_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _row_to_crawl_job_out(row: dict) -> CrawlJobOut:
    return CrawlJobOut(
        id=UUID(row["id"]),
        status=row["status"],
        trigger_type=row["trigger_type"],
        triggered_by=UUID(row["triggered_by"]) if row.get("triggered_by") else None,
        started_at=_parse_datetime(row.get("started_at")),
        completed_at=_parse_datetime(row.get("completed_at")),
        pages_visited=row.get("pages_visited", 0),
        pages_succeeded=row.get("pages_succeeded", 0),
        pages_failed=row.get("pages_failed", 0),
        failure_reason=row.get("failure_reason"),
        created_at=_parse_datetime(row["created_at"]),
    )


def _row_to_scraped_page_out(row: dict) -> ScrapedPageOutcomeOut:
    return ScrapedPageOutcomeOut(
        url=row["url"],
        status=row["status"],
        checksum=row.get("checksum"),
        retry_count=row.get("retry_count", 0),
        last_attempted_at=_parse_datetime(row.get("last_attempted_at")),
        error_message=row.get("error_message"),
        knowledge_document_id=(
            UUID(row["knowledge_document_id"])
            if row.get("knowledge_document_id")
            else None
        ),
    )


# --- Access Control ---

def require_scraper_admin(user: dict = Depends(verify_jwt)) -> dict:
    """Raises 403 unless `user['role']` is `'admin'` or `'supervisor'`
    (Requirements 10.1, 10.2). Used as a dependency on the state-changing
    `POST /scraper/jobs` endpoint only; the router-level `verify_jwt`
    dependency (applied in `app/main.py`) has already run by the time this
    executes."""
    if user.get("role") not in _SCRAPER_ADMIN_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admin or supervisor roles may start or configure a crawl job.",
        )
    return user


# --- API Endpoints ---

@router.post(
    "/scraper/jobs",
    response_model=StartCrawlJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def start_crawl_job(user: dict = Depends(require_scraper_admin)):
    """
    Start a new Crawl_Job with `trigger_type="manual"` (Requirement 5.2).

    Returns `409 Conflict` if a Crawl_Job is already running (Requirement
    5.3). The crawl itself runs in the background (see module docstring
    decision 2) so this endpoint returns immediately rather than blocking
    for the crawl's full duration.
    """
    runner = CrawlJobRunner()
    triggered_by = UUID(user["id"]) if user.get("id") else None

    try:
        # Checked synchronously up front so a 409 is returned immediately,
        # before any background task is created.
        await runner._check_not_already_running()
    except CrawlAlreadyRunningError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A crawl job is already running.",
        )

    async def _run_and_log():
        try:
            await runner.run(trigger_type="manual", triggered_by=triggered_by)
        except CrawlAlreadyRunningError:
            # Extremely unlikely race between the check above and this task
            # actually starting, but not a crash-worthy condition.
            logger.warning("Crawl job start raced with another already-running job.")
        except Exception:  # noqa: BLE001 - background task, nothing to
            # propagate to an HTTP response at this point.
            logger.exception("Unexpected error while running background crawl job")

    asyncio.create_task(_run_and_log())

    return StartCrawlJobResponse(status="started", message="Crawl job started")


@router.get("/scraper/jobs", response_model=List[CrawlJobOut])
async def list_crawl_jobs(skip: int = 0, limit: int = 50, user: dict = Depends(verify_jwt)):
    """
    Paginated Crawl_Job history. Available to all 5 roles (Requirement
    10.3); no additional role gate beyond `verify_jwt`.
    """
    response = (
        supabase.table("crawl_jobs")
        .select("*")
        .order("created_at", desc=True)
        .range(skip, skip + limit - 1)
        .execute()
    )
    rows = response.data if response.data else []
    return [_row_to_crawl_job_out(row) for row in rows]


@router.get("/scraper/jobs/current", response_model=Optional[CrawlJobOut])
async def get_current_crawl_job(user: dict = Depends(verify_jwt)):
    """
    The currently running Crawl_Job, or `null` if none is running.
    Available to all 5 roles (Requirement 10.3).
    """
    response = (
        supabase.table("crawl_jobs")
        .select("*")
        .eq("status", "running")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if not response.data:
        return None
    return _row_to_crawl_job_out(response.data[0])


@router.get("/scraper/jobs/{job_id}", response_model=CrawlJobDetailOut)
async def get_crawl_job_detail(job_id: UUID, user: dict = Depends(verify_jwt)):
    """
    Single Crawl_Job detail including per-page outcomes. Available to all 5
    roles (Requirement 10.3).

    See module docstring note 1: per-page outcomes are sourced from
    `scraped_pages.last_crawl_job_id`, which is not yet stamped by
    `ingestor.ingest_page`/`runner.py` - this currently returns an empty
    `pages` list until that wiring is added in a follow-up task.
    """
    job_response = (
        supabase.table("crawl_jobs").select("*").eq("id", str(job_id)).execute()
    )
    if not job_response.data:
        raise HTTPException(status_code=404, detail="Crawl job not found")

    job_row = job_response.data[0]

    pages_response = (
        supabase.table("scraped_pages")
        .select("*")
        .eq("last_crawl_job_id", str(job_id))
        .execute()
    )
    page_rows = pages_response.data if pages_response.data else []

    detail = _row_to_crawl_job_out(job_row).model_dump()
    detail["pages"] = [_row_to_scraped_page_out(row) for row in page_rows]
    return CrawlJobDetailOut(**detail)
