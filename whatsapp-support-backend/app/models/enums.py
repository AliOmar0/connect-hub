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
