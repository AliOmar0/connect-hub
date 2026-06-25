"""
OpenAPI snapshot for the AI surface (NLP, decision, assistant).

Builds a FastAPI app from ONLY the AI routers — which have no Supabase
dependency — so the snapshot reproduces in a clean environment without DB
credentials. Writes ``evidence/openapi.json`` and a compact
``evidence/api_examples.json``.

The description documents the authentication posture and error contract so the
snapshot accurately reflects auth, errors, and the typed decision outputs.

    python -m evaluation.openapi_snapshot
"""
from __future__ import annotations

import json
import os

from fastapi import FastAPI

from evaluation import config
from evaluation.utils import ensure_evidence_dir, utc_now

API_DESCRIPTION = """
AI / policy surface of the PIB support backend.

Authentication: these endpoints are internal service endpoints intended to run
behind the API gateway / private network. They do not require a per-request
token today; the public WhatsApp/Twilio webhooks (not included in this AI
snapshot) are authenticated via provider signature verification. Add a gateway
API key before exposing publicly.

Errors: 422 is returned for malformed request bodies (FastAPI validation); 500
for model/backend failures. Decision outputs are strongly typed (see
ActionDecision and the response schemas).
""".strip()


def build_ai_app() -> FastAPI:
    from app.api.v1.nlp import router as nlp_router
    from app.api.v1.decision import router as decision_router
    from app.api.v1.assistant import router as assistant_router

    app = FastAPI(
        title="PIB Support — AI/Policy API",
        version=config.SUITE_VERSION,
        description=API_DESCRIPTION,
    )
    app.include_router(nlp_router, prefix="/api/v1", tags=["nlp"])
    app.include_router(decision_router, prefix="/api/v1", tags=["decision"])
    app.include_router(assistant_router, prefix="/api/v1", tags=["assistant"])
    return app


def generate() -> dict:
    ensure_evidence_dir()
    app = build_ai_app()
    schema = app.openapi()
    schema["x-snapshot-generated-at"] = utc_now()

    out_path = os.path.join(config.EVIDENCE_DIR, "openapi.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(schema, f, ensure_ascii=False, indent=2)

    # Compact examples extracted from request/response schemas.
    examples = {}
    for name, comp in schema.get("components", {}).get("schemas", {}).items():
        ex = comp.get("examples") or ([comp["example"]] if "example" in comp else None)
        if ex:
            examples[name] = ex
    examples_path = os.path.join(config.EVIDENCE_DIR, "api_examples.json")
    with open(examples_path, "w", encoding="utf-8") as f:
        json.dump({
            "generated_at": utc_now(),
            "paths": sorted(schema.get("paths", {}).keys()),
            "schema_examples": examples,
        }, f, ensure_ascii=False, indent=2)

    return {
        "openapi_file": out_path,
        "examples_file": examples_path,
        "paths": sorted(schema.get("paths", {}).keys()),
    }


if __name__ == "__main__":
    info = generate()
    print(f"OpenAPI snapshot: {info['openapi_file']}")
    print(f"API examples:     {info['examples_file']}")
    print("Paths:")
    for p in info["paths"]:
        print(f"  - {p}")
