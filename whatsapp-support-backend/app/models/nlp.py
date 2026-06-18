from pydantic import BaseModel, Field
from typing import List, Optional
from app.models.enums import IntentLabel, LanguageLabel, EntityLabel

class NLPEntity(BaseModel):
    label: EntityLabel
    raw_value: str
    normalized_value: str
    start_index: int
    end_index: int
    is_masked: bool = False

class NLPResult(BaseModel):
    # Intent info
    intent: IntentLabel
    intent_confidence: float
    
    # Language info
    language: LanguageLabel
    language_confidence: float
    requires_confirmation: bool = False
    
    # Entity info
    entities: List[NLPEntity] = []
    
    # System info
    model_version: str = "v1.0.0"
    inference_time_ms: int = 0
    fallback_triggered: bool = False
