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
    # An escalation that went unanswered past ESCALATION_TIMEOUT_MINUTES and was
    # ended by the cleanup loop. Terminal like `completed`, but deliberately a
    # different label: nobody resolved this one, it simply ran out of time.
    # See migration 20260823000000_session_status_auto_closed.sql.
    auto_closed = "auto_closed"

class MessageDirection(str, enum.Enum):
    inbound = "inbound"
    outbound = "outbound"
