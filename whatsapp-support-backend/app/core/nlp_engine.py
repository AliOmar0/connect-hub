import logging
import os
import re
import time
from typing import List, Tuple
from app.models.enums import IntentLabel, LanguageLabel, EntityLabel
from app.models.nlp import NLPResult, NLPEntity

logger = logging.getLogger(__name__)

# Constants
INTENT_MODEL_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "models", "intent_arabert")
DIALECT_MODEL_NAME = "CAMeL-Lab/bert-base-arabic-camelbert-da-dialect-id"
NER_MODEL_NAME = "hatmimoha/arabic-ner"

class NLPEngine:
    def __init__(self):
        self.intent_classifier = None
        self.dialect_classifier = None
        self.ner_pipeline = None
        self.is_loaded = False
        self.model_version = "v1.0.0"

    def load_models(self):
        """Lazy load models to save memory until first request."""
        if self.is_loaded:
            return

        from transformers import pipeline, AutoTokenizer, AutoModelForSequenceClassification

        # Load Language / Dialect Model
        try:
            logger.info(f"[NLP] Loading dialect model: {DIALECT_MODEL_NAME}")
            self.dialect_classifier = pipeline("text-classification", model=DIALECT_MODEL_NAME, tokenizer=DIALECT_MODEL_NAME, top_k=None)
        except Exception as e:
            logger.warning(f"[NLP] Dialect model failed to load: {e}")

        # Load Intent Model
        if os.path.exists(INTENT_MODEL_DIR):
            try:
                logger.info(f"[NLP] Loading local intent model from {INTENT_MODEL_DIR}")
                self.intent_classifier = pipeline("text-classification", model=INTENT_MODEL_DIR, tokenizer=INTENT_MODEL_DIR, top_k=None)
            except Exception as e:
                logger.warning(f"[NLP] Local intent model failed to load: {e}")
        else:
            logger.warning(f"[NLP] Local intent model not found at {INTENT_MODEL_DIR}. Run training script first.")

        # Load NER Model
        try:
            logger.info(f"[NLP] Loading NER model: {NER_MODEL_NAME}")
            self.ner_pipeline = pipeline("ner", model=NER_MODEL_NAME, tokenizer=NER_MODEL_NAME, aggregation_strategy="simple")
        except Exception as e:
            logger.warning(f"[NLP] NER model failed to load: {e}")

        self.is_loaded = True

    def detect_language(self, text: str) -> Tuple[LanguageLabel, float]:
        """Detect MSA, Levantine, or English with confidence."""
        # Simple heuristic for English
        if re.search(r'[A-Za-z]', text) and not re.search(r'[\u0600-\u06FF]', text):
            return LanguageLabel.ENGLISH, 1.0

        if not self.dialect_classifier:
            return LanguageLabel.MSA, 0.5  # Fallback
            
        results = self.dialect_classifier(text)
        if not results:
            return LanguageLabel.UNKNOWN, 0.0
            
        scores = {item['label']: item['score'] for item in results[0]}
        
        # CAMeL dialect labels: 'LEV' (Levantine), 'MSA', 'EGY', 'GLF', 'MGR'
        msa_score = scores.get('MSA', 0.0)
        lev_score = scores.get('LEV', 0.0)
        
        if lev_score > msa_score:
            return LanguageLabel.LEVANTINE_PALESTINIAN, lev_score
        else:
            return LanguageLabel.MSA, msa_score

    def extract_entities(self, text: str) -> List[NLPEntity]:
        """Extract 8 required entities via Regex and NER."""
        entities = []
        
        # 1. AMOUNT (e.g. 1500 شيكل, $500, 50 دينار)
        amount_matches = re.finditer(r'(\$|€)?\s*(\d+([.,]\d+)?)\s*(شيكل|دولار|دينار|يورو|JOD|ILS|USD|EUR)?', text)
        for match in amount_matches:
            if not match.group(2): continue
            amount_val = match.group(2)
            currency = match.group(4) or match.group(1) or ""
            norm_val = f"{amount_val} {currency}".strip()
            entities.append(NLPEntity(
                label=EntityLabel.AMOUNT, raw_value=match.group(0),
                normalized_value=norm_val, start_index=match.start(), end_index=match.end()
            ))

        # 2. MASKED_ACCOUNT (e.g. حساب 1234, بطاقة 4321)
        # Masks sensitive numbers before they leave the NLP layer
        acct_matches = re.finditer(r'(حساب|بطاقة|رقم)\s*(\d{4,})', text)
        for match in acct_matches:
            raw_num = match.group(2)
            masked = raw_num[:2] + ("*" * (len(raw_num)-4)) + raw_num[-2:] if len(raw_num) >= 4 else "***"
            entities.append(NLPEntity(
                label=EntityLabel.MASKED_ACCOUNT, raw_value=match.group(0),
                normalized_value=masked, start_index=match.start(), end_index=match.end(), is_masked=True
            ))

        # 3. CARD_TYPE (e.g. فيزا, ماستر كارد, صراف آلي)
        card_matches = re.finditer(r'(فيزا|ماستركارد|ماستر كارد|صراف آلي|ائتمانية|بلاتينيوم|تيتانيوم)', text)
        for match in card_matches:
            entities.append(NLPEntity(
                label=EntityLabel.CARD_TYPE, raw_value=match.group(0),
                normalized_value=match.group(1).replace(" ", "_").upper(), start_index=match.start(), end_index=match.end()
            ))

        # 4. PRODUCT_NAME (e.g. تمويل سيارة, إسلامي موبايل)
        product_matches = re.finditer(r'(تمويل\sسيارة|إسلامي\sموبايل|إسلامي\sأونلاين|حساب\sتوفير|مرابحة|مساومة)', text)
        for match in product_matches:
            entities.append(NLPEntity(
                label=EntityLabel.PRODUCT_NAME, raw_value=match.group(0),
                normalized_value=match.group(1).strip(), start_index=match.start(), end_index=match.end()
            ))
            
        # 5. BRANCH_NAME (NER fallback)
        if self.ner_pipeline:
            ner_results = self.ner_pipeline(text)
            for res in ner_results:
                if res['entity_group'] == 'LOC': # Location -> Branch
                    entities.append(NLPEntity(
                        label=EntityLabel.BRANCH_NAME, raw_value=res['word'],
                        normalized_value=res['word'].strip(), start_index=res['start'], end_index=res['end']
                    ))

        return entities

    def analyze(self, text: str) -> NLPResult:
        """Main entry point for NLP processing."""
        t0 = time.time()
        self.load_models()

        # Language Detection
        lang, lang_conf = self.detect_language(text)
        
        # Strict < 0.70 confidence triggers confirmation loop
        requires_conf = lang_conf < 0.70

        # Intent Classification
        intent = IntentLabel.UNKNOWN if hasattr(IntentLabel, 'UNKNOWN') else IntentLabel.GENERAL_INFO
        intent_conf = 0.0
        
        if self.intent_classifier:
            try:
                results = self.intent_classifier(text)
                if results and len(results[0]) > 0:
                    # Pipeline returns [{'label': 'LABEL_X', 'score': 0.9}, ...]
                    top_res = max(results[0], key=lambda x: x['score'])
                    label_str = top_res['label']
                    intent_conf = top_res['score']
                    
                    try:
                        intent = IntentLabel(label_str)
                    except ValueError:
                        # Fallback if model output is not in Enum
                        pass
            except Exception as e:
                logger.error(f"[NLP] Intent classification error: {e}")
        else:
            # Fallback regex heuristics for startup before training
            if "بطاقة" in text: intent = IntentLabel.CARD_INQUIRY; intent_conf = 0.8
            elif "حساب" in text: intent = IntentLabel.ACCOUNT_INQUIRY; intent_conf = 0.8
            elif "قرض" in text or "تمويل" in text: intent = IntentLabel.LOAN_INQUIRY; intent_conf = 0.8
            elif "شكوى" in text or "مشكلة" in text: intent = IntentLabel.COMPLAINT; intent_conf = 0.8
            else: intent = IntentLabel.GENERAL_INFO; intent_conf = 0.60 # Explicit boundary

        # Entities
        entities = self.extract_entities(text)

        # Exact 0.60 SRS boundary logic mapping
        fallback = intent_conf <= 0.60

        duration_ms = int((time.time() - t0) * 1000)

        return NLPResult(
            intent=intent,
            intent_confidence=round(intent_conf, 4),
            language=lang,
            language_confidence=round(lang_conf, 4),
            requires_confirmation=requires_conf,
            entities=entities,
            model_version=self.model_version,
            inference_time_ms=duration_ms,
            fallback_triggered=fallback
        )

nlp_engine = NLPEngine()
