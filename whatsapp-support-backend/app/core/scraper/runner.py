"""
Crawl job orchestration for the Bank Scraper Vector Knowledge Base feature.

``CrawlJobRunner.run`` is the single entry point that ties every other pure
module in this package together into one end-to-end Crawl_Job: it fetches
and parses `robots.txt` first (aborting immediately on failure), then
performs a breadth-first crawl using `CrawlFrontier` + `RateLimiter` +
`fetch_with_retry`, extracting content/structured fields per page and
handing each successfully-fetched page to `ingestor.ingest_page`. Progress
(`pages_visited`/`pages_succeeded`/`pages_failed`) is persisted to the
`crawl_jobs` row throughout the run, not just at the end, so
`GET /scraper/jobs/current` (task 12) reflects live progress.

See design.md -> "7. `CrawlJobRunner` (`app/core/scraper/runner.py`)" and
decision #7 ("Single-flight crawl invariant").
"""

import asyncio
import logging
from collections import deque
from datetime import datetime, timezone
from typing import Deque, List, Literal, Optional, Tuple
from urllib.parse import urlparse
from uuid import UUID

import httpx

from app.core.config import settings
from app.database import supabase
from app.core.scraper import ingestor
from app.core.scraper.extractor import discover_links, extract_content
from app.core.scraper.fetcher import FetchError, fetch_with_retry
from app.core.scraper.fields import extract_structured_fields
from app.core.scraper.frontier import (
    CrawlFrontier,
    filter_allowed,
    filter_excluded_paths,
    filter_same_domain,
)
from app.core.scraper.models import CrawlJobResult
from app.core.scraper.rate_limiter import RateLimiter
from app.core.scraper.robots import RobotsFetchError, effective_delay, fetch_robots_policy

logger = logging.getLogger(__name__)


class CrawlAlreadyRunningError(Exception):
    """Raised when a Crawl_Job is requested while another one is already in
    progress, enforcing the single-flight invariant (Requirement 5.3). The
    API layer (task 12) catches this and returns `409 Conflict`."""


# Module-level (per-process) lock enforcing "only one Crawl_Job at a time"
# within this process. Combined with the `crawl_jobs.status='running'` check
# in `_check_not_already_running`, per design.md decision #7: since this
# backend runs as a single process today, the in-process lock is sufficient
# on its own, and the DB check additionally guards against the API and the
# scheduler racing to start a job at (almost) the same instant.
_crawl_lock = asyncio.Lock()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class CrawlJobRunner:
    """Orchestrates one end-to-end Crawl_Job."""

    async def run(
        self,
        trigger_type: Literal["scheduled", "manual"],
        triggered_by: Optional[UUID] = None,
    ) -> CrawlJobResult:
        await self._check_not_already_running()

        # Fast-path acquire: `_check_not_already_running` just confirmed the
        # lock is free, and asyncio is single-threaded/cooperative with no
        # `await` between that check and this acquire, so this cannot block.
        await _crawl_lock.acquire()
        try:
            return await self._run_locked(trigger_type, triggered_by)
        finally:
            _crawl_lock.release()

    async def _check_not_already_running(self) -> None:
        """Enforce the single-flight invariant: reject the request (rather
        than queueing or blocking) if a crawl is already running, either in
        this process (lock held) or according to the `crawl_jobs` table
        (Requirement 5.3)."""
        if _crawl_lock.locked():
            raise CrawlAlreadyRunningError(
                "A crawl job is already running in this process."
            )

        response = (
            supabase.table("crawl_jobs")
            .select("id")
            .eq("status", "running")
            .limit(1)
            .execute()
        )
        if response.data:
            raise CrawlAlreadyRunningError(
                "A crawl job is already running (crawl_jobs row with "
                "status='running' found)."
            )

    async def _run_locked(
        self,
        trigger_type: Literal["scheduled", "manual"],
        triggered_by: Optional[UUID],
    ) -> CrawlJobResult:
        job_id = await self._create_job_row(trigger_type, triggered_by)

        pages_visited = 0
        pages_succeeded = 0
        pages_failed = 0

        async with httpx.AsyncClient() as http_client:
            # robots.txt is always fetched before any other page is
            # requested (Requirement 2.1). An unreachable robots.txt aborts
            # the job immediately with no pages fetched (Requirement 2.5).
            try:
                policy = await fetch_robots_policy(
                    settings.BANK_WEBSITE_BASE_URL,
                    settings.SCRAPER_USER_AGENT,
                    http_client,
                )
            except RobotsFetchError as exc:
                failure_reason = str(exc)
                await self._finish_job(
                    job_id,
                    status="failed",
                    pages_visited=0,
                    pages_succeeded=0,
                    pages_failed=0,
                    failure_reason=failure_reason,
                )
                return CrawlJobResult(
                    job_id=job_id,
                    status="failed",
                    pages_visited=0,
                    pages_succeeded=0,
                    pages_failed=0,
                    failure_reason=failure_reason,
                )

            delay = effective_delay(policy, settings.SCRAPER_MIN_REQUEST_DELAY_SECONDS)
            rate_limiter = RateLimiter(delay)
            frontier = CrawlFrontier(
                start_url=settings.BANK_WEBSITE_BASE_URL,
                max_depth=settings.SCRAPER_MAX_DEPTH,
                max_pages=settings.SCRAPER_MAX_PAGES,
            )
            base_domain = urlparse(settings.BANK_WEBSITE_BASE_URL).hostname or ""

            queue: Deque[Tuple[str, int]] = deque([(settings.BANK_WEBSITE_BASE_URL, 0)])

            try:
                while queue and frontier.remaining_budget() > 0:
                    url, depth = queue.popleft()
                    if not frontier.should_visit(url, depth):
                        continue

                    frontier.mark_visited(url)
                    await rate_limiter.wait()
                    pages_visited += 1

                    try:
                        fetch_result = await fetch_with_retry(
                            url,
                            http_client,
                            settings.SCRAPER_MAX_RETRIES,
                            settings.SCRAPER_RETRY_BASE_BACKOFF_SECONDS,
                        )
                    except FetchError as exc:
                        # A single failing page is logged, counted as
                        # failed, and does NOT stop the rest of the crawl
                        # (Requirement 4.2).
                        logger.warning("Failed to fetch %s: %s", url, exc)
                        pages_failed += 1
                        await self._update_progress(
                            job_id, pages_visited, pages_succeeded, pages_failed
                        )
                        continue

                    extracted = extract_content(fetch_result.html)
                    structured_fields = extract_structured_fields(extracted.main_text)
                    outcome = await ingestor.ingest_page(
                        url,
                        extracted.title,
                        extracted.main_text,
                        structured_fields,
                        description=extracted.description,
                    )

                    # NOTE on succeeded/skipped accounting: the `crawl_jobs`
                    # table only has `pages_succeeded`/`pages_failed`
                    # columns (no `pages_skipped` column - see the
                    # 20260622000000_create_scraper_tables.sql migration and
                    # design.md's CrawlJobResult dataclass). A "skipped"
                    # ingest outcome (empty extracted content, or an
                    # unchanged checksum) represents a page that was
                    # successfully fetched and processed, just not
                    # (re)indexed - it is not a failure. Both "indexed" and
                    # "skipped" outcomes are therefore folded into
                    # `pages_succeeded`; only "failed" ingest outcomes
                    # increment `pages_failed`. This keeps
                    # pages_visited == pages_succeeded + pages_failed.
                    if outcome.outcome in ("indexed", "skipped"):
                        pages_succeeded += 1
                    else:
                        pages_failed += 1

                    # New links are only discovered from pages that were
                    # actually fetched. News/media-center pages are excluded
                    # regardless of locale (/ar/, /en/) since that content
                    # churns constantly and isn't stable banking knowledge.
                    links = discover_links(fetch_result.html, url)
                    same_domain_links = filter_same_domain(links, base_domain)
                    non_excluded_links = filter_excluded_paths(same_domain_links)
                    allowed_links = filter_allowed(
                        non_excluded_links, policy, settings.SCRAPER_USER_AGENT
                    )
                    for link in allowed_links:
                        if frontier.should_visit(link, depth + 1):
                            queue.append((link, depth + 1))

                    await self._update_progress(
                        job_id, pages_visited, pages_succeeded, pages_failed
                    )
            except Exception as exc:  # noqa: BLE001 - only truly
                # unexpected/catastrophic errors reach here; per-page
                # failures (FetchError, ingest_page's own broad catch) are
                # already handled above without escaping the loop.
                logger.exception("Unexpected error during crawl job %s", job_id)
                failure_reason = f"Unexpected error: {exc}"
                await self._finish_job(
                    job_id,
                    status="failed",
                    pages_visited=pages_visited,
                    pages_succeeded=pages_succeeded,
                    pages_failed=pages_failed,
                    failure_reason=failure_reason,
                )
                return CrawlJobResult(
                    job_id=job_id,
                    status="failed",
                    pages_visited=pages_visited,
                    pages_succeeded=pages_succeeded,
                    pages_failed=pages_failed,
                    failure_reason=failure_reason,
                )

        await self._finish_job(
            job_id,
            status="completed",
            pages_visited=pages_visited,
            pages_succeeded=pages_succeeded,
            pages_failed=pages_failed,
            failure_reason=None,
        )
        return CrawlJobResult(
            job_id=job_id,
            status="completed",
            pages_visited=pages_visited,
            pages_succeeded=pages_succeeded,
            pages_failed=pages_failed,
            failure_reason=None,
        )

    async def _create_job_row(
        self,
        trigger_type: Literal["scheduled", "manual"],
        triggered_by: Optional[UUID],
    ) -> UUID:
        data = {
            "status": "running",
            "trigger_type": trigger_type,
            "triggered_by": str(triggered_by) if triggered_by else None,
            "started_at": _now_iso(),
            "pages_visited": 0,
            "pages_succeeded": 0,
            "pages_failed": 0,
        }
        response = supabase.table("crawl_jobs").insert(data).execute()
        return UUID(response.data[0]["id"])

    async def _update_progress(
        self,
        job_id: UUID,
        pages_visited: int,
        pages_succeeded: int,
        pages_failed: int,
    ) -> None:
        """Persist progress incrementally, not only at completion, so
        `GET /scraper/jobs/current` reflects live progress."""
        supabase.table("crawl_jobs").update(
            {
                "pages_visited": pages_visited,
                "pages_succeeded": pages_succeeded,
                "pages_failed": pages_failed,
            }
        ).eq("id", str(job_id)).execute()

    async def _finish_job(
        self,
        job_id: UUID,
        status: Literal["completed", "failed"],
        pages_visited: int,
        pages_succeeded: int,
        pages_failed: int,
        failure_reason: Optional[str],
    ) -> None:
        supabase.table("crawl_jobs").update(
            {
                "status": status,
                "completed_at": _now_iso(),
                "pages_visited": pages_visited,
                "pages_succeeded": pages_succeeded,
                "pages_failed": pages_failed,
                "failure_reason": failure_reason,
            }
        ).eq("id", str(job_id)).execute()


def reconcile_stale_running_jobs() -> int:
    """Mark any `crawl_jobs` rows left in `status='running'` as `failed`.

    Bug fixed here: `_check_not_already_running` treats a `status='running'`
    row as proof a crawl is in progress, but that row is only ever cleared
    by `_finish_job` at the end of a run. If the backend process is stopped
    (crash, redeploy, manual restart) while a crawl is running, `_finish_job`
    never executes and the row is left `running` forever. The in-process
    `_crawl_lock` is naturally released by the restart, but the DB row is
    not, so every subsequent `POST /scraper/jobs` call - even right after a
    clean restart with nothing actually running - incorrectly raises
    `CrawlAlreadyRunningError` / gets a `409 "A crawl job is already
    running."` response, with no way to recover short of manually editing
    the database.

    Call this once at process startup (before the scheduler or any request
    can start a new crawl) to reconcile any such orphaned rows: since the
    process that was running them no longer exists, their progress is lost
    and they are correctly reported as `failed`, freeing up the single-flight
    check for new crawls.

    Returns the number of rows reconciled (for startup logging).
    """
    response = (
        supabase.table("crawl_jobs")
        .update(
            {
                "status": "failed",
                "completed_at": _now_iso(),
                "failure_reason": (
                    "Crawl job interrupted: backend process stopped or "
                    "restarted before this job finished."
                ),
            }
        )
        .eq("status", "running")
        .execute()
    )
    return len(response.data) if response.data else 0
