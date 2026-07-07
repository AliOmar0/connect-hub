"""
Backfill app/dataset/bank_dataset_web.json into the admin-managed knowledge
base pipeline (Supabase `knowledge_documents`/`knowledge_document_versions` +
Qdrant vector index), so the KnowledgePage UI shows real data and RAG
retrieval (DecisionEngine.evaluate -> retrieve_with_audit) can find these
pages via vector search instead of only the keyword-matching JSON fallback.

This does NOT remove the JSON fallback (app/core/llm.py._find_context and
app/core/rag.py.retrieve_from_json_knowledge_base) — both continue to work as
a safety net if Qdrant is ever down. It simply gives the "real" pipeline the
same 137 pages to index for real.

Each JSON entry becomes one `knowledge_documents` row (title = page title,
description = source URL) with one version, indexed into Qdrant via the same
index_document() used by the actual upload endpoint. Existing
skip_if_unchanged=True checksum dedup means re-running this script is safe —
already-indexed content is skipped rather than duplicated.

Usage (from whatsapp-support-backend/):
    python -m scripts.backfill_json_dataset
    python -m scripts.backfill_json_dataset --limit 5   # dry-run a subset
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import sys
from uuid import uuid4
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import supabase
from app.core.rag import (
    index_document,
    calculate_checksum,
    init_qdrant,
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("backfill_json_dataset")

DATASET_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "app", "dataset", "bank_dataset_web.json",
)


async def _create_document_record(title: str, description: str) -> dict:
    data = {
        "id": str(uuid4()),
        "title": title,
        "description": description,
        "status": "pending",
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    }
    response = supabase.table("knowledge_documents").insert(data).execute()
    if response.data:
        return response.data[0]
    raise RuntimeError(f"Failed to create document record for '{title}'")


async def _create_version_record(document_id: str, checksum: str, file_size: int) -> dict:
    data = {
        "id": str(uuid4()),
        "document_id": document_id,
        "version_number": 1,
        "checksum": checksum,
        "file_size": file_size,
        "file_type": "json_kb_entry",
        "status": "pending",
        "created_at": datetime.utcnow().isoformat(),
    }
    response = supabase.table("knowledge_document_versions").insert(data).execute()
    if response.data:
        return response.data[0]
    raise RuntimeError(f"Failed to create version record for document {document_id}")


async def _mark_indexed(document_id: str, version_id: str, num_chunks: int) -> None:
    now = datetime.utcnow().isoformat()
    supabase.table("knowledge_document_versions").update({
        "status": "indexed",
        "indexed_chunks": num_chunks,
        "indexed_at": now,
    }).eq("id", version_id).execute()
    supabase.table("knowledge_documents").update({
        "status": "indexed",
        "current_version_id": version_id,
        "updated_at": now,
    }).eq("id", document_id).execute()


async def _mark_failed(document_id: str, version_id: str, error: str) -> None:
    supabase.table("knowledge_document_versions").update({
        "status": "failed",
        "error_message": error[:500],
    }).eq("id", version_id).execute()
    supabase.table("knowledge_documents").update({
        "status": "failed",
        "updated_at": datetime.utcnow().isoformat(),
    }).eq("id", document_id).execute()


async def backfill(limit: int = None, skip_existing_titles: bool = True) -> None:
    if not os.path.exists(DATASET_PATH):
        logger.error(f"Dataset not found at {DATASET_PATH}")
        return

    with open(DATASET_PATH, "r", encoding="utf-8") as f:
        pages = json.load(f)

    if limit:
        pages = pages[:limit]

    logger.info(f"Loaded {len(pages)} page(s) from {DATASET_PATH}")
    init_qdrant()

    existing_titles = set()
    if skip_existing_titles:
        try:
            resp = supabase.table("knowledge_documents").select("title").execute()
            existing_titles = {row["title"] for row in (resp.data or [])}
        except Exception as e:
            logger.warning(f"Could not fetch existing titles (continuing anyway): {e}")

    indexed, skipped, failed = 0, 0, 0

    for i, page in enumerate(pages, 1):
        title = (page.get("title") or f"Untitled page {i}").strip()
        url = page.get("url", "")
        content = (page.get("content") or "").strip()

        if not content or len(content) < 20:
            logger.warning(f"[{i}/{len(pages)}] Skipping '{title}' — empty/too-short content")
            skipped += 1
            continue

        if title in existing_titles:
            logger.info(f"[{i}/{len(pages)}] Skipping '{title}' — already backfilled")
            skipped += 1
            continue

        try:
            doc = await _create_document_record(title=title, description=url)
            document_id = doc["id"]

            checksum = calculate_checksum(content.encode("utf-8"))
            version = await _create_version_record(document_id, checksum, len(content.encode("utf-8")))
            version_id = version["id"]

            num_chunks, was_duplicate_content = index_document(
                document_id=document_id,
                text=content,
                metadata={
                    "title": title,
                    "source_title": title,
                    "source_url": url,
                    "file_type": "json_kb_entry",
                    "checksum": checksum,
                },
            )

            if was_duplicate_content:
                # Identical content already indexed under another document —
                # still record this as its own catalog entry, just with 0
                # newly-indexed chunks (the existing Qdrant points serve both).
                await _mark_indexed(document_id, version_id, 0)
                logger.info(f"[{i}/{len(pages)}] '{title}' — duplicate content, catalog entry created")
            elif num_chunks > 0:
                await _mark_indexed(document_id, version_id, num_chunks)
                logger.info(f"[{i}/{len(pages)}] '{title}' — indexed {num_chunks} chunk(s)")
            else:
                await _mark_failed(document_id, version_id, "No chunks produced")
                logger.error(f"[{i}/{len(pages)}] '{title}' — indexing produced 0 chunks")
                failed += 1
                continue

            indexed += 1
        except Exception as e:
            logger.error(f"[{i}/{len(pages)}] Failed to backfill '{title}': {e}")
            failed += 1

    logger.info(
        f"Backfill complete: {indexed} indexed, {skipped} skipped, {failed} failed "
        f"(out of {len(pages)} total pages)."
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill bank_dataset_web.json into the KB pipeline.")
    parser.add_argument("--limit", type=int, default=None, help="Only process the first N pages (for a dry run).")
    parser.add_argument(
        "--force", action="store_true",
        help="Re-create documents even if a document with the same title already exists.",
    )
    args = parser.parse_args()

    asyncio.run(backfill(limit=args.limit, skip_existing_titles=not args.force))
