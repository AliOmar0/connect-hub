"""
PII Redaction Module - Zero-Trust Privacy Layer
Masks sensitive data before database persistence.
"""
import re
import logging
from typing import Tuple

logger = logging.getLogger(__name__)


def mask_credit_card(text: str) -> Tuple[str, int]:
    """
    Mask credit card numbers - keep only last 4 digits.
    Matches 13-19 digit numbers (Visa, MC, Amex ranges).
    """
    pattern = r'\b(?:\d[ -]*?){13,16}\d\b'
    count = 0
    
    def replace(match):
        nonlocal count
        original = match.group(0)
        # Extract only digits
        digits = re.sub(r'[^\d]', '', original)
        if 13 <= len(digits) <= 19 and _luhn_check(digits):
            count += 1
            # Create masked version: *** + last 4 digits
            masked_digits = '*' * (len(digits) - 4) + digits[-4:]
            # Replace digits in original, preserving formatting
            result = []
            idx = 0
            for char in original:
                if char.isdigit():
                    result.append(masked_digits[idx])
                    idx += 1
                else:
                    result.append(char)
            return ''.join(result)
        return original
    
    return re.sub(pattern, replace, text), count


def mask_account_number(text: str) -> Tuple[str, int]:
    """
    Mask IBANs and account numbers - keep first 2 and last 2 characters.
    IBAN: 2 letters + 2 digits + up to 30 alphanumeric
    """
    count = 0
    
    # IBAN pattern
    iban_pattern = r'\b[A-Z]{2}[0-9]{2}[A-Z0-9]{4,30}\b'
    def mask_iban(match):
        nonlocal count
        original = match.group(0)
        count += 1
        return original[:2] + '*' * (len(original) - 4) + original[-2:]
    
    text = re.sub(iban_pattern, mask_iban, text, flags=re.IGNORECASE)
    
    # Generic account number (8-20 consecutive digits not part of credit card)
    # Use negative lookbehind/lookahead to avoid double-masking
    acct_pattern = r'(?<!\d)\d{8,20}(?!\d)'
    def mask_acct(match):
        nonlocal count
        original = match.group(0)
        # Skip if already processed as credit card
        if _luhn_check(original):
            return original
        count += 1
        return original[:2] + '*' * (len(original) - 4) + original[-2:]
    
    text = re.sub(acct_pattern, mask_acct, text)
    return text, count


def mask_phone_number(text: str) -> Tuple[str, int]:
    """
    Mask Palestinian phone numbers.
    Palestinian mobile: +970, +972, 059, 056 prefixes
    Format: Keep first 3 and last 2 digits visible.
    """
    count = 0
    
    # Palestinian mobile patterns
    patterns = [
        r'\+970[5-9]\d{7}',      # +970 5X XXX XXXX
        r'\+972[5-9]\d{7}',      # +972 5X XXX XXXX
        r'0[5-9]\d{8}',          # 05X XXX XXXX (local format)
    ]
    
    combined = '|'.join(patterns)
    
    def mask(match):
        nonlocal count
        original = match.group(0)
        count += 1
        # Keep prefix (3 digits) and last 2 digits
        return original[:3] + '*' * (len(original) - 5) + original[-2:]
    
    return re.sub(combined, mask, text), count


def mask_national_id(text: str) -> Tuple[str, int]:
    """
    Mask Palestinian National ID numbers.
    Keep first 3 digits visible.
    """
    count = 0
    
    # Palestinian ID: 9 digits, starts with specific region codes
    pattern = r'\b[1-9]\d{8}\b'
    
    def mask(match):
        nonlocal count
        original = match.group(0)
        count += 1
        return original[:3] + '*' * 6
    
    return re.sub(pattern, mask, text), count


def mask_transaction_id(text: str) -> Tuple[str, int]:
    """
    Fully mask transaction IDs.
    Patterns: TXN-, TRX-, txn_ followed by alphanumeric, or standalone 10+ hex strings.
    """
    count = 0
    
    patterns = [
        r'\b(?:TXN|TRX|txn|trx)[-_]?\d{6,}\b',  # TXN-123456
        r'\b(?:TXN|TRX|txn|trx)[-_]?[A-Fa-f0-9]{8,}\b',  # TXN-ABC12345
        r'\b[A-Fa-f0-9]{10,}\b',  # Standalone hex (10+ chars)
    ]
    
    combined = '|'.join(patterns)
    
    def mask(match):
        nonlocal count
        count += 1
        return '[TRANSACTION_ID_REDACTED]'
    
    return re.sub(combined, mask, text), count


def _luhn_check(card_number: str) -> bool:
    """
    Luhn algorithm validation for credit card numbers.
    Returns True if valid card number.
    """
    try:
        digits = [int(d) for d in card_number]
        odd_digits = digits[-1::-2]
        even_digits = digits[-2::-2]
        total = sum(odd_digits)
        for d in even_digits:
            doubled = d * 2
            total += doubled if doubled < 10 else doubled - 9
        return total % 10 == 0
    except (ValueError, TypeError):
        return False


def redact_pii(text: str) -> str:
    """
    Main entry point - applies all PII masking in sequence.
    Order matters: credit cards before account numbers (to avoid double-masking).
    
    Returns the redacted text with all PII masked.
    """
    if not text:
        return text
    
    total_redactions = 0
    
    # Order matters: credit cards first (most specific)
    text, count = mask_credit_card(text)
    total_redactions += count
    
    text, count = mask_account_number(text)
    total_redactions += count
    
    text, count = mask_phone_number(text)
    total_redactions += count
    
    text, count = mask_national_id(text)
    total_redactions += count
    
    text, count = mask_transaction_id(text)
    total_redactions += count
    
    if total_redactions > 0:
        logger.info(f"[PII] Redacted {total_redactions} sensitive field(s) from message")
    
    return text
