"""
Bank Scraper Vector Knowledge Base package.

This package implements the `Scraper_Service` described in design.md as a
set of small, pure, independently testable modules (`frontier.py`,
`robots.py`, `rate_limiter.py`, `fetcher.py`, `extractor.py`, `fields.py`,
`ingestor.py`) orchestrated by `runner.CrawlJobRunner`.

The package-level export surface below is intentionally focused on what
external consumers actually need:

- `app/api/v1/scraper.py` (task 12) needs `CrawlJobRunner` to start a
  Crawl_Job and `CrawlAlreadyRunningError` to translate an already-running
  job into a `409 Conflict` response.
- `CrawlJobResult` / `ScrapedPageOutcome` are the two public dataclasses
  that cross the orchestration/API boundary (a `CrawlJobResult` is what a
  completed/failed run returns; a `ScrapedPageOutcome` is what each
  ingested page produces).

Internal helpers (frontier/robots/rate-limiter/fetcher/extractor/fields
functions) are consumed directly from their own modules by `runner.py` and
are not re-exported here, to keep this surface small and avoid encouraging
call sites to bypass the orchestrator.
"""

from app.core.scraper.models import CrawlJobResult, ScrapedPageOutcome
from app.core.scraper.runner import (
    CrawlAlreadyRunningError,
    CrawlJobRunner,
    reconcile_stale_running_jobs,
)

__all__ = [
    "CrawlJobRunner",
    "CrawlAlreadyRunningError",
    "CrawlJobResult",
    "ScrapedPageOutcome",
    "reconcile_stale_running_jobs",
]
