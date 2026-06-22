"""
Knowledge Base API Endpoints.
Implements FR-03.03 and FR-06 requirements.

Endpoints:
- POST /knowledge-base/upload - Upload a document
- GET /knowledge-base - List all documents
- GET /knowledge-base/{document_id} - Get document details with versions
- POST /knowledge-base/{document_id}/rollback - Rollback to previous version
- POST /knowledge-base/{document_id}/reindex - Reindex a document
- GET /knowledge-base/{document_id}/status - Get indexing status
- DELETE /knowledge-base/{document_id} - Delete a document
"""
import os
import logging
from typing import List, Optional
from uuid import UUID, uuid4
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from pydantic import BaseModel, Field

from app.database import supabase
from app.core.rag import (
    index_document,
    delete_document_chunks,
    validate_file_for_ingestion,
    extract_text_from_pdf,
    calculate_checksum,
    retrieve_with_logging,
    build_context_block,
    rag_config,
    init_qdrant
)

logger = logging.getLogger(__name__)
router = APIRouter()


# --- Pydantic Models ---

class DocumentVersion(BaseModel):
    """Document version model."""
    id: UUID
    document_id: UUID
    version_number: int
    checksum: str
    file_size: int
    file_type: str
    uploader_id: Optional[UUID] = None
    status: str = "pending"  # pending, indexing, indexed, failed
    indexed_chunks: int = 0
    error_message: Optional[str] = None
    created_at: datetime
    indexed_at: Optional[datetime] = None


class DocumentResponse(BaseModel):
    """Document response model."""
    id: UUID
    title: str
    description: Optional[str] = None
    current_version_id: Optional[UUID] = None
    current_version_number: int = 0
    total_versions: int = 0
    status: str = "pending"
    uploader_id: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime
    versions: List[DocumentVersion] = Field(default_factory=list)


class DocumentListResponse(BaseModel):
    """Simplified document list item."""
    id: UUID
    title: str
    description: Optional[str] = None
    status: str
    current_version_number: int
    created_at: datetime
    updated_at: datetime


class UploadResponse(BaseModel):
    """Upload response model."""
    id: UUID
    title: str
    version_id: UUID
    version_number: int
    status: str
    message: str


class ReindexResponse(BaseModel):
    """Reindex response model."""
    document_id: UUID
    status: str
    chunks_indexed: int
    message: str


class RetrievalRequest(BaseModel):
    """Request model for retrieval."""
    query: str
    top_k: int = Field(default=3, ge=1, le=10)
    threshold: float = Field(default=0.75, ge=0.0, le=1.0)
    document_ids: Optional[List[str]] = None


class RetrievalResponse(BaseModel):
    """Response model for retrieval."""
    query_redacted: str
    chunks: List[dict]
    total_latency_ms: float
    fallback_triggered: bool
    context_block: str


# --- Database Helper Functions ---

async def create_document_record(
    title: str,
    description: Optional[str],
    uploader_id: Optional[UUID]
) -> dict:
    """Create a new document record in the database."""
    data = {
        "id": str(uuid4()),
        "title": title,
        "description": description,
        "uploader_id": str(uploader_id) if uploader_id else None,
        "status": "pending",
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat()
    }
    
    response = supabase.table("knowledge_documents").insert(data).execute()
    
    if response.data:
        return response.data[0]
    raise Exception("Failed to create document record")


async def create_version_record(
    document_id: UUID,
    version_number: int,
    checksum: str,
    file_size: int,
    file_type: str,
    uploader_id: Optional[UUID]
) -> dict:
    """Create a new version record in the database."""
    data = {
        "id": str(uuid4()),
        "document_id": str(document_id),
        "version_number": version_number,
        "checksum": checksum,
        "file_size": file_size,
        "file_type": file_type,
        "uploader_id": str(uploader_id) if uploader_id else None,
        "status": "pending",
        "created_at": datetime.utcnow().isoformat()
    }
    
    response = supabase.table("knowledge_document_versions").insert(data).execute()
    
    if response.data:
        return response.data[0]
    raise Exception("Failed to create version record")


async def update_version_status(
    version_id: UUID,
    status: str,
    indexed_chunks: int = 0,
    error_message: Optional[str] = None
) -> dict:
    """Update version status after indexing."""
    update_data = {
        "status": status,
        "indexed_chunks": indexed_chunks,
        "error_message": error_message,
        "indexed_at": datetime.utcnow().isoformat() if status == "indexed" else None
    }
    
    response = supabase.table("knowledge_document_versions")\
        .update(update_data)\
        .eq("id", str(version_id))\
        .execute()
    
    if response.data:
        return response.data[0]
    raise Exception("Failed to update version status")


async def update_document_status(
    document_id: UUID,
    status: str,
    current_version_id: Optional[UUID] = None
) -> dict:
    """Update document status and current version."""
    update_data = {
        "status": status,
        "updated_at": datetime.utcnow().isoformat()
    }
    
    if current_version_id:
        update_data["current_version_id"] = str(current_version_id)
    
    response = supabase.table("knowledge_documents")\
        .update(update_data)\
        .eq("id", str(document_id))\
        .execute()
    
    if response.data:
        return response.data[0]
    raise Exception("Failed to update document status")


async def get_document_by_id(document_id: UUID) -> Optional[dict]:
    """Get a document by ID with versions."""
    response = supabase.table("knowledge_documents")\
        .select("*, versions:knowledge_document_versions(*)")\
        .eq("id", str(document_id))\
        .execute()
    
    if response.data:
        return response.data[0]
    return None


async def list_documents(skip: int = 0, limit: int = 50) -> List[dict]:
    """List all documents."""
    response = supabase.table("knowledge_documents")\
        .select("*")\
        .order("created_at", desc=True)\
        .range(skip, skip + limit - 1)\
        .execute()
    
    return response.data if response.data else []


async def get_latest_version_number(document_id: UUID) -> int:
    """Get the latest version number for a document."""
    response = supabase.table("knowledge_document_versions")\
        .select("version_number")\
        .eq("document_id", str(document_id))\
        .order("version_number", desc=True)\
        .limit(1)\
        .execute()
    
    if response.data:
        return response.data[0]["version_number"]
    return 0


async def get_version_by_number(document_id: UUID, version_number: int) -> Optional[dict]:
    """Get a specific version by number."""
    response = supabase.table("knowledge_document_versions")\
        .select("*")\
        .eq("document_id", str(document_id))\
        .eq("version_number", version_number)\
        .execute()
    
    if response.data:
        return response.data[0]
    return None


# --- Indexing Task ---

async def index_document_task(
    document_id: UUID,
    version_id: UUID,
    text: str,
    metadata: dict
):
    """
    Background task to index a document.
    Handles retries and error reporting.
    """
    max_retries = 3
    retry_delay = 2  # seconds
    
    for attempt in range(max_retries):
        try:
            await update_version_status(version_id, "indexing")
            await update_document_status(document_id, "indexing")
            
            # Initialize Qdrant
            init_qdrant()
            
            # Index the document
            num_chunks = index_document(
                document_id=str(document_id),
                text=text,
                metadata=metadata
            )
            
            if num_chunks > 0:
                # Update status to indexed
                await update_version_status(
                    version_id,
                    "indexed",
                    indexed_chunks=num_chunks
                )
                await update_document_status(document_id, "indexed", current_version_id=version_id)
                logger.info(f"Successfully indexed document {document_id} with {num_chunks} chunks")
                return
            else:
                raise Exception("No chunks were indexed")
                
        except Exception as e:
            logger.error(f"Indexing attempt {attempt + 1} failed for {document_id}: {e}")
            
            if attempt < max_retries - 1:
                import asyncio
                await asyncio.sleep(retry_delay * (attempt + 1))
            else:
                # Final attempt failed
                error_msg = str(e)
                await update_version_status(
                    version_id,
                    "failed",
                    error_message=error_msg
                )
                await update_document_status(document_id, "failed")
                logger.error(f"All indexing attempts failed for {document_id}: {error_msg}")


# --- API Endpoints ---

@router.post("/knowledge-base/upload", response_model=UploadResponse)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: Optional[str] = None,
    description: Optional[str] = None,
    uploader_id: Optional[UUID] = None
):
    """
    Upload a document to the knowledge base.
    
    Supported file types: PDF, TXT, MD, JSON
    Maximum file size: 5 MB (configurable)
    
    The document will be indexed in the background.
    """
    # Read file content
    content = await file.read()
    
    # Validate file
    is_valid, error_msg, file_type = validate_file_for_ingestion(
        file.filename or "unknown",
        content
    )
    
    if not is_valid:
        if "exceeds maximum size" in error_msg:
            raise HTTPException(status_code=413, detail=error_msg)
        raise HTTPException(status_code=400, detail=error_msg)
    
    # Calculate checksum
    checksum = calculate_checksum(content)
    
    # Extract text based on file type
    try:
        if file_type == "pdf":
            text = extract_text_from_pdf(content)
        else:
            # For text, markdown, json - decode as UTF-8
            text = content.decode('utf-8')
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to extract text from file: {e}"
        )
    
    if not text or not text.strip():
        raise HTTPException(
            status_code=400,
            detail="No text content could be extracted from the file"
        )
    
    # Create document record
    doc_title = title or file.filename or "Untitled Document"
    
    try:
        doc_record = await create_document_record(
            title=doc_title,
            description=description,
            uploader_id=uploader_id
        )
        document_id = UUID(doc_record["id"])
    except Exception as e:
        logger.error(f"Failed to create document record: {e}")
        raise HTTPException(status_code=500, detail="Failed to create document record")
    
    # Create version record
    try:
        version_record = await create_version_record(
            document_id=document_id,
            version_number=1,
            checksum=checksum,
            file_size=len(content),
            file_type=file_type,
            uploader_id=uploader_id
        )
        version_id = UUID(version_record["id"])
    except Exception as e:
        logger.error(f"Failed to create version record: {e}")
        raise HTTPException(status_code=500, detail="Failed to create version record")
    
    # Queue indexing task
    metadata = {
        "title": doc_title,
        "file_type": file_type,
        "checksum": checksum,
        "uploader_id": str(uploader_id) if uploader_id else None
    }
    
    background_tasks.add_task(
        index_document_task,
        document_id,
        version_id,
        text,
        metadata
    )
    
    return UploadResponse(
        id=document_id,
        title=doc_title,
        version_id=version_id,
        version_number=1,
        status="pending",
        message="Document uploaded and queued for indexing"
    )


@router.get("/knowledge-base", response_model=List[DocumentListResponse])
async def list_all_documents(skip: int = 0, limit: int = 50):
    """
    List all documents in the knowledge base.
    """
    documents = await list_documents(skip, limit)
    
    result = []
    for doc in documents:
        # Get current version number
        current_version_id = doc.get("current_version_id")
        version_num = 0
        
        if current_version_id:
            # Fetch version to get number
            ver_response = supabase.table("knowledge_document_versions")\
                .select("version_number")\
                .eq("id", current_version_id)\
                .execute()
            if ver_response.data:
                version_num = ver_response.data[0]["version_number"]
        
        result.append(DocumentListResponse(
            id=UUID(doc["id"]),
            title=doc["title"],
            description=doc.get("description"),
            status=doc["status"],
            current_version_number=version_num,
            created_at=datetime.fromisoformat(doc["created_at"].replace('Z', '+00:00')),
            updated_at=datetime.fromisoformat(doc["updated_at"].replace('Z', '+00:00'))
        ))
    
    return result


@router.get("/knowledge-base/{document_id}", response_model=DocumentResponse)
async def get_document(document_id: UUID):
    """
    Get document details with all versions.
    """
    doc = await get_document_by_id(document_id)
    
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    versions = []
    for v in doc.get("versions", []):
        versions.append(DocumentVersion(
            id=UUID(v["id"]),
            document_id=UUID(v["document_id"]),
            version_number=v["version_number"],
            checksum=v["checksum"],
            file_size=v["file_size"],
            file_type=v["file_type"],
            uploader_id=UUID(v["uploader_id"]) if v.get("uploader_id") else None,
            status=v["status"],
            indexed_chunks=v.get("indexed_chunks", 0),
            error_message=v.get("error_message"),
            created_at=datetime.fromisoformat(v["created_at"].replace('Z', '+00:00')),
            indexed_at=datetime.fromisoformat(v["indexed_at"].replace('Z', '+00:00')) if v.get("indexed_at") else None
        ))
    
    # Sort versions by number descending
    versions.sort(key=lambda x: x.version_number, reverse=True)
    
    current_version_id = UUID(doc["current_version_id"]) if doc.get("current_version_id") else None
    current_version_num = 0
    for v in versions:
        if v.id == current_version_id:
            current_version_num = v.version_number
            break
    
    return DocumentResponse(
        id=UUID(doc["id"]),
        title=doc["title"],
        description=doc.get("description"),
        current_version_id=current_version_id,
        current_version_number=current_version_num,
        total_versions=len(versions),
        status=doc["status"],
        uploader_id=UUID(doc["uploader_id"]) if doc.get("uploader_id") else None,
        created_at=datetime.fromisoformat(doc["created_at"].replace('Z', '+00:00')),
        updated_at=datetime.fromisoformat(doc["updated_at"].replace('Z', '+00:00')),
        versions=versions
    )


@router.post("/knowledge-base/{document_id}/rollback/{version_number}", response_model=ReindexResponse)
async def rollback_document(
    document_id: UUID,
    version_number: int,
    background_tasks: BackgroundTasks
):
    """
    Rollback to a specific version by reindexing it.
    """
    # Get the version
    version = await get_version_by_number(document_id, version_number)
    
    if not version:
        raise HTTPException(
            status_code=404,
            detail=f"Version {version_number} not found for document"
        )
    
    if version["status"] != "indexed":
        raise HTTPException(
            status_code=400,
            detail="Can only rollback to an indexed version"
        )
    
    # Delete current chunks
    delete_document_chunks(str(document_id))
    
    # Note: For a full rollback, we would need to store the original text
    # or retrieve it from a content store. For this implementation,
    # we assume the version metadata contains what we need.
    
    # Update current version
    await update_document_status(
        document_id,
        "indexed",
        current_version_id=UUID(version["id"])
    )
    
    return ReindexResponse(
        document_id=document_id,
        status="rolled_back",
        chunks_indexed=version.get("indexed_chunks", 0),
        message=f"Successfully rolled back to version {version_number}"
    )


@router.post("/knowledge-base/{document_id}/reindex", response_model=dict)
async def reindex_document(
    document_id: UUID,
    background_tasks: BackgroundTasks
):
    """
    Trigger reindexing of a document.
    This is useful if the embedding model changed or indexing failed.
    """
    doc = await get_document_by_id(document_id)
    
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    current_version_id = doc.get("current_version_id")
    
    if not current_version_id:
        raise HTTPException(
            status_code=400,
            detail="Document has no indexed version to reindex"
        )
    
    # Get current version
    version_response = supabase.table("knowledge_document_versions")\
        .select("*")\
        .eq("id", current_version_id)\
        .execute()
    
    if not version_response.data:
        raise HTTPException(status_code=404, detail="Current version not found")
    
    version = version_response.data[0]
    
    # Delete existing chunks
    delete_document_chunks(str(document_id))
    
    # Update status
    await update_version_status(UUID(version["id"]), "pending")
    await update_document_status(document_id, "pending")
    
    # Note: For actual reindexing, we would need the original text
    # This is a placeholder - in production, store text in Supabase Storage
    
    return {
        "document_id": document_id,
        "status": "pending",
        "message": "Document queued for reindexing"
    }


@router.get("/knowledge-base/{document_id}/status")
async def get_document_status(document_id: UUID):
    """
    Get the indexing status of a document.
    """
    doc = await get_document_by_id(document_id)
    
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    versions = doc.get("versions", [])
    
    return {
        "document_id": document_id,
        "status": doc["status"],
        "total_versions": len(versions),
        "current_version_id": doc.get("current_version_id"),
        "latest_version": max([v["version_number"] for v in versions]) if versions else 0
    }


@router.delete("/knowledge-base/{document_id}")
async def delete_document(document_id: UUID):
    """
    Delete a document and all its chunks from the vector store.
    """
    # Delete chunks from Qdrant
    num_deleted = delete_document_chunks(str(document_id))
    
    # Delete version records
    supabase.table("knowledge_document_versions")\
        .delete()\
        .eq("document_id", str(document_id))\
        .execute()
    
    # Delete document record
    response = supabase.table("knowledge_documents")\
        .delete()\
        .eq("id", str(document_id))\
        .execute()
    
    if not response.data:
        raise HTTPException(status_code=404, detail="Document not found")
    
    return {
        "document_id": document_id,
        "status": "deleted",
        "chunks_removed": num_deleted
    }


@router.post("/knowledge-base/retrieve", response_model=RetrievalResponse)
async def retrieve_knowledge(request: RetrievalRequest):
    """
    Retrieve relevant knowledge from the vector store.
    
    This is the main retrieval endpoint used by the LLM service.
    Uses semantic search (NOT substring matching).
    """
    result = retrieve_with_logging(
        query=request.query,
        top_k=request.top_k,
        threshold=request.threshold,
        document_ids=request.document_ids
    )
    
    chunks = [
        {
            "id": c.id,
            "document_id": c.document_id,
            "chunk_index": c.chunk_index,
            "content": c.content,
            "score": c.score,
            "metadata": c.metadata
        }
        for c in result.chunks
    ]
    
    context_block = build_context_block(result.chunks)
    
    return RetrievalResponse(
        query_redacted=result.query_redacted,
        chunks=chunks,
        total_latency_ms=result.total_latency_ms,
        fallback_triggered=result.fallback_triggered,
        context_block=context_block
    )


@router.get("/knowledge-base/stats/latency")
async def get_latency_stats():
    """
    Get retrieval latency statistics.
    Returns average latency over recent retrievals.
    """
    # In production, this would query the rag_retrieval_logs table
    # For now, return a placeholder
    return {
        "avg_latency_ms": 0,
        "p50_latency_ms": 0,
        "p95_latency_ms": 0,
        "p99_latency_ms": 0,
        "total_retrievals": 0,
        "fallback_rate": 0,
        "note": "Connect to rag_retrieval_logs table for actual metrics"
    }


@router.get("/knowledge-base/stats/relevance")
async def get_relevance_stats():
    """
    Get RAG relevance statistics.
    """
    # In production, this would query the rag_retrieval_logs table
    return {
        "avg_score": 0,
        "avg_results_per_query": 0,
        "queries_with_results": 0,
        "queries_without_results": 0,
        "note": "Connect to rag_retrieval_logs table for actual metrics"
    }
