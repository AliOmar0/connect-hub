"""
Data retention cleanup (NFR-03.05: 30-day retention).

Deletes conversation data (completed sessions and their messages) older than
settings.DATA_RETENTION_DAYS. This is distinct from `crud.close_inactive_sessions`
(which only closes stale-but-live sessions) and `crud.delete_old_notifications`
(24h dashboard notifications) — this module is the actual compliance-driven
data deletion job.

Scheduled from app/main.py's lifespan alongside the existing session-cleanup
background task; also safe to invoke standalone (e.g. from a cron/Task
Scheduler entry) via `python -m app.crud.cleanup`.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from app.database import supabase
from app.core.config import settings
from app.models.enums import SessionStatus

logger = logging.getLogger(__name__)


async def purge_expired_sessions(retention_days: int = None) -> int:
    """
    Permanently delete sessions (and, via FK cascade, their messages) that:
      - are in a terminal state (completed / missed), AND
      - were last updated more than `retention_days` ago.

    Live sessions (active/waiting/escalated) are never touched here regardless
    of age — only `close_inactive_sessions` transitions those to completed
    first; retention deletion only applies once a session has actually ended.

    Returns the number of sessions deleted.
    """
    days = retention_days if retention_days is not None else settings.DATA_RETENTION_DAYS
    threshold = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    terminal_statuses = [SessionStatus.completed.value, SessionStatus.missed.value]

    try:
        response = (
            supabase.table("sessions")
            .delete()
            .in_("status", terminal_statuses)
            .lt("updated_at", threshold)
            .execute()
        )
    except Exception as e:
        logger.error(f"Data retention purge failed: {e}")
        return 0

    deleted = len(response.data) if response.data else 0
    if deleted:
        logger.info(
            f"Data retention: purged {deleted} session(s) older than {days} days "
            f"(threshold={threshold})."
        )
    return deleted


async def retention_cleanup_task(interval_seconds: int = 24 * 60 * 60) -> None:
    """Long-running loop: run the retention purge once a day."""
    while True:
        try:
            await purge_expired_sessions()
        except Exception as e:
            logger.exception(f"Error in retention_cleanup_task: {e}")
        await asyncio.sleep(interval_seconds)


if __name__ == "__main__":
    # Allow running as a one-shot cron job: python -m app.crud.cleanup
    asyncio.run(purge_expired_sessions())
