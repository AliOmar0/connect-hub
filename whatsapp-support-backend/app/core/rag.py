"""
app/core/rag.py
═══════════════════════════════════════════════════════════════════════════════
Real RAG pipeline for PIB Connect-Hub.

Responsibilities
────────────────
• Qdrant initialisation (in-process ↔ remote, auto-detected from settings)
• Sentence-transformer embedding (multilingual, offline)
• Text chunking with word-level overlap
• Document indexing  – chunk → embed → upsert to Qdrant
• Semantic retrieval – embed query → cosine search → 0.75 threshold filter
• Bulk chunk deletion – for rollback / re-index operations
• Context block builder – formats top-3 Arabic knowledge snippets
• PII redactor – strips phone / IBAN / email / ID before audit log
• 150-word enforcer – hard post-LLM cap (FR-03.03)
• RAG audit persistence – writes to rag_audit_log via Supabase

Compliance
──────────
FR-03.03 – Semantic retrieval only; no substring matching anywhere.
FR-06    – Lifecycle tracked: upload, index, version, rollback, re-index.
═══════════════════════════════════════════════════════════════════════════════
"""

from __future__ import annotations

import asyncio
import logging
import re
import time
import uuid
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)

# ─── Lazy singletons ─────────────────────────────────────────────────────────
_qdrant_client = None          # qdrant_client.QdrantClient
_embedding_model = None        # sentence_transformers.SentenceTransformer
_VECTOR_DIM = 384              # MiniLM-L12 dimension


# ══════════════════════════════════════════════════════════════════════════════
# 1. Qdrant initialisation
# ══════════════════════════════════════════════════════════════════════════════

def init_qdrant() -> None:
    """
    Initialise Qdrant client and ensure the collection exists.

    Modes
    ─────
    • QDRANT_URL set  → connect to remote / cloud Qdrant.
    • QDRANT_URL unset → in-process client with local disk persistence
      (QDRANT_STORAGE_PATH, default ``./qdrant_storage``).

    Called once from ``app/main.py`` lifespan startup.
    """
    global _qdrant_client
    from app.core.config import settings
    from qdrant_client import QdrantClient
    from qdrant_client.models import Distance, VectorParams

    try:
        if settings.QDRANT_URL:
            logger.info(f"[RAG] Connecting to remote Qdrant at {settings.QDRANT_URL}")
            _qdrant_client = QdrantClient(
                url=settings.QDRANT_URL,
                api_key=settings.QDRANT_API_KEY or None,
                timeout=30,
            )
        else:
            logger.info(
                f"[RAG] Starting in-process Qdrant "
                f"(path={settings.QDRANT_STORAGE_PATH})"
            )
            _qdrant_client = QdrantClient(path=settings.QDRANT_STORAGE_PATH)

        # Ensure collection exists
        existing = [c.name for c in _qdrant_client.get_collections().collections]
        if settings.QDRANT_COLLECTION not in existing:
            _qdrant_client.create_collection(
                collection_name=settings.QDRANT_COLLECTION,
                vectors_config=VectorParams(
                    size=_VECTOR_DIM,
                    distance=Distance.COSINE,
                ),
            )
            logger.info(
                f"[RAG] Created Qdrant collection '{settings.QDRANT_COLLECTION}'"
            )
        else:
            logger.info(
                f"[RAG] Using existing Qdrant collection "
                f"'{settings.QDRANT_COLLECTION}'"
            )
    except Exception as exc:
        logger.error(f"[RAG] Qdrant init failed: {exc}")
        raise


def _get_client():
    """Return the Qdrant client, initialising if necessary."""
    global _qdrant_client
    if _qdrant_client is None:
        init_qdrant()
    return _qdrant_client


# ══════════════════════════════════════════════════════════════════════════════
# 2. Embedding
# ══════════════════════════════════════════════════════════════════════════════

def _load_embedding_model():
    """Lazy-load the sentence-transformer model (once per process)."""
    global _embedding_model
    if _embedding_model is None:
        from app.core.config import settings
        from sentence_transformers import SentenceTransformer

        logger.info(f"[RAG] Loading embedding model: {settings.EMBEDDING_MODEL}")
        _embedding_model = SentenceTransformer(settings.EMBEDDING_MODEL)
        logger.info("[RAG] Embedding model loaded.")
    return _embedding_model


def embed(texts: List[str]) -> np.ndarray:
    """
    Embed a list of strings.

    Returns
    ───────
    np.ndarray of shape (len(texts), _VECTOR_DIM), dtype float32.
    Raises ValueError on empty input.
    """
    if not texts:
        raise ValueError("embed() called with empty list")
    model = _load_embedding_model()
    vectors = model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
    return vectors.astype(np.float32)


# ══════════════════════════════════════════════════════════════════════════════
# 3. Chunking
# ══════════════════════════════════════════════════════════════════════════════

def chunk_text(
    text: str,
    chunk_size: int = 300,
    overlap: int = 50,
) -> List[str]:
    """
    Word-level chunking with overlap.

    Parameters
    ──────────
    text       : source text (any language)
    chunk_size : target words per chunk
    overlap    : words shared between consecutive chunks

    Returns a list of non-empty string chunks.
    Empty or whitespace-only input returns [].
    """
    if not text or not text.strip():
        return []

    words = text.split()
    if not words:
        return []

    chunks: List[str] = []
    step = max(1, chunk_size - overlap)
    start = 0

    while start < len(words):
        end = min(start + chunk_size, len(words))
        chunk = " ".join(words[start:end])
        if chunk.strip():
            chunks.append(chunk)
        start += step

    return chunks


# ══════════════════════════════════════════════════════════════════════════════
# 4. Indexing
# ══════════════════════════════════════════════════════════════════════════════

@dataclass
class IndexResult:
    doc_id: str
    chunk_count: int
    word_count: int
    success: bool
    error: Optional[str] = None


def index_document(
    doc_id: str,
    content: str,
    metadata: dict | None = None,
    chunk_size: int = 300,
    overlap: int = 50,
) -> IndexResult:
    """
    Chunk → embed → upsert to Qdrant.

    Each Qdrant point carries payload:
        doc_id   : str  – links back to knowledge_documents.id
        chunk_idx: int  – position within document
        text     : str  – the raw chunk text (for context injection)
        **metadata      – any extra fields (filename, version, etc.)

    Returns IndexResult with success flag and counts.
    """
    from app.core.config import settings
    from qdrant_client.models import PointStruct

    metadata = metadata or {}

    try:
        chunks = chunk_text(content, chunk_size=chunk_size, overlap=overlap)
        if not chunks:
            return IndexResult(
                doc_id=doc_id,
                chunk_count=0,
                word_count=0,
                success=False,
                error="No chunks produced (empty content?)",
            )

        vectors = embed(chunks)
        client = _get_client()

        points = [
            PointStruct(
                id=str(uuid.uuid4()),
                vector=vectors[i].tolist(),
                payload={
                    "doc_id": doc_id,
                    "chunk_idx": i,
                    "text": chunks[i],
                    **metadata,
                },
            )
            for i in range(len(chunks))
        ]

        client.upsert(
            collection_name=settings.QDRANT_COLLECTION,
            points=points,
            wait=True,
        )

        word_count = sum(len(c.split()) for c in chunks)
        logger.info(
            f"[RAG] Indexed doc={doc_id}: "
            f"{len(chunks)} chunks, ~{word_count} words"
        )
        return IndexResult(
            doc_id=doc_id,
            chunk_count=len(chunks),
            word_count=word_count,
            success=True,
        )

    except Exception as exc:
        logger.error(f"[RAG] index_document failed for doc={doc_id}: {exc}")
        return IndexResult(doc_id=doc_id, chunk_count=0, word_count=0, success=False, error=str(exc))


# ══════════════════════════════════════════════════════════════════════════════
# 5. Retrieval
# ══════════════════════════════════════════════════════════════════════════════

@dataclass
class RetrievedChunk:
    point_id: str
    doc_id: str
    chunk_idx: int
    text: str
    score: float
    metadata: dict = field(default_factory=dict)


def retrieve(
    query: str,
    top_k: int | None = None,
    threshold: float | None = None,
) -> List[RetrievedChunk]:
    """
    Semantic retrieval — FR-03.03 compliant.

    Steps
    ─────
    1. Embed the query with the same model used for indexing.
    2. Search Qdrant (cosine) with a generous pre-filter (top_k * 3).
    3. Filter results to those whose score ≥ threshold.
    4. Return up to top_k results sorted by score descending.

    Returns [] (never raises) when:
    • Qdrant has no matching documents
    • All candidates fall below threshold
    • An exception occurs (logged)

    Never uses substring / keyword matching. FR-03.03.
    """
    from app.core.config import settings

    if top_k is None:
        top_k = settings.RAG_TOP_K
    if threshold is None:
        threshold = settings.RAG_SIMILARITY_THRESHOLD

    if not query or not query.strip():
        return []

    try:
        query_vec = embed([query.strip()])[0].tolist()
        client = _get_client()

        # Over-fetch to allow threshold filtering
        response = client.query_points(
            collection_name=settings.QDRANT_COLLECTION,
            query=query_vec,
            limit=top_k * 3,
            with_payload=True,
            score_threshold=threshold,  # Qdrant pre-filters at server side too
        )

        results: List[RetrievedChunk] = []
        for hit in response.points:
            if hit.score < threshold:
                continue  # double-guard (some client versions ignore score_threshold)
            payload = hit.payload or {}
            results.append(
                RetrievedChunk(
                    point_id=str(hit.id),
                    doc_id=payload.get("doc_id", ""),
                    chunk_idx=payload.get("chunk_idx", -1),
                    text=payload.get("text", ""),
                    score=round(float(hit.score), 6),
                    metadata={
                        k: v
                        for k, v in payload.items()
                        if k not in ("doc_id", "chunk_idx", "text")
                    },
                )
            )

        # Sort descending by score, cap at top_k
        results.sort(key=lambda r: r.score, reverse=True)
        results = results[:top_k]

        logger.info(
            f"[RAG] retrieve: query='{query[:60]}…' "
            f"→ {len(results)} qualifying results "
            f"(threshold={threshold}, top_k={top_k})"
        )
        return results

    except Exception as exc:
        logger.error(f"[RAG] retrieve failed: {exc}")
        return []


# ══════════════════════════════════════════════════════════════════════════════
# 6. Chunk deletion (rollback / re-index support)
# ══════════════════════════════════════════════════════════════════════════════

def delete_document_chunks(doc_id: str) -> int:
    """
    Delete ALL Qdrant points for a given document ID.

    Returns the number of points deleted (may be 0 if doc was never indexed).
    """
    from app.core.config import settings
    from qdrant_client.models import Filter, FieldCondition, MatchValue

    try:
        client = _get_client()

        # Count first so we can report
        count_result = client.count(
            collection_name=settings.QDRANT_COLLECTION,
            count_filter=Filter(
                must=[FieldCondition(key="doc_id", match=MatchValue(value=doc_id))]
            ),
            exact=True,
        )
        n = count_result.count

        if n > 0:
            client.delete(
                collection_name=settings.QDRANT_COLLECTION,
                points_selector=Filter(
                    must=[FieldCondition(key="doc_id", match=MatchValue(value=doc_id))]
                ),
                wait=True,
            )
            logger.info(f"[RAG] Deleted {n} chunks for doc={doc_id}")
        else:
            logger.warning(f"[RAG] No chunks found to delete for doc={doc_id}")

        return n

    except Exception as exc:
        logger.error(f"[RAG] delete_document_chunks failed for doc={doc_id}: {exc}")
        return 0


# ══════════════════════════════════════════════════════════════════════════════
# 7. Context block builder
# ══════════════════════════════════════════════════════════════════════════════

FALLBACK_AR = (
    "عذراً، لا تتوفر لديّ معلومات كافية للإجابة على هذا السؤال بدقة في الوقت الحالي. "
    "لمساعدتك بشكل أفضل، يُمكنني تحويلك إلى أحد موظفينا المتخصصين. "
    "هل تودّ التحدث مع موظف؟"
)


def build_context_block(chunks: List[RetrievedChunk]) -> str:
    """
    Format retrieved chunks into the Arabic knowledge-base injection block.

    Returns the context string to append to the LLM system prompt.
    When chunks is empty returns the localised fallback + escalation offer.
    """
    if not chunks:
        return f"\n\n=== ملاحظة للنظام ===\n{FALLBACK_AR}\n"

    block = "\n\n=== معلومات إضافية من قاعدة المعرفة (Knowledge Base) ===\n"
    for i, chunk in enumerate(chunks, start=1):
        score_pct = round(chunk.score * 100, 1)
        block += (
            f"المقطع {i} (درجة الصلة: {score_pct}%):\n"
            f"{chunk.text.strip()}\n\n"
        )
    return block


# ══════════════════════════════════════════════════════════════════════════════
# 8. PII redaction
# ══════════════════════════════════════════════════════════════════════════════

# Compiled once at import time
_PII_PATTERNS: List[Tuple[re.Pattern, str]] = [
    # Palestinian / international mobile numbers
    (re.compile(r"\b(\+?970|0)5[024689]\d{7}\b"), "[PHONE]"),
    # Generic international numbers
    (re.compile(r"\b\+\d{7,15}\b"), "[PHONE]"),
    # IBAN (Palestinian PS, and generic)
    (re.compile(r"\bPS\d{2}[A-Z0-9]{4}\d{16}\b", re.I), "[IBAN]"),
    (re.compile(r"\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7,28}\b"), "[IBAN]"),
    # Email addresses
    (re.compile(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+"), "[EMAIL]"),
    # Palestinian national ID (9 digits)
    (re.compile(r"\b\d{9}\b"), "[ID]"),
    # Credit/debit card numbers (groups of 4 digits)
    (re.compile(r"\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b"), "[CARD]"),
]


def redact_pii(text: str) -> str:
    """
    Replace phone numbers, IBANs, emails, ID numbers and card numbers
    with placeholder tokens.  Used before storing anything in rag_audit_log.
    """
    if not text:
        return text
    for pattern, replacement in _PII_PATTERNS:
        text = pattern.sub(replacement, text)
    return text


# ══════════════════════════════════════════════════════════════════════════════
# 9. 150-word limit enforcer (FR-03.03)
# ══════════════════════════════════════════════════════════════════════════════

def enforce_word_limit(text: str, limit: int | None = None) -> str:
    """
    Hard truncate ``text`` to ``limit`` words (default: settings.RAG_MAX_RESPONSE_WORDS = 150).

    If truncation occurs, appends "…" and a localized Arabic continuation hint.
    Arabic words (no spaces inside) are preserved intact; no mid-word cut.
    """
    from app.core.config import settings

    if limit is None:
        limit = settings.RAG_MAX_RESPONSE_WORDS

    if not text:
        return text

    words = text.split()
    if len(words) <= limit:
        return text

    truncated = " ".join(words[:limit])
    truncated += "… (للمزيد من المعلومات، يُرجى التواصل مع أحد موظفينا)"
    logger.debug(f"[RAG] enforce_word_limit: trimmed {len(words)} → {limit} words")
    return truncated


# ══════════════════════════════════════════════════════════════════════════════
# 10. Audit record
# ══════════════════════════════════════════════════════════════════════════════

@dataclass
class RAGAuditRecord:
    query_redacted: str
    retrieved_doc_ids: List[str]
    scores: List[float]
    result_count: int
    model_name: str
    latency_ms: int
    fallback_triggered: bool
    session_id: Optional[str] = None


async def save_rag_audit(record: RAGAuditRecord) -> None:
    """
    Persist a RAGAuditRecord to rag_audit_log via Supabase.
    Non-blocking — called as a background task.  Errors are logged, not raised.
    """
    try:
        from app.database import supabase
        from app.core.config import settings

        payload = {
            "session_id": record.session_id,
            "query_redacted": record.query_redacted,
            "retrieved_doc_ids": record.retrieved_doc_ids,
            "scores": record.scores,
            "result_count": record.result_count,
            "model_name": record.model_name,
            "latency_ms": record.latency_ms,
            "fallback_triggered": record.fallback_triggered,
        }
        # Run synchronous Supabase call in thread pool to avoid blocking event loop
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: supabase.table("rag_audit_log").insert(payload).execute(),
        )
    except Exception as exc:
        logger.error(f"[RAG] save_rag_audit failed: {exc}")


# ══════════════════════════════════════════════════════════════════════════════
# 11. Convenience: full retrieval pipeline with audit
# ══════════════════════════════════════════════════════════════════════════════

async def retrieve_with_audit(
    query: str,
    session_id: Optional[str] = None,
    top_k: int | None = None,
    threshold: float | None = None,
) -> Tuple[List[RetrievedChunk], bool]:
    """
    Run retrieval, fire audit log, return (chunks, fallback_triggered).

    ``fallback_triggered`` is True when result_count == 0.

    This is the single entry-point called by ``llm.get_ai_response()``.
    """
    from app.core.config import settings

    if top_k is None:
        top_k = settings.RAG_TOP_K
    if threshold is None:
        threshold = settings.RAG_SIMILARITY_THRESHOLD

    t0 = time.monotonic()
    chunks = retrieve(query, top_k=top_k, threshold=threshold)
    latency_ms = int((time.monotonic() - t0) * 1000)

    fallback = len(chunks) == 0

    record = RAGAuditRecord(
        query_redacted=redact_pii(query),
        retrieved_doc_ids=[c.doc_id for c in chunks],
        scores=[c.score for c in chunks],
        result_count=len(chunks),
        model_name=settings.EMBEDDING_MODEL,
        latency_ms=latency_ms,
        fallback_triggered=fallback,
        session_id=session_id,
    )
    # Fire-and-forget — do not await here so LLM call is not blocked
    asyncio.create_task(save_rag_audit(record))

    return chunks, fallback
