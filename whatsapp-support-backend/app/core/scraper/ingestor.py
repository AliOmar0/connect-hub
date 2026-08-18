"""
Knowledge base ingestion bridge for the Bank Scraper Vector Knowledge Base
feature.

`ingest_page` is the single entry point the crawl runner (`runner.py`) calls
for each successfully-extracted page. It deliberately does **not**
reimplement any document/version/indexing logic: it reuses
`app.core.rag.compute_document_checksum` and the existing
`create_document_record` / `create_version_record` / `index_document_task`
helpers from `app.api.v1.knowledge_base` (Requirement 6, design.md
"Reuse, don't parallel-build").

`scraped_pages` (keyed by `url`, unique) tracks crawl metadata -
`checksum`, `status`, `retry_count`, `last_attempted_at`, `error_message` -
independently of `knowledge_documents` / `knowledge_document_versions`, so a
failed re-scrape can update crawl bookkeeping without ever touching
previously indexed content (Requirement 4.3).

See design.md -> "8. `KnowledgeBaseIngestor` (`app/core/scraper/ingestor.py`)".
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import List, Optional
from uuid import UUID

from app.database import supabase
from app.core.rag import compute_document_checksum
from app.core.scraper.fields import StructuredField
from app.core.scraper.models import ScrapedPageOutcome
from app.api.v1.knowledge_base import (
    create_document_record,
    create_version_record,
    index_document_task,
    update_document_description,
)

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _get_scraped_page(url: str) -> Optional[dict]:
    response = supabase.table("scraped_pages").select("*").eq("url", url).execute()
    if response.data:
        return response.data[0]
    return None


async def _get_next_version_number(document_id: UUID) -> int:
    response = (
        supabase.table("knowledge_document_versions")
        .select("version_number")
        .eq("document_id", str(document_id))
        .order("version_number", desc=True)
        .limit(1)
        .execute()
    )
    if response.data:
        return response.data[0]["version_number"] + 1
    return 1


async def _mark_skipped_empty(url: str, existing: Optional[dict], crawl_job_id: Optional[UUID] = None) -> None:
    """Record a page with empty extracted main text as skipped, without
    touching any knowledge_documents/knowledge_document_versions rows
    (Requirement 3.5)."""
    data = {
        "url": url,
        "status": "skipped",
        "last_attempted_at": _now_iso(),
        "updated_at": _now_iso(),
        "error_message": None,
    }
    if crawl_job_id:
        data["last_crawl_job_id"] = str(crawl_job_id)
    if existing:
        supabase.table("scraped_pages").update(data).eq("url", url).execute()
    else:
        data["retry_count"] = 0
        data["checksum"] = None
        supabase.table("scraped_pages").insert(data).execute()


async def _mark_unchanged(existing: dict, crawl_job_id: Optional[UUID] = None) -> None:
    """Checksum unchanged since the last successful (indexed) scrape of
    this url: skip re-indexing, update only `last_attempted_at` (and
    `updated_at`) (Requirements 6.1, 6.2)."""
    data = {
        "last_attempted_at": _now_iso(),
        "updated_at": _now_iso(),
    }
    if crawl_job_id:
        data["last_crawl_job_id"] = str(crawl_job_id)
    supabase.table("scraped_pages").update(data).eq("url", existing["url"]).execute()


async def _upsert_indexed(
    url: str,
    existing: Optional[dict],
    knowledge_document_id: UUID,
    checksum: str,
    crawl_job_id: Optional[UUID] = None,
) -> None:
    """Update scraped_pages bookkeeping after successfully creating a new
    document/version and queueing indexing. Uses status='indexed'
    optimistically: this row tracks the crawl/ingestion *decision* (a new
    version was created and indexing was queued), not the eventual
    background indexing outcome, which is tracked separately on
    `knowledge_document_versions.status` by the existing
    `index_document_task` (Requirement 6.3 - version creation and
    indexing succeed/fail independently)."""
    data = {
        "url": url,
        "knowledge_document_id": str(knowledge_document_id),
        "checksum": checksum,
        "status": "indexed",
        "retry_count": 0,
        "error_message": None,
        "last_attempted_at": _now_iso(),
        "updated_at": _now_iso(),
    }
    if crawl_job_id:
        data["last_crawl_job_id"] = str(crawl_job_id)
    if existing:
        supabase.table("scraped_pages").update(data).eq("url", url).execute()
    else:
        supabase.table("scraped_pages").insert(data).execute()


async def _mark_failed(url: str, existing: Optional[dict], error_message: str, crawl_job_id: Optional[UUID] = None) -> None:
    """Record a failed ingestion attempt independently of whether a
    knowledge_documents row exists yet (Requirement 4.3)."""
    retry_count = (existing.get("retry_count", 0) if existing else 0) + 1
    data = {
        "url": url,
        "status": "failed",
        "retry_count": retry_count,
        "error_message": error_message,
        "last_attempted_at": _now_iso(),
        "updated_at": _now_iso(),
    }
    if crawl_job_id:
        data["last_crawl_job_id"] = str(crawl_job_id)
    if existing:
        supabase.table("scraped_pages").update(data).eq("url", url).execute()
    else:
        data["checksum"] = None
        supabase.table("scraped_pages").insert(data).execute()


async def ingest_page(
    url: str,
    title: str,
    main_text: str,
    structured_fields: List[StructuredField],
    description: str = "",
    crawl_job_id: Optional[UUID] = None,
) -> ScrapedPageOutcome:
    """
    Bridge a successfully-fetched-and-extracted scraped page into the
    existing knowledge base pipeline.

    1. Empty `main_text` (after boilerplate removal) -> record
       `scraped_pages.status='skipped'`, exclude from indexing
       (Requirement 3.5).
    2. Compute `checksum = compute_document_checksum(main_text)` and look up
       the `scraped_pages` row by `url`.
    3. Unchanged checksum on a row that is already `status='indexed'` ->
       skip re-indexing, update only `last_attempted_at` (Requirements
       6.1, 6.2).
    4. New url or changed checksum -> create/reuse a `knowledge_documents`
       row (`source='scraper'`), create a new
       `knowledge_document_versions` row, queue `index_document_task` in
       the background (not awaited to completion), then update
       `scraped_pages` regardless of whether that background indexing
       later succeeds or fails (Requirement 6.3).
    5. Metadata passed to `index_document_task` always includes
       `source_url` and `source="scraper"` (Requirement 6.4).
    6. Any exception raised while creating/queueing is caught here so a
       single page's failure never propagates out of `ingest_page` and
       stops the rest of the crawl (Requirement 4.3); `scraped_pages` is
       updated with `status='failed'`, an incremented `retry_count`, and
       the error message.
    """
    existing = await _get_scraped_page(url)

    if not main_text or not main_text.strip():
        await _mark_skipped_empty(url, existing, crawl_job_id)
        return ScrapedPageOutcome(
            url=url,
            outcome="skipped",
            knowledge_document_id=(
                UUID(existing["knowledge_document_id"])
                if existing and existing.get("knowledge_document_id")
                else None
            ),
            error_message=None,
        )

    checksum = compute_document_checksum(main_text)

    if (
        existing
        and existing.get("checksum") == checksum
        and existing.get("status") == "indexed"
    ):
        await _mark_unchanged(existing, crawl_job_id)
        return ScrapedPageOutcome(
            url=url,
            outcome="skipped",
            knowledge_document_id=(
                UUID(existing["knowledge_document_id"])
                if existing.get("knowledge_document_id")
                else None
            ),
            error_message=None,
        )

    try:
        if existing and existing.get("knowledge_document_id"):
            document_id = UUID(existing["knowledge_document_id"])
            # Requirement 6.5: keep the Knowledge_Document's description in
            # sync with this page's (possibly changed) Page_Description on
            # every update, not just at creation time.
            await update_document_description(document_id, description or None)
        else:
            doc_record = await create_document_record(
                title=title,
                description=description or None,
                uploader_id=None,
                source="scraper",
            )
            document_id = UUID(doc_record["id"])

        version_number = await _get_next_version_number(document_id)
        version_record = await create_version_record(
            document_id=document_id,
            version_number=version_number,
            checksum=checksum,
            file_size=len(main_text.encode("utf-8")),
            file_type="scraped_html",
            uploader_id=None,
            content=main_text,
        )
        version_id = UUID(version_record["id"])

        # source/source_url are always present so every retrieved chunk can
        # be traced back to the originating bank web page (Requirement 6.4,
        # Property 16). source_description carries the Page_Description
        # (Requirement 8.4) so the RAG_Assistant's context block can include
        # it alongside each retrieved chunk's content and source URL.
        metadata = {
            "source": "scraper",
            "source_url": url,
            "source_title": title,
            "source_description": description or None,
            "structured_fields": [
                {"kind": f.kind, "value": f.value, "raw_span": f.raw_span}
                for f in structured_fields
            ]
            if structured_fields
            else [],
        }

        # Queue indexing in the background without awaiting it: success or
        # failure of the background indexing is tracked independently on
        # `knowledge_document_versions.status` by `index_document_task`'s
        # own existing retry/error handling (Requirement 6.3).
        asyncio.create_task(
            index_document_task(document_id, version_id, main_text, metadata)
        )

        await _upsert_indexed(url, existing, document_id, checksum, crawl_job_id)

        return ScrapedPageOutcome(
            url=url,
            outcome="indexed",
            knowledge_document_id=document_id,
            error_message=None,
        )
    except Exception as exc:  # noqa: BLE001 - a single page must never
        # stop the rest of the crawl (Requirement 4.2/4.3).
        error_message = str(exc)
        logger.error("Failed to ingest scraped page %s: %s", url, error_message)
        await _mark_failed(url, existing, error_message, crawl_job_id)
        existing_document_id = (
            UUID(existing["knowledge_document_id"])
            if existing and existing.get("knowledge_document_id")
            else None
        )
        return ScrapedPageOutcome(
            url=url,
            outcome="failed",
            knowledge_document_id=existing_document_id,
            error_message=error_message,
        )
