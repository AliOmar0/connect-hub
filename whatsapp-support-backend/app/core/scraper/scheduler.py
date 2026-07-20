"""
Scheduled (periodic) crawl trigger for the Bank Scraper Vector Knowledge Base
feature (Requirement 5.1).

Runs a crawl job daily at 08:00 local server time. On startup, calculates
the seconds until the next 08:00, sleeps until then, runs the crawl, then
sleeps 24 hours (86400 seconds) before each subsequent run. This matches
the "daily at 8 AM" requirement rather than a simple fixed interval from
process start.

Mirrors `app.crud.cleanup.retention_cleanup_task`'s long-running loop style
exactly: attempt the work first, then sleep before the next attempt, with a
broad try/except around the attempt so the loop itself never dies. Unlike the
cleanup task, a scheduled crawl attempt that finds a crawl job already running
(manual or a previous scheduled run still in progress) is an expected, benign
outcome rather than an error - it is caught specifically via
`CrawlAlreadyRunningError` and logged at a lower level without treating it as
a failure.

Started from `app/main.py`'s lifespan (task 13.2) guarded by
`settings.SCRAPER_ENABLED`, alongside the existing `session_cleanup_task` /
`retention_cleanup_task` background tasks.
"""

import asyncio
import logging
from datetime import datetime, time, timedelta

from app.core.scraper import CrawlAlreadyRunningError, CrawlJobRunner

logger = logging.getLogger(__name__)

DAILY_SECONDS = 24 * 60 * 60  # 86400
TARGET_HOUR = 8  # 08:00 local time


def _seconds_until_next_8am() -> int:
    """Return seconds until the next 08:00 local time."""
    now = datetime.now()
    target_today = datetime.combine(now.date(), time(TARGET_HOUR, 0, 0))
    if now >= target_today:
        # Next run is tomorrow at 08:00
        target = target_today + timedelta(days=1)
    else:
        target = target_today
    delta = target - now
    return int(delta.total_seconds())


async def scheduled_crawl_task() -> None:
    """Long-running loop: run a scheduled Crawl_Job daily at 08:00.

    On first iteration, sleeps until the next 08:00. After each run,
    sleeps 24 hours (86400 seconds) before the next attempt. If a crawl job
    is already running (manual or scheduled), the attempt is a no-op that is
    logged and the loop simply continues on schedule.
    """
    # Initial sleep until the first 08:00
    initial_delay = _seconds_until_next_8am()
    logger.info(f"Scheduled crawler: first run in {initial_delay} seconds (at 08:00)")
    await asyncio.sleep(initial_delay)

    while True:
        try:
            await CrawlJobRunner().run(trigger_type="scheduled", triggered_by=None)
        except CrawlAlreadyRunningError:
            logger.info(
                "Scheduled crawl skipped: a crawl job is already running."
            )
        except Exception as e:
            logger.exception(f"Error in scheduled_crawl_task: {e}")
        await asyncio.sleep(DAILY_SECONDS)
