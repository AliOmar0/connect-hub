"""
Backfill cleaned Q&A knowledge extracted from real WhatsApp support chat
transcripts (whatsapp-support-backend/dataset_pib/*.pdf) into the
admin-managed knowledge base pipeline (Supabase `knowledge_documents`/
`knowledge_document_versions` + Qdrant vector index).

`dataset_pib/` contains raw chat-export PDFs (customer name, phone number,
full message-by-message transcript) plus operational analytics spreadsheets
(agent heat maps, response times, break logs). Only the 3 PDF transcripts
contain reusable banking knowledge; the rest is reporting data, not content
suitable for a customer-facing RAG assistant.

Each transcript was manually reviewed and distilled into one clean
Q&A-style document with all PII (customer names, phone numbers, OTP codes,
account numbers, account balances) removed, stored in
app/dataset/pib_chat_transcripts_extracted.json. This script indexes those
distilled documents the same way scripts/backfill_json_dataset.py indexes
the scraped web dataset: one knowledge_documents row per entry, one version,
indexed into Qdrant via the same index_document() used by the real upload
endpoint. Existing skip_if_unchanged=True checksum dedup means re-running
this script is safe.

Usage (from whatsapp-support-backend/):
    python -m scripts.backfill_chat_transcripts
    python -m scripts.backfill_chat_transcripts --force   # re-index even if already present
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
logger = logging.getLogger("backfill_chat_transcripts")

DATASET_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "app", "dataset", "pib_chat_transcripts_extracted.json",
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
        "file_type": "chat_transcript_extract",
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


async def backfill(skip_existing_titles: bool = True) -> None:
    if not os.path.exists(DATASET_PATH):
        logger.error(f"Dataset not found at {DATASET_PATH}")
        return

    with open(DATASET_PATH, "r", encoding="utf-8") as f:
        entries = json.load(f)

    logger.info(f"Loaded {len(entries)} entr(y/ies) from {DATASET_PATH}")
    init_qdrant()

    existing_titles = set()
    if skip_existing_titles:
        try:
            resp = supabase.table("knowledge_documents").select("title").execute()
            existing_titles = {row["title"] for row in (resp.data or [])}
        except Exception as e:
            logger.warning(f"Could not fetch existing titles (continuing anyway): {e}")

    indexed, skipped, failed = 0, 0, 0

    for i, entry in enumerate(entries, 1):
        title = (entry.get("title") or f"Untitled transcript {i}").strip()
        url = entry.get("url", "")
        content = (entry.get("content") or "").strip()

        if not content or len(content) < 20:
            logger.warning(f"[{i}/{len(entries)}] Skipping '{title}' — empty/too-short content")
            skipped += 1
            continue

        if title in existing_titles:
            logger.info(f"[{i}/{len(entries)}] Skipping '{title}' — already backfilled")
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
                    "file_type": "chat_transcript_extract",
                    "checksum": checksum,
                },
            )

            if was_duplicate_content:
                await _mark_indexed(document_id, version_id, 0)
                logger.info(f"[{i}/{len(entries)}] '{title}' — duplicate content, catalog entry created")
            elif num_chunks > 0:
                await _mark_indexed(document_id, version_id, num_chunks)
                logger.info(f"[{i}/{len(entries)}] '{title}' — indexed {num_chunks} chunk(s)")
            else:
                await _mark_failed(document_id, version_id, "No chunks produced")
                logger.error(f"[{i}/{len(entries)}] '{title}' — indexing produced 0 chunks")
                failed += 1
                continue

            indexed += 1
        except Exception as e:
            logger.error(f"[{i}/{len(entries)}] Failed to backfill '{title}': {e}")
            failed += 1

    logger.info(
        f"Backfill complete: {indexed} indexed, {skipped} skipped, {failed} failed "
        f"(out of {len(entries)} total entries)."
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Backfill cleaned chat-transcript Q&A knowledge into the KB pipeline."
    )
    parser.add_argument(
        "--force", action="store_true",
        help="Re-create documents even if a document with the same title already exists.",
    )
    args = parser.parse_args()

    asyncio.run(backfill(skip_existing_titles=not args.force))
