"""
PII Redaction Module for RAG System.
Implements FR-06 compliance for logging and data handling.
"""
import re
from typing import Tuple
import logging

logger = logging.getLogger(__name__)

# PII patterns for Palestinian/International formats
PII_PATTERNS = {
    # Palestinian phone numbers (059, 056, 0599, etc.)
    "phone": re.compile(
        r'\b(059|056|0599|0598|0597|0596|0595|0594|0593|0592|0591|0590)'
        r'\d{7}\b|\b\+970\s?\d{9,10}\b|\b\+972\s?\d{9,10}\b',
        re.IGNORECASE
    ),
    # Email addresses
    "email": re.compile(
        r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
    ),
    # IBAN (Palestinian format: PS + 2 check digits + 18 alphanumeric)
    "iban": re.compile(
        r'\bPS\d{2}[A-Z0-9]{18}\b',
        re.IGNORECASE
    ),
    # Palestinian ID numbers (9 digits)
    "national_id": re.compile(
        r'\b\d{9}\b'
    ),
    # Credit/Debit card numbers (16 digits, possibly with spaces)
    "card_number": re.compile(
        r'\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b'
    ),
    # Account numbers (typically 10-14 digits at PIB)
    "account_number": re.compile(
        r'\b\d{10,14}\b'
    ),
    # OTP codes (4-6 digits typically)
    "otp": re.compile(
        r'\b\d{4,6}\b'
    ),
}

# Replacement labels for each PII type
PII_REPLACEMENTS = {
    "phone": "[PHONE]",
    "email": "[EMAIL]",
    "iban": "[IBAN]",
    "national_id": "[ID_NUMBER]",
    "card_number": "[CARD_NUMBER]",
    "account_number": "[ACCOUNT]",
    "otp": "[OTP]",
}


def redact_pii(text: str) -> str:
    """
    Redact PII from text by replacing with placeholder tokens.
    
    Args:
        text: Input text that may contain PII
        
    Returns:
        Text with PII replaced by [TYPE] placeholders
    """
    if not text:
        return text
    
    redacted = text
    
    for pii_type, pattern in PII_PATTERNS.items():
        replacement = PII_REPLACEMENTS.get(pii_type, f"[{pii_type.upper()}]")
        redacted = pattern.sub(replacement, redacted)
    
    return redacted


def detect_pii(text: str) -> dict:
    """
    Detect PII in text without redacting.
    
    Args:
        text: Input text to analyze
        
    Returns:
        Dictionary with PII types found and their counts
    """
    if not text:
        return {}
    
    findings = {}
    
    for pii_type, pattern in PII_PATTERNS.items():
        matches = pattern.findall(text)
        if matches:
            findings[pii_type] = len(matches)
    
    return findings


def redact_pii_with_log(text: str) -> Tuple[str, dict]:
    """
    Redact PII and return logging information about what was redacted.
    
    Args:
        text: Input text that may contain PII
        
    Returns:
        Tuple of (redacted_text, redaction_log)
        where redaction_log contains counts of each PII type found
    """
    if not text:
        return text, {}
    
    findings = detect_pii(text)
    redacted = redact_pii(text)
    
    return redacted, findings


def redact_for_logging(data: dict, fields_to_redact: list = None) -> dict:
    """
    Redact PII from specific fields in a dictionary for safe logging.
    
    Args:
        data: Dictionary containing data to log
        fields_to_redact: List of field names that should have PII redacted
        
    Returns:
        Copy of dictionary with specified fields redacted
    """
    if fields_to_redact is None:
        fields_to_redact = ['content', 'text', 'message', 'query', 'response']
    
    redacted_data = data.copy()
    
    for field in fields_to_redact:
        if field in redacted_data and isinstance(redacted_data[field], str):
            redacted_data[field] = redact_pii(redacted_data[field])
    
    return redacted_data
