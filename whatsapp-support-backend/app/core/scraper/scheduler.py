"""
Scheduled (periodic) crawl trigger for the Bank Scraper Vector Knowledge Base
feature (Requirement 5.1).

Mirrors `app.crud.cleanup.retention_cleanup_task`'s long-running loop style
exactly: attempt the work first, then sleep `interval_seconds` before the
next attempt, with a broad try/except around the attempt so the loop itself
never dies. Unlike the cleanup task, a scheduled crawl attempt that finds a
crawl job already running (manual or a previous scheduled run still in
progress) is an expected, benign outcome rather than an error - it is caught
specifically via `CrawlAlreadyRunningError` and logged at a lower level
without treating it as a failure.

Started from `app/main.py`'s lifespan (task 13.2) guarded by
`settings.SCRAPER_ENABLED`, alongside the existing `session_cleanup_task` /
`retention_cleanup_task` background tasks.
"""

import asyncio
import logging

from app.core.scraper import CrawlAlreadyRunningError, CrawlJobRunner

logger = logging.getLogger(__name__)


async def scheduled_crawl_task(interval_seconds: int) -> None:
    """Long-running loop: attempt a scheduled Crawl_Job every
    `interval_seconds`.

    Mirrors `app.crud.cleanup.retention_cleanup_task`'s loop order exactly:
    the crawl attempt happens first, then the loop sleeps for
    `interval_seconds` before attempting again. If a crawl job is already
    running (manual or scheduled), the attempt is a no-op that is logged and
    the loop simply continues on schedule.
    """
    while True:
        try:
            await CrawlJobRunner().run(trigger_type="scheduled", triggered_by=None)
        except CrawlAlreadyRunningError:
            logger.info(
                "Scheduled crawl skipped: a crawl job is already running."
            )
        except Exception as e:
            logger.exception(f"Error in scheduled_crawl_task: {e}")
        await asyncio.sleep(interval_seconds)
