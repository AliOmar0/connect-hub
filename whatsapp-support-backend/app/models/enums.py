import enum

class ChannelType(str, enum.Enum):
    whatsapp = "whatsapp"
    messenger = "messenger"
    sms = "sms"
    voice = "voice"
    email = "email"

class SessionStatus(str, enum.Enum):
    active = "active"
    waiting = "waiting"
    completed = "completed"
    escalated = "escalated"
    missed = "missed"

class MessageDirection(str, enum.Enum):
    inbound = "inbound"
    outbound = "outbound"

class IntentLabel(str, enum.Enum):
    # 15 Exact SRS Intents
    ACCOUNT_INQUIRY = "ACCOUNT_INQUIRY"
    ACCOUNT_OPENING = "ACCOUNT_OPENING"
    CARD_INQUIRY = "CARD_INQUIRY"
    CARD_REPLACEMENT = "CARD_REPLACEMENT"
    CARD_ACTIVATION = "CARD_ACTIVATION"
    LOAN_INQUIRY = "LOAN_INQUIRY"
    LOAN_APPLICATION = "LOAN_APPLICATION"
    TRANSFER_LOCAL = "TRANSFER_LOCAL"
    TRANSFER_INTERNATIONAL = "TRANSFER_INTERNATIONAL"
    PASSWORD_RESET = "PASSWORD_RESET"
    BRANCH_LOCATION = "BRANCH_LOCATION"
    COMPLAINT = "COMPLAINT"
    FRAUD_REPORT = "FRAUD_REPORT"
    GENERAL_INFO = "GENERAL_INFO"
    GREETING = "GREETING"

class LanguageLabel(str, enum.Enum):
    MSA = "MSA"
    LEVANTINE_PALESTINIAN = "LEVANTINE_PALESTINIAN"
    ENGLISH = "ENGLISH"
    UNKNOWN = "UNKNOWN"

class EntityLabel(str, enum.Enum):
    AMOUNT = "AMOUNT"
    DATE = "DATE"
    CARD_TYPE = "CARD_TYPE"
    BRANCH_NAME = "BRANCH_NAME"
    MASKED_ACCOUNT = "MASKED_ACCOUNT"
    PRODUCT_NAME = "PRODUCT_NAME"
    USER_INTENT = "USER_INTENT"
    OTHER = "OTHER"
