"""
RAG relevance evaluation: precision@k against the knowledge base.

A retrieved chunk counts as relevant if it contains any of the query's expected
keywords. Reports mean precision@k and the share of queries with at least one
relevant hit (hit-rate).

Degrades gracefully: if the embedding model (sentence-transformers) or an
indexed Qdrant collection is unavailable, the evaluator records a clear
``unavailable`` status with the reason and reproduction steps, rather than
failing the suite.
"""
from __future__ import annotations

import os

from evaluation import config
from evaluation.utils import read_jsonl, base_record, write_csv
from app.core.nlp.normalize import normalize_arabic
from app.core.config import settings

COMMAND = "python -m evaluation.run_all rag"


def _unavailable(reason: str, rows) -> dict:
    record = base_record(
        metric="rag_precision_at_k",
        command=COMMAND,
        dataset={
            "name": "rag_relevance.jsonl",
            "path": os.path.relpath(config.RAG_TEST, config.BACKEND_ROOT),
            "size": len(rows),
            "description": "Banking queries with expected-keyword relevance labels.",
        },
        thresholds={"precision_at_k": config.THRESHOLDS["rag_precision_at_k"]},
        model_versions={"embedding_model": getattr(settings, "EMBEDDING_MODEL", "unknown")},
    )
    record["results"] = {"available": False}
    record["status"] = "unavailable"
    record["limitations"] = (
        f"{reason} To produce this metric: install sentence-transformers, set "
        "QDRANT_* env, ingest the KB via POST /api/v1/knowledge-base/upload (or "
        "index app/dataset/bank_dataset_web.json), then re-run."
    )
    return record


def run() -> dict:
    rows = read_jsonl(config.RAG_TEST)

    try:
        from app.core.rag import retrieve_with_audit, rag_config, EMBEDDINGS_AVAILABLE
    except Exception as exc:  # pragma: no cover
        return _unavailable(f"RAG module import failed: {exc}.", rows)

    if not EMBEDDINGS_AVAILABLE:
        return _unavailable("sentence-transformers is not installed.", rows)

    top_k = rag_config.top_k
    precisions = []
    hits = 0
    csv_rows = []
    try:
        for r in rows:
            chunks, _ = retrieve_with_audit(r["query"])
            expected = [normalize_arabic(k) for k in r.get("expected_keywords", [])]
            relevant = 0
            for c in chunks:
                content = normalize_arabic(getattr(c, "content", ""))
                if any(k and k in content for k in expected):
                    relevant += 1
            denom = max(1, min(top_k, len(chunks))) if chunks else 1
            prec = relevant / denom
            precisions.append(prec)
            if relevant > 0:
                hits += 1
            csv_rows.append({"query": r["query"], "retrieved": len(chunks),
                             "relevant": relevant, "precision_at_k": round(prec, 4)})
    except Exception as exc:  # pragma: no cover
        return _unavailable(f"Retrieval failed (KB likely not indexed): {exc}.", rows)

    if not any(c["retrieved"] for c in csv_rows):
        return _unavailable("No documents retrieved (KB collection empty/not indexed).", rows)

    write_csv("rag_precision.csv", csv_rows,
              ["query", "retrieved", "relevant", "precision_at_k"])

    n = len(rows)
    mean_prec = sum(precisions) / n if n else 0.0
    hit_rate = hits / n if n else 0.0
    threshold = config.THRESHOLDS["rag_precision_at_k"]

    record = base_record(
        metric="rag_precision_at_k",
        command=COMMAND,
        dataset={
            "name": "rag_relevance.jsonl",
            "path": os.path.relpath(config.RAG_TEST, config.BACKEND_ROOT),
            "size": n,
            "description": "Banking queries with expected-keyword relevance labels.",
        },
        thresholds={"precision_at_k": threshold, "top_k": top_k},
        model_versions={"embedding_model": getattr(settings, "EMBEDDING_MODEL", "unknown")},
    )
    record["results"] = {
        "available": True,
        "mean_precision_at_k": round(mean_prec, 4),
        "hit_rate": round(hit_rate, 4),
        "top_k": top_k,
        "per_query_file": "rag_precision.csv",
    }
    record["status"] = "pass" if mean_prec >= threshold else "fail"
    record["limitations"] = (
        "Keyword-overlap relevance is a proxy for human judgement; depends on the "
        "exact KB snapshot indexed at evaluation time."
    )
    return record
