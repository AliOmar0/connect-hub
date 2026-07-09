"""
In-process data models for the Bank Scraper Vector Knowledge Base feature.

These dataclasses carry results between the pure crawl/extraction modules
(``frontier.py``, ``robots.py``, ``fetcher.py``, ``extractor.py``,
``fields.py``) and the orchestration/ingestion layer (``runner.py``,
``ingestor.py``). They are intentionally lightweight and free of I/O.

See design.md -> "In-process data models (Python, `app/core/scraper/models.py`)".
"""

from dataclasses import dataclass
from typing import Literal, Optional
from uuid import UUID


@dataclass
class CrawlJobResult:
    job_id: UUID
    status: Literal["completed", "failed"]
    pages_visited: int
    pages_succeeded: int
    pages_failed: int
    failure_reason: Optional[str]


@dataclass
class ScrapedPageOutcome:
    url: str
    outcome: Literal["indexed", "skipped", "failed"]
    knowledge_document_id: Optional[UUID]
    error_message: Optional[str]
