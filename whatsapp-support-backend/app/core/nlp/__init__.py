"""
NLP pipeline package.

Public entry point is :data:`app.core.nlp.engine.nlp_engine`, a process-wide
singleton exposing :meth:`NLPEngine.analyze` which returns a fully populated
:class:`app.models.nlp.NLPResult` (intent, language, entities) with confidence
scores and inference metadata.
"""

from app.core.nlp.engine import NLPEngine, nlp_engine

__all__ = ["NLPEngine", "nlp_engine"]
