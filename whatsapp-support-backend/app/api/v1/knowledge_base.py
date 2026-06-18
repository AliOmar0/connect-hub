"""
app/api/v1/knowledge_base.py
═══════════════════════════════════════════════════════════════════════════════
Knowledge Base API Endpoints (FR-06 Compliant)
──────────────────────────────────────────────
• Upload PDF/TXT (validation: <=5MB, type checks, duplicate checksum prevention)
• List & View Documents
• Version History & Rollback
• Re-index
• Status Polling
• RAG Reports (Relevance, Latency)
═══════════════════════════════════════════════════════════════════════════════
"""

import asyncio
import hashlib
import io
import logging
import os
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel

from app.core.config import settings
from app.core.rag import delete_document_chunks, index_document
from app.database import get_supabase

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/knowledge-base", tags=["knowledge-base"])


# ─── Pydantic Schemas ────────────────────────────────────────────────────────

class DocumentResponse(BaseModel):
    id: uuid.UUID
    filename: str
    file_type: str
    checksum: str
    status: str
    error_message: Optional[str]
    word_count: int
    chunk_count: int
    created_at: str
    updated_at: str

class RollbackRequest(BaseModel):
    target_version_id: uuid.UUID


# ─── Helper Functions ────────────────────────────────────────────────────────

def _extract_text(file_bytes: bytes, file_type: str) -> str:
    """Extract text from PDF or TXT bytes."""
    if file_type == "txt":
        try:
            return file_bytes.decode("utf-8")
        except UnicodeDecodeError:
            return file_bytes.decode("latin-1")
    elif file_type == "pdf":
        import PyPDF2
        try:
            pdf = PyPDF2.PdfReader(io.BytesIO(file_bytes))
            text = ""
            for page in pdf.pages:
                extracted = page.extract_text()
                if extracted:
                    text += extracted + "\n"
            return text
        except Exception as e:
            raise ValueError(f"Failed to read PDF: {e}")
    else:
        raise ValueError(f"Unsupported file type: {file_type}")


async def _process_document_background(
    doc_id: str,
    file_bytes: bytes,
    file_type: str,
    filename: str,
    supabase: Any
) -> None:
    """
    Background task:
    1. Extract text.
    2. Index via RAG engine.
    3. Update Supabase with success/failure and version record.
    """
    try:
        # 1. Update status to indexing
        supabase.table("knowledge_documents").update({
            "status": "indexing"
        }).eq("id", doc_id).execute()

        # 2. Extract text
        content = _extract_text(file_bytes, file_type)
        if not content.strip():
            raise ValueError("Extracted document is empty.")

        # 3. Index to Qdrant
        metadata = {"filename": filename, "file_type": file_type}
        idx_result = index_document(doc_id=doc_id, content=content, metadata=metadata)

        if not idx_result.success:
            raise ValueError(idx_result.error)

        # 4. Get next version number
        # Note: In a highly concurrent env, you'd want a safer monotonic increment.
        # This is sufficient for background processing per doc.
        versions_res = supabase.table("knowledge_document_versions").select("version").eq("document_id", doc_id).order("version", desc=True).limit(1).execute()
        next_version = 1
        if versions_res.data:
            next_version = versions_res.data[0]["version"] + 1

        # Calculate checksum for the version (using file bytes)
        checksum = hashlib.sha256(file_bytes).hexdigest()

        # 5. Insert version record
        version_data = {
            "document_id": doc_id,
            "version": next_version,
            "checksum": checksum,
            "status": "indexed"
        }
        supabase.table("knowledge_document_versions").insert(version_data).execute()

        # 6. Update document record
        supabase.table("knowledge_documents").update({
            "status": "indexed",
            "word_count": idx_result.word_count,
            "chunk_count": idx_result.chunk_count,
            "error_message": None
        }).eq("id", doc_id).execute()

        logger.info(f"[KB] Background processing successful for doc={doc_id}")

    except Exception as e:
        logger.error(f"[KB] Background processing failed for doc={doc_id}: {e}")
        supabase.table("knowledge_documents").update({
            "status": "failed",
            "error_message": str(e)
        }).eq("id", doc_id).execute()


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.post("/upload", response_model=DocumentResponse, status_code=status.HTTP_202_ACCEPTED)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    supabase: Any = Depends(get_supabase)
):
    """
    Upload a PDF or TXT file to the Knowledge Base.
    Validates size (<= 5MB), type, and checks for duplicates.
    Processing happens in the background.
    """
    # 1. Type validation
    file_type = ""
    filename = file.filename.lower()
    if filename.endswith(".pdf") or file.content_type == "application/pdf":
        file_type = "pdf"
    elif filename.endswith(".txt") or file.content_type == "text/plain":
        file_type = "txt"
    else:
        raise HTTPException(status_code=400, detail="Only PDF and TXT files are supported.")

    # 2. Read and Size validation
    file_bytes = await file.read()
    if len(file_bytes) > settings.RAG_MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"File exceeds {settings.RAG_MAX_UPLOAD_BYTES / (1024*1024):.1f}MB limit.")

    # 3. Checksum deduplication
    checksum = hashlib.sha256(file_bytes).hexdigest()
    dup_res = supabase.table("knowledge_documents").select("id, status").eq("checksum", checksum).in_("status", ["pending", "indexing", "indexed"]).execute()
    if dup_res.data:
        raise HTTPException(status_code=409, detail="Document with identical content already exists.")

    # 4. Create initial DB record
    # Note: Authentication context (uploader_id) would ideally be extracted from a JWT token.
    # We omit it here or assume a service token.
    doc_data = {
        "filename": file.filename,
        "file_type": file_type,
        "checksum": checksum,
        "status": "pending"
    }
    
    insert_res = supabase.table("knowledge_documents").insert(doc_data).execute()
    if not insert_res.data:
        raise HTTPException(status_code=500, detail="Failed to create document record.")
    
    doc_record = insert_res.data[0]
    doc_id = doc_record["id"]

    # 5. Spawn background task
    background_tasks.add_task(
        _process_document_background,
        doc_id=doc_id,
        file_bytes=file_bytes,
        file_type=file_type,
        filename=file.filename,
        supabase=supabase
    )

    return doc_record


@router.get("/", response_model=List[DocumentResponse])
async def list_documents(supabase: Any = Depends(get_supabase)):
    """List all knowledge base documents."""
    res = supabase.table("knowledge_documents").select("*").order("created_at", desc=True).execute()
    return res.data


@router.get("/{doc_id}", response_model=DocumentResponse)
async def get_document(doc_id: uuid.UUID, supabase: Any = Depends(get_supabase)):
    """Get single document details."""
    res = supabase.table("knowledge_documents").select("*").eq("id", str(doc_id)).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Document not found.")
    return res.data[0]


@router.get("/{doc_id}/versions")
async def get_document_versions(doc_id: uuid.UUID, supabase: Any = Depends(get_supabase)):
    """Get version history for a document."""
    res = supabase.table("knowledge_document_versions").select("*").eq("document_id", str(doc_id)).order("version", desc=True).execute()
    return res.data


@router.get("/{doc_id}/status")
async def get_document_status(doc_id: uuid.UUID, supabase: Any = Depends(get_supabase)):
    """Lightweight poll for document status."""
    res = supabase.table("knowledge_documents").select("status, error_message").eq("id", str(doc_id)).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Document not found.")
    return res.data[0]


@router.post("/{doc_id}/rollback")
async def rollback_document(
    doc_id: uuid.UUID,
    req: RollbackRequest,
    supabase: Any = Depends(get_supabase)
):
    """
    Rollback to a previous version.
    1. Mark document as rolling_back.
    2. Delete current chunks from Qdrant.
    3. (In a real system, you'd fetch the old file bytes from object storage to re-index).
       Since we don't have object storage mapped in this specific setup, we just mark status and delete chunks
       to represent the state transition, or return 501 Not Implemented if full file storage isn't available.
    """
    # Verify doc exists
    doc_res = supabase.table("knowledge_documents").select("*").eq("id", str(doc_id)).execute()
    if not doc_res.data:
        raise HTTPException(status_code=404, detail="Document not found.")

    # Call SQL function
    rpc_res = supabase.rpc("rollback_document_version", {"p_document_id": str(doc_id), "p_target_ver_id": str(req.target_version_id)}).execute()
    
    # Delete from vector DB
    delete_document_chunks(str(doc_id))

    # Note: Full re-index of the old version requires access to the original bytes.
    # Assuming object storage integration is needed for full restoration.
    return {"message": "Rollback initiated. Chunks removed. Requires re-upload of target version bytes in this architecture."}


@router.post("/{doc_id}/reindex", status_code=status.HTTP_202_ACCEPTED)
async def reindex_document(
    doc_id: uuid.UUID,
    supabase: Any = Depends(get_supabase)
):
    """
    Triggers re-indexing.
    In this design, requires the file bytes. Since we don't persist files locally,
    this endpoint serves as a placeholder for a system where files are in S3/Supabase Storage.
    """
    raise HTTPException(status_code=501, detail="Re-index requires object storage integration to fetch original bytes.")


@router.get("/reports/relevance")
async def report_relevance(supabase: Any = Depends(get_supabase)):
    """RAG Relevance stats from the SQL view."""
    res = supabase.table("rag_relevance_report").select("*").execute()
    return res.data


@router.get("/reports/latency")
async def report_latency(supabase: Any = Depends(get_supabase)):
    """RAG Latency stats from the SQL view."""
    res = supabase.table("rag_latency_report").select("*").execute()
    return res.data
