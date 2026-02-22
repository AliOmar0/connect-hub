```mermaid
flowchart TD
    Start([Customer Sends Message]) --> CheckActive{Active Session Exists?}

    CheckActive -->|Yes| UseActive[Use Existing Session]
    CheckActive -->|No| GetLast[Get Last Completed Session]

    GetLast --> HasLast{Last Session Exists?}

    HasLast -->|No| CreateFresh[Create Fresh Session]
    HasLast -->|Yes| CalcTime[Calculate Time Since Completion]

    CalcTime --> CheckExpiry{Time > 10 Minutes?}

    CheckExpiry -->|Yes| CreateNew[Create NEW Session]
    CheckExpiry -->|No| Reactivate[Reactivate Existing Session]

    CreateNew --> NotifyNew[Notify: New Session Started]
    Reactivate --> NotifyResume[Notify: Session Resumed]
    CreateFresh --> ProcessMsg[Process Message]

    NotifyNew --> ProcessMsg
    NotifyResume --> ProcessMsg
    UseActive --> ProcessMsg

    ProcessMsg --> SaveMsg[Save Message to DB]
    SaveMsg --> CheckType{Message Type?}

    CheckType -->|Text| TriggerAI[Trigger AI Response]
    CheckType -->|Audio| TranscribeAudio[Transcribe Audio]

    TriggerAI --> End([Complete])
    TranscribeAudio --> End

    %% Background Task
    BG_Start([Background Task Every 5 Min]) --> BG_Query[Query Inactive Sessions]
    BG_Query --> BG_Filter{Updated > 10 Min Ago?}

    BG_Filter -->|Yes| BG_CheckMsg[Check Last Message]
    BG_Filter -->|No| BG_Skip[Skip Session]

    BG_CheckMsg --> BG_IsOutbound{Last Msg Outbound?}

    BG_IsOutbound -->|Yes| BG_Close[Close Session]
    BG_IsOutbound -->|No| BG_Skip

    BG_Close --> BG_Notify[Notify: Session Completed Auto]
    BG_Notify --> BG_End([Wait 5 Minutes])
    BG_Skip --> BG_End

    BG_End --> BG_Start

    style CreateNew fill:#90EE90
    style Reactivate fill:#FFD700
    style CreateFresh fill:#87CEEB
    style BG_Close fill:#FFB6C1
    style NotifyNew fill:#98FB98
    style NotifyResume fill:#FAFAD2
```

# Session Expiry System - Flow Diagram

## Legend

- **Green**: New session creation after expiry
- **Yellow**: Session reactivation within window
- **Blue**: Fresh session creation (first time)
- **Pink**: Background auto-closure
- **Light Green**: Notification for new session
- **Light Yellow**: Notification for resumed session

## Two Parallel Processes

### 1. Message Handling (Top Flow)

Triggered when customer sends a message. Decides whether to:

- Use existing active session
- Create new session (if >10 mins expired)
- Reactivate recent session (if <10 mins)
- Create fresh session (first time customer)

### 2. Background Cleanup (Bottom Flow)

Runs every 5 minutes automatically. Closes sessions that:

- Haven't been updated in >10 minutes
- Last message was from bot/agent (outbound)
- Are in active/waiting/escalated status

## Key Decision Points

### Time-Based Decision

```
Time Since Last Activity:
├─ < 10 minutes → Reactivate existing session
└─ > 10 minutes → Create new session
```

### Message Direction Check

```
Last Message Direction:
├─ Outbound (from bot/agent) → Safe to close
└─ Inbound (from customer) → Keep open (waiting for response)
```

## Example Timeline

```
10:00 AM │ Customer: "Hello"
10:01 AM │ Bot: "How can I help?"
10:02 AM │ Customer: "Thanks"
10:03 AM │ Bot: "Goodbye!"
         │
10:08 AM │ [Background Task Runs]
         │ ├─ Session updated 5 mins ago
         │ └─ Skip (not yet 10 mins)
         │
10:13 AM │ [Background Task Runs]
         │ ├─ Session updated 10 mins ago
         │ ├─ Last message: Outbound
         │ └─ ✓ Close Session
         │
10:20 AM │ Customer: "New question"
         │ ├─ No active session
         │ ├─ Last session completed 17 mins ago
         │ └─ ✓ Create NEW Session
```

## Security Considerations

### Session Boundary Enforcement

- Each expired session gets a NEW session ID
- Prevents session fixation attacks
- Maintains clear audit trail

### Timezone Safety

- All times in UTC
- Timezone-aware comparisons
- Handles DST transitions

### Data Isolation

- New sessions don't inherit old session data
- Each session has independent context
- No cross-session contamination
