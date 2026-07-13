"""
RAG (Retrieval-Augmented Generation) Module for Knowledge Base.
Implements FR-03.03 and FR-06 requirements.

Features:
- Semantic vector search using Qdrant
- Document chunking with overlap
- PDF/text ingestion with validation
- Top-k=3 retrieval with 0.75 cosine similarity threshold
- PII redaction for compliance
- 150-word maximum enforcement
- Retrieval logging and metrics
- Fallback integration with JSON knowledge base
- Document deduplication via checksum
"""
import os
import re
import uuid
import hashlib
import logging
import time
import json
from typing import List, Optional, Dict, Any, Tuple
from dataclasses import dataclass, field
from datetime import datetime

# Vector database
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance, VectorParams, PointStruct, Filter, FieldCondition,
    MatchValue, OptimizersConfigDiff, HnswConfigDiff
)
from qdrant_client.http.exceptions import UnexpectedResponse

# Embeddings - using sentence-transformers for local embeddings
try:
    from sentence_transformers import SentenceTransformer
    EMBEDDINGS_AVAILABLE = True
except ImportError:
    EMBEDDINGS_AVAILABLE = False

# PDF processing
try:
    import PyPDF2
    PDF_AVAILABLE = True
except ImportError:
    PDF_AVAILABLE = False

from app.core.config import settings
from app.core.pii import redact_pii, redact_pii_with_log

logger = logging.getLogger(__name__)

# Constants
DEFAULT_CHUNK_SIZE = 300  # words
DEFAULT_CHUNK_OVERLAP = 50  # words
EMBEDDING_DIMENSION = 384  # all-MiniLM-L6-v2 dimension
MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB
WORD_LIMIT = 150
JSON_KNOWLEDGE_BASE_PATH = os.path.join(os.path.dirname(__file__), "..", "dataset", "bank_dataset_web.json")


@dataclass
class RetrievedChunk:
    """Represents a retrieved document chunk with metadata."""
    id: str
    document_id: str
    chunk_index: int
    content: str
    score: float
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class RetrievalResult:
    """Complete retrieval result with logging info."""
    chunks: List[RetrievedChunk]
    query_redacted: str
    total_latency_ms: float
    threshold_used: float
    fallback_triggered: bool
    logged_to_db: bool = False


class RAGConfig:
    """Configuration for RAG system from settings."""
    
    @property
    def qdrant_url(self) -> Optional[str]:
        return getattr(settings, 'QDRANT_URL', None)
    
    @property
    def qdrant_storage_path(self) -> str:
        return getattr(settings, 'QDRANT_STORAGE_PATH', './qdrant_storage')
    
    @property
    def qdrant_collection(self) -> str:
        return getattr(settings, 'QDRANT_COLLECTION', 'pib_knowledge')
    
    @property
    def top_k(self) -> int:
        return getattr(settings, 'RAG_TOP_K', 3)
    
    @property
    def similarity_threshold(self) -> float:
        return getattr(settings, 'RAG_SIMILARITY_THRESHOLD', 0.75)
    
    @property
    def max_upload_bytes(self) -> int:
        return getattr(settings, 'RAG_MAX_UPLOAD_BYTES', MAX_UPLOAD_SIZE_BYTES)


rag_config = RAGConfig()


# ---------------------------------------------------------------------------
# JSON Knowledge Base Fallback (used when RAG has no results or embeddings unavailable)
# ---------------------------------------------------------------------------
_json_knowledge_base: Optional[List[Dict[str, Any]]] = None

def _load_json_knowledge_base() -> List[Dict[str, Any]]:
    """Load the JSON knowledge base for fallback retrieval."""
    global _json_knowledge_base
    
    if _json_knowledge_base is not None:
        return _json_knowledge_base
    
    try:
        if os.path.exists(JSON_KNOWLEDGE_BASE_PATH):
            with open(JSON_KNOWLEDGE_BASE_PATH, "r", encoding="utf-8") as f:
                _json_knowledge_base = json.load(f)
            logger.info(f"Loaded JSON knowledge base: {len(_json_knowledge_base)} pages from {JSON_KNOWLEDGE_BASE_PATH}")
        else:
            logger.warning(f"JSON knowledge base not found at {JSON_KNOWLEDGE_BASE_PATH}")
            _json_knowledge_base = []
    except Exception as e:
        logger.error(f"Error loading JSON knowledge base: {e}")
        _json_knowledge_base = []
    
    return _json_knowledge_base


def retrieve_from_json_knowledge_base(query: str, top_n: int = 3) -> List[Dict[str, Any]]:
    """
    Retrieve relevant documents from JSON knowledge base using keyword matching.
    This serves as a fallback when vector search is unavailable or returns no results.
    
    Args:
        query: Search query
        top_n: Maximum number of results
        
    Returns:
        List of matching documents with title, url, content, and score
    """
    dataset = _load_json_knowledge_base()
    if not dataset or not query:
        return []
    
    query_lower = query.lower().strip()
    matches = []
    
    for item in dataset:
        score = 0
        title = item.get("title", "").lower()
        content = item.get("content", "").lower()
        
        # Exact phrase match in title (highest boost)
        if query_lower in title:
            score += 100
        
        # Exact phrase match in content
        if query_lower in content:
            score += 50
        
        # Individual word matches
        words = query_lower.split()
        for word in words:
            if len(word) < 2:
                continue
            
            if word in title:
                score += 20
            if word in content:
                score += 10
        
        if score > 0:
            matches.append({
                "title": item.get("title", ""),
                "url": item.get("url", ""),
                "content": item.get("content", ""),
                "score": score,
                "source": "json_kb"
            })
    
    # Sort by score descending
    matches.sort(key=lambda x: x["score"], reverse=True)
    
    # Deduplicate by URL
    seen_urls = set()
    unique_matches = []
    for match in matches:
        url = match.get("url")
        if url not in seen_urls:
            seen_urls.add(url)
            unique_matches.append(match)
            if len(unique_matches) >= top_n:
                break
    
    return unique_matches


class EmbeddingModel:
    """Singleton wrapper for embedding model."""
    _instance = None
    _model = None
    
    @classmethod
    def get_model(cls):
        if cls._instance is None:
            if not EMBEDDINGS_AVAILABLE:
                raise ImportError(
                    "sentence-transformers not installed. "
                    "Install with: pip install sentence-transformers"
                )
            cls._instance = cls()
            # Use a multilingual model that supports Arabic well
            model_name = getattr(settings, 'EMBEDDING_MODEL', 'paraphrase-multilingual-MiniLM-L12-v2')
            logger.info(f"Loading embedding model: {model_name}")
            cls._model = SentenceTransformer(model_name)
            logger.info("Embedding model loaded successfully")
        return cls._model


def embed(texts: List[str]) -> List[List[float]]:
    """
    Generate embeddings for a list of texts.
    
    Args:
        texts: List of text strings to embed
        
    Returns:
        List of embedding vectors
    """
    if not texts:
        return []
    
    model = EmbeddingModel.get_model()
    embeddings = model.encode(texts, convert_to_numpy=True, show_progress_bar=False)
    return embeddings.tolist()


def embed_single(text: str) -> List[float]:
    """Generate embedding for a single text."""
    return embed([text])[0] if text else []


# Global Qdrant client
_qdrant_client: Optional[QdrantClient] = None
_qdrant_healthy: bool = False


def _get_client() -> QdrantClient:
    """Get or create Qdrant client with health check and reconnection."""
    global _qdrant_client, _qdrant_healthy
    
    if _qdrant_client is None:
        if rag_config.qdrant_url:
            # Remote Qdrant instance
            _qdrant_client = QdrantClient(url=rag_config.qdrant_url)
            logger.info(f"Connected to remote Qdrant at {rag_config.qdrant_url}")
        else:
            # Local file-based storage
            storage_path = rag_config.qdrant_storage_path
            os.makedirs(storage_path, exist_ok=True)
            _qdrant_client = QdrantClient(path=storage_path)
            logger.info(f"Using local Qdrant storage at {storage_path}")
    
    # Health check - verify connection is still alive
    try:
        _qdrant_client.get_collections()
        _qdrant_healthy = True
    except Exception as e:
        logger.warning(f"Qdrant health check failed: {e}. Attempting reconnection...")
        _qdrant_healthy = False
        # Try to reconnect
        try:
            if rag_config.qdrant_url:
                _qdrant_client = QdrantClient(url=rag_config.qdrant_url)
            else:
                _qdrant_client = QdrantClient(path=rag_config.qdrant_storage_path)
            _qdrant_client.get_collections()  # Verify reconnection
            _qdrant_healthy = True
            logger.info("Qdrant reconnected successfully")
        except Exception as reconnect_error:
            logger.error(f"Qdrant reconnection failed: {reconnect_error}")
            _qdrant_client = None
            raise RuntimeError(f"Qdrant connection unavailable: {reconnect_error}")
    
    return _qdrant_client


def init_qdrant() -> None:
    """
    Initialize Qdrant collection if it doesn't exist.
    This acts as the migration/initialization script.
    """
    client = _get_client()
    collection_name = rag_config.qdrant_collection
    
    try:
        # Check if collection exists
        client.get_collection(collection_name)
        logger.info(f"Collection '{collection_name}' already exists")
    except (UnexpectedResponse, ValueError):
        # Collection doesn't exist, create it. The remote/HTTP client raises
        # UnexpectedResponse (404); the local/embedded client raises ValueError
        # ("Collection ... not found"). Handle both so first-run init works.
        logger.info(f"Creating collection '{collection_name}'")
        
        client.create_collection(
            collection_name=collection_name,
            vectors_config=VectorParams(
                size=EMBEDDING_DIMENSION,
                distance=Distance.COSINE,
            ),
            optimizers_config=OptimizersConfigDiff(
                indexing_threshold=100,  # Start indexing after 100 points
            ),
            hnsw_config=HnswConfigDiff(
                m=16,
                ef_construct=100,
            )
        )
        logger.info(f"Collection '{collection_name}' created successfully")
        
        # Create payload indexes for efficient filtering
        client.create_payload_index(
            collection_name=collection_name,
            field_name="document_id",
            field_schema="keyword"
        )
        client.create_payload_index(
            collection_name=collection_name,
            field_name="chunk_index",
            field_schema="integer"
        )
        logger.info("Payload indexes created")


def chunk_text(
    text: str,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
    overlap: int = DEFAULT_CHUNK_OVERLAP
) -> List[str]:
    """
    Split text into overlapping chunks by words.
    
    Args:
        text: Input text to chunk
        chunk_size: Maximum words per chunk
        overlap: Number of words to overlap between chunks
        
    Returns:
        List of text chunks
    """
    if not text:
        return []
    
    # Normalize whitespace and split into words
    words = text.split()
    
    if len(words) <= chunk_size:
        return [text]
    
    chunks = []
    start = 0
    
    while start < len(words):
        end = start + chunk_size
        chunk_words = words[start:end]
        chunks.append(' '.join(chunk_words))
        
        # Move start forward, accounting for overlap
        start = end - overlap
        
        if end >= len(words):
            break
    
    return chunks


def compute_document_checksum(text: str) -> str:
    """
    Compute SHA-256 checksum for document content.
    Used for deduplication to prevent re-indexing unchanged documents.
    """
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def check_document_exists_by_checksum(checksum: str) -> Optional[str]:
    """
    Check if a document with the given checksum already exists.
    
    Returns:
        Existing document_id if found, None otherwise
    """
    client = _get_client()
    collection_name = rag_config.qdrant_collection
    
    try:
        # Search for documents with this checksum
        filter_obj = Filter(
            must=[
                FieldCondition(
                    key="content_checksum",
                    match=MatchValue(value=checksum)
                )
            ]
        )
        
        result = client.scroll(
            collection_name=collection_name,
            scroll_filter=filter_obj,
            limit=1,
            with_payload=True
        )
        
        if result[0]:
            return result[0][0].payload.get("document_id")
    except Exception as e:
        logger.debug(f"Checksum check error (collection may not exist): {e}")
    
    return None


def index_document(
    document_id: str,
    text: str,
    metadata: Optional[Dict[str, Any]] = None,
    skip_if_unchanged: bool = True
) -> Tuple[int, bool]:
    """
    Index a document into the vector store.
    
    Args:
        document_id: Unique identifier for the document
        text: Full text content of the document
        metadata: Optional metadata to store with each chunk
        skip_if_unchanged: Skip indexing if document with same content exists
        
    Returns:
        Tuple of (number of chunks indexed, was_skipped_due_to_checksum)
    """
    if not text:
        logger.warning(f"Empty text for document {document_id}")
        return 0, False
    
    # Check for duplicate content
    if skip_if_unchanged:
        checksum = compute_document_checksum(text)
        existing_doc_id = check_document_exists_by_checksum(checksum)
        if existing_doc_id:
            logger.info(
                f"Document with identical content already exists (id={existing_doc_id}). "
                f"Skipping indexing of {document_id}"
            )
            return 0, True
    
    client = _get_client()
    collection_name = rag_config.qdrant_collection
    init_qdrant()
    
    # Compute checksum for this version
    content_checksum = compute_document_checksum(text)
    
    # Chunk the text
    chunks = chunk_text(text)
    
    if not chunks:
        return 0, False
    
    # Generate embeddings for all chunks at once (batch is faster)
    embeddings = embed(chunks)
    
    # Create points for Qdrant
    points = []
    for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
        point_id = str(uuid.uuid4())
        payload = {
            "document_id": document_id,
            "chunk_index": i,
            "content": chunk,
            "total_chunks": len(chunks),
            "content_checksum": content_checksum,
            "indexed_at": datetime.utcnow().isoformat(),
            **(metadata or {})
        }
        
        points.append(PointStruct(
            id=point_id,
            vector=embedding,
            payload=payload
        ))
    
    # Upsert to Qdrant
    try:
        client.upsert(
            collection_name=collection_name,
            points=points
        )
    except Exception as e:
        logger.error(f"Qdrant upsert failed for document {document_id}: {e}")
        raise RuntimeError(f"Failed to index document into Qdrant: {e}")
    
    # Verify persistence - confirm points were written
    try:
        total_points = client.count(
            collection_name=collection_name,
            exact=True
        )
        logger.info(f"✅ Verified {len(points)} chunks indexed for document {document_id}. Total points in collection: {total_points.count} (checksum: {content_checksum[:12]}...)")
    except Exception as e:
        logger.warning(f"Could not verify Qdrant persistence for {document_id}: {e}")
    
    return len(points), False


def delete_document_chunks(document_id: str) -> int:
    """
    Delete all chunks for a document.
    
    Args:
        document_id: Document ID to delete chunks for
        
    Returns:
        Number of points deleted
    """
    client = _get_client()
    collection_name = rag_config.qdrant_collection
    
    try:
        # Filter by document_id
        filter_obj = Filter(
            must=[
                FieldCondition(
                    key="document_id",
                    match=MatchValue(value=document_id)
                )
            ]
        )
        
        # Get count first
        result = client.scroll(
            collection_name=collection_name,
            scroll_filter=filter_obj,
            limit=10000,
            with_payload=False
        )
        count = len(result[0])
        
        # Delete
        client.delete(
            collection_name=collection_name,
            points_selector=filter_obj
        )
        
        logger.info(f"Deleted {count} chunks for document {document_id}")
        return count
        
    except Exception as e:
        logger.error(f"Error deleting chunks for {document_id}: {e}")
        return 0


def retrieve(
    query: str,
    top_k: int = None,
    threshold: float = None,
    document_ids: Optional[List[str]] = None
) -> List[RetrievedChunk]:
    """
    Retrieve relevant chunks for a query using semantic search.
    
    IMPORTANT: This is NOT naive substring matching. It uses vector
    embeddings and cosine similarity for semantic retrieval.
    
    Args:
        query: Search query
        top_k: Maximum number of results (default from config)
        threshold: Minimum similarity score (default from config)
        document_ids: Optional filter to specific documents
        
    Returns:
        List of RetrievedChunk objects sorted by score descending
    """
    if not query:
        return []
    
    # Graceful degradation: when the optional embeddings stack
    # (sentence-transformers) isn't installed, skip vector retrieval instead of
    # raising. The assistant still works using the JSON knowledge base injected
    # in llm.py; install sentence-transformers to enable document RAG search.
    if not EMBEDDINGS_AVAILABLE:
        logger.warning(
            "RAG retrieval skipped: sentence-transformers not installed. "
            "Answering without document context."
        )
        return []
    
    top_k = top_k or rag_config.top_k
    threshold = threshold or rag_config.similarity_threshold
    
    client = _get_client()
    collection_name = rag_config.qdrant_collection
    
    # Generate query embedding
    query_embedding = embed_single(query)
    
    # Build filter if document_ids specified
    filter_obj = None
    if document_ids:
        filter_obj = Filter(
            should=[
                FieldCondition(
                    key="document_id",
                    match=MatchValue(value=doc_id)
                )
                for doc_id in document_ids
            ]
        )
    
    try:
        # Search
        results = client.search(
            collection_name=collection_name,
            query_vector=query_embedding,
            limit=top_k * 2,  # Get more to filter by threshold
            query_filter=filter_obj,
            with_payload=True
        )
        
        # Filter by threshold and build result list
        chunks = []
        for result in results:
            if result.score >= threshold:
                chunk = RetrievedChunk(
                    id=str(result.id),
                    document_id=result.payload.get("document_id", ""),
                    chunk_index=result.payload.get("chunk_index", 0),
                    content=result.payload.get("content", ""),
                    score=result.score,
                    metadata={
                        k: v for k, v in result.payload.items()
                        if k not in ["document_id", "chunk_index", "content"]
                    }
                )
                chunks.append(chunk)
        
        # Sort by score descending (Qdrant returns in order, but let's be explicit)
        chunks.sort(key=lambda x: x.score, reverse=True)
        
        # Return only top_k
        return chunks[:top_k]
        
    except Exception as e:
        logger.error(f"Retrieval error: {e}")
        return []


def retrieve_with_logging(
    query: str,
    top_k: int = None,
    threshold: float = None,
    document_ids: Optional[List[str]] = None,
    session_id: Optional[str] = None
) -> RetrievalResult:
    """
    Retrieve with full logging and PII redaction.
    
    Args:
        query: Search query
        top_k: Maximum number of results
        threshold: Minimum similarity score
        document_ids: Optional filter to specific documents
        session_id: Optional session ID for logging
        
    Returns:
        RetrievalResult with all metadata for logging
    """
    start_time = time.time()
    
    # Redact PII from query for logging
    query_redacted, pii_log = redact_pii_with_log(query)
    
    if pii_log:
        logger.info(f"PII detected in query: {pii_log}")
    
    # Perform retrieval
    chunks = retrieve(query, top_k, threshold, document_ids)
    
    # Calculate latency
    latency_ms = (time.time() - start_time) * 1000
    
    # Build result
    result = RetrievalResult(
        chunks=chunks,
        query_redacted=query_redacted,
        total_latency_ms=latency_ms,
        threshold_used=threshold or rag_config.similarity_threshold,
        fallback_triggered=len(chunks) == 0
    )
    
    # Log retrieval
    log_retrieval(result, session_id)
    
    return result


def log_retrieval(result: RetrievalResult, session_id: Optional[str] = None) -> None:
    """
    Log retrieval details for audit and metrics.
    
    Args:
        result: RetrievalResult to log
        session_id: Optional session ID
    """
    log_entry = {
        "timestamp": datetime.utcnow().isoformat(),
        "query_redacted": result.query_redacted,
        "num_results": len(result.chunks),
        "document_ids": [c.document_id for c in result.chunks],
        "scores": [c.score for c in result.chunks],
        "latency_ms": result.total_latency_ms,
        "threshold": result.threshold_used,
        "fallback": result.fallback_triggered,
        "session_id": session_id
    }
    
    logger.info(f"RAG Retrieval: {log_entry}")
    
    # Persist to database for FR-06 compliance
    # Best-effort; suppress failures so retrieval never blocks
    try:
        from app.database import supabase
        supabase.table("rag_retrieval_logs").insert(log_entry).execute()
    except ImportError:
        pass  # Supabase client not yet available (module-level init)
    except Exception as e:
        # e.g., table not created or connection error
        logger.warning(f"Failed to persist RAG log to database: {e}")


def enforce_word_limit(text: str, limit: int = WORD_LIMIT) -> str:
    """
    Enforce maximum word limit on text.
    Adds an ellipsis indicator if truncated.
    
    IMPORTANT: This enforces the limit in application code,
    not just in the LLM prompt.
    
    Args:
        text: Input text
        limit: Maximum words allowed
        
    Returns:
        Text truncated to word limit if necessary
    """
    if not text:
        return text
    
    words = text.split()
    
    if len(words) <= limit:
        return text
    
    # Truncate and add indicator
    truncated = ' '.join(words[:limit])
    # Add a subtle indicator in Arabic
    truncated += " …"
    
    return truncated


def build_context_block(
    chunks: List[RetrievedChunk],
    max_words_per_chunk: int = WORD_LIMIT
) -> str:
    """
    Build a context block from retrieved chunks for LLM injection.
    
    Args:
        chunks: List of retrieved chunks
        max_words_per_chunk: Maximum words per chunk (enforced in code)
        
    Returns:
        Formatted context block string
    """
    if not chunks:
        # Fallback with escalation offer
        return (
            "\n\n=== معلومات إضافية من قاعدة المعرفة ===\n"
            "لم يتم العثور على معلومات ذات صلة في قاعدة المعرفة.\n"
            "هل تودّ التحدث مع موظف؟ يمكنني تحويلك للمساعدة البشرية.\n"
        )
    
    context = "\n\n=== معلومات إضافية من قاعدة المعرفة (Knowledge Base) ===\n"
    
    for i, chunk in enumerate(chunks, 1):
        # Enforce word limit in application code
        content = enforce_word_limit(chunk.content, max_words_per_chunk)
        
        context += f"\n--- نتيجة {i} (درجة التطابق: {chunk.score:.2%}) ---\n"
        context += f"{content}\n"
    
    context += "\n---\n"
    context += "ملاحظة: المعلومات أعلاه من قاعدة المعرفة الرسمية للبنك.\n"
    
    return context


def extract_text_from_pdf(file_content: bytes) -> str:
    """
    Extract text from a PDF file.
    
    Args:
        file_content: Raw PDF file bytes
        
    Returns:
        Extracted text content
        
    Raises:
        ImportError: If PyPDF2 not installed
        ValueError: If text extraction fails
    """
    if not PDF_AVAILABLE:
        raise ImportError(
            "PyPDF2 not installed. Install with: pip install PyPDF2"
        )
    
    import io
    
    try:
        pdf_reader = PyPDF2.PdfReader(io.BytesIO(file_content))
        text_parts = []
        
        for page in pdf_reader.pages:
            text = page.extract_text()
            if text:
                text_parts.append(text)
        
        return '\n\n'.join(text_parts)
        
    except Exception as e:
        raise ValueError(f"Failed to extract text from PDF: {e}")


def calculate_checksum(content: bytes) -> str:
    """Calculate SHA-256 checksum for a file."""
    return hashlib.sha256(content).hexdigest()


def validate_file_for_ingestion(
    filename: str,
    content: bytes,
    max_size_bytes: int = None
) -> Tuple[bool, str, str]:
    """
    Validate a file for ingestion.
    
    Args:
        filename: Original filename
        content: File content bytes
        max_size_bytes: Maximum file size (default from config)
        
    Returns:
        Tuple of (is_valid, error_message, file_type)
    """
    max_size = max_size_bytes or rag_config.max_upload_bytes
    
    # Check file size
    if len(content) > max_size:
        return False, f"File exceeds maximum size of {max_size / (1024*1024):.1f} MB", ""
    
    # Check file type
    ext = os.path.splitext(filename)[1].lower()
    
    if ext == '.pdf':
        return True, "", "pdf"
    elif ext in ['.txt', '.text']:
        return True, "", "text"
    elif ext == '.md':
        return True, "", "markdown"
    elif ext == '.json':
        return True, "", "json"
    else:
        return False, f"Unsupported file type: {ext}. Supported: .pdf, .txt, .md, .json", ""


def retrieve_with_audit(
    query: str,
    session_id: Optional[str] = None,
    top_k: int = None,
    threshold: float = None,
    use_json_fallback: bool = True,
) -> Tuple[List[RetrievedChunk], bool]:
    """
    Audited retrieval used by the decision engine.
    
    Wraps :func:`retrieve_with_logging` (PII-redacted logging + metrics) and
    returns a simple ``(chunks, fallback_triggered)`` tuple. ``fallback_triggered``
    is True when no chunk cleared the similarity threshold, signalling the
    decision engine to escalate rather than answer without grounding.
    
    When RAG returns no results and use_json_fallback=True, falls back to
    JSON knowledge base keyword matching for graceful degradation.
    
    Args:
        query: Search query
        session_id: Optional session ID for logging
        top_k: Maximum number of results
        threshold: Minimum similarity score
        use_json_fallback: Whether to use JSON KB fallback when RAG fails
        
    Returns:
        Tuple of (chunks, fallback_triggered)
    """
    result = retrieve_with_logging(
        query, top_k=top_k, threshold=threshold, session_id=session_id
    )
    
    # If RAG returned results, use them
    if result.chunks:
        return result.chunks, result.fallback_triggered
    
    # RAG returned no results - try JSON knowledge base fallback
    if use_json_fallback:
        logger.info(f"RAG returned no results. Falling back to JSON knowledge base for query: {query[:50]}...")
        json_results = retrieve_from_json_knowledge_base(query, top_n=top_k or rag_config.top_k)
        
        if json_results:
            # Convert JSON results to RetrievedChunk format
            chunks = []
            for i, item in enumerate(json_results):
                # Normalize scores to 0-1 range for consistency
                normalized_score = min(item.get("score", 50) / 100, 1.0)
                
                chunk = RetrievedChunk(
                    id=f"json_kb_{i}",
                    document_id=item.get("url", "unknown"),
                    chunk_index=0,
                    content=item.get("content", ""),
                    score=normalized_score,
                    metadata={
                        "title": item.get("title", ""),
                        "url": item.get("url", ""),
                        "source": "json_kb_fallback"
                    }
                )
                chunks.append(chunk)
            
            logger.info(f"JSON knowledge base fallback returned {len(chunks)} results")
            return chunks, False  # fallback_triggered=False since we have results
    
    # No results from either source
    return result.chunks, True


# Migration/Initialization script
def run_migration():
    """Run the RAG migration to set up Qdrant collection."""
    logger.info("Running RAG migration...")
    init_qdrant()
    logger.info("RAG migration complete")
    return True


if __name__ == "__main__":
    # Run migration when called directly
    run_migration()
