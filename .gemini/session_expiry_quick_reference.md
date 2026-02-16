# Session Expiry System - Quick Reference

## ⚙️ Configuration

### Change Expiry Timeout

**File**: `whatsapp-support-backend/app/api/v1/webhook.py`
**Line**: ~312

```python
# Current: 10 minutes
if time_since_completion.total_seconds() > 600:

# Change to 15 minutes:
if time_since_completion.total_seconds() > 900:

# Change to 5 minutes:
if time_since_completion.total_seconds() > 300:
```

### Change Cleanup Frequency

**File**: `whatsapp-support-backend/app/main.py`
**Line**: 19

```python
# Current: Every 5 minutes
await asyncio.sleep(300)

# Change to every 2 minutes:
await asyncio.sleep(120)

# Change to every 10 minutes:
await asyncio.sleep(600)
```

### Change Auto-Close Threshold

**File**: `whatsapp-support-backend/app/crud/crud.py`
**Line**: 15

```python
# Current: 10 minutes
await crud.close_inactive_sessions(None, minutes=10)

# Change to 15 minutes:
await crud.close_inactive_sessions(None, minutes=15)
```

## 🔍 Monitoring

### Check Background Task Status

```bash
# View logs
tail -f logs/app.log | grep "session cleanup"

# Expected output every 5 minutes:
# INFO: Auto-closing session {id} (inactive >10 mins after outbound msg)
```

### Check Session Creation

```bash
# View session creation logs
tail -f logs/app.log | grep "Creating NEW session"

# Expected output when customer returns after expiry:
# INFO: Creating NEW session for customer {id}. Previous session {id} expired {X} minutes ago.
```

### Check Session Reactivation

```bash
# View reactivation logs
tail -f logs/app.log | grep "Reactivating recent session"

# Expected output when customer returns quickly:
# INFO: Reactivating recent session {id} for customer {id} (completed {X} minutes ago)
```

## 🧪 Testing

### Test 1: Auto-Closure

```python
# 1. Create a test session
# 2. Send message from bot
# 3. Wait 11 minutes
# 4. Check if session auto-closed

# Expected: Session status = "completed"
```

### Test 2: New Session After Expiry

```python
# 1. Complete a session
# 2. Wait 11 minutes
# 3. Send customer message
# 4. Check session ID

# Expected: New session ID created
```

### Test 3: Reactivation Within Window

```python
# 1. Complete a session
# 2. Wait 5 minutes
# 3. Send customer message
# 4. Check session ID

# Expected: Same session ID, status = "active"
```

## 📊 Database Queries

### Find Sessions About to Expire

```sql
SELECT id, customer_id, status, updated_at,
       EXTRACT(EPOCH FROM (NOW() - updated_at))/60 as minutes_inactive
FROM sessions
WHERE status IN ('active', 'waiting', 'escalated')
  AND updated_at < NOW() - INTERVAL '8 minutes'
ORDER BY updated_at ASC;
```

### Find Recently Closed Sessions

```sql
SELECT id, customer_id, status, updated_at, ended_at
FROM sessions
WHERE status = 'completed'
  AND ended_at > NOW() - INTERVAL '1 hour'
ORDER BY ended_at DESC;
```

### Count Sessions by Status

```sql
SELECT status, COUNT(*) as count
FROM sessions
GROUP BY status;
```

## 🐛 Debugging

### Enable Verbose Logging

```python
# In webhook.py, add after line 291:
logger.info(f"Session end time: {session_end_time}")
logger.info(f"Current time: {datetime.now(timezone.utc)}")
logger.info(f"Time difference: {time_since_completion.total_seconds()} seconds")
```

### Manual Session Closure

```python
# Python console
from app.crud import crud
from app.database import supabase

# Close specific session
await crud.update_session_status(None, "session-uuid-here", SessionStatus.completed)

# Run cleanup manually
closed = await crud.close_inactive_sessions(None, minutes=10)
print(f"Closed {closed} sessions")
```

### Check Notification Delivery

```sql
-- View recent notifications
SELECT * FROM notifications
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;

-- Count notifications by type
SELECT type, COUNT(*) as count
FROM notifications
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY type;
```

## 🚨 Common Issues

### Issue: Sessions Not Closing

**Symptoms**: Sessions stay active after 10 minutes

**Diagnosis**:

```bash
# Check if background task is running
ps aux | grep "uvicorn"

# Check logs for errors
grep "Error in session cleanup" logs/app.log
```

**Solution**:

1. Restart backend: `uvicorn app.main:app --reload`
2. Check database connectivity
3. Verify session has outbound message

### Issue: Too Many Notifications

**Symptoms**: Agents receive duplicate notifications

**Diagnosis**:

```sql
-- Check notification count
SELECT COUNT(*) FROM notifications
WHERE created_at > NOW() - INTERVAL '1 hour';
```

**Solution**:

1. Reduce cleanup frequency
2. Implement notification deduplication
3. Adjust notification retention

### Issue: Wrong Session Reactivated

**Symptoms**: Old session reactivated instead of new one

**Diagnosis**:

```python
# Add debug logging in webhook.py line ~310
logger.info(f"Time since completion: {time_since_completion.total_seconds()} seconds")
logger.info(f"Threshold: 600 seconds (10 minutes)")
```

**Solution**:

1. Check timezone configuration
2. Verify timestamp parsing
3. Ensure UTC timezone used

## 📈 Performance Metrics

### Expected Performance

- **Cleanup Time**: <1 second for 100 sessions
- **Session Creation**: <100ms
- **Memory Usage**: <50MB for background task
- **CPU Usage**: <5% during cleanup

### Monitor Performance

```python
# Add timing in crud.py close_inactive_sessions()
import time
start = time.time()
# ... existing code ...
elapsed = time.time() - start
logger.info(f"Cleanup took {elapsed:.2f} seconds, closed {closed_count} sessions")
```

## 🔐 Security Checklist

- [x] UTC timezone used for all timestamps
- [x] New sessions created after expiry (not reactivated)
- [x] Session IDs are UUIDs (not sequential)
- [x] Timezone-aware datetime comparisons
- [x] Proper error handling for timestamp parsing
- [x] Audit logging for all session state changes
- [x] Notifications for security events

## 📝 Code Snippets

### Get Session Age

```python
from datetime import datetime, timezone

def get_session_age_minutes(session):
    """Calculate session age in minutes"""
    updated_at = session.updated_at
    if isinstance(updated_at, str):
        if updated_at.endswith('Z'):
            updated_at = updated_at.replace('Z', '+00:00')
        updated_at = datetime.fromisoformat(updated_at)

    if updated_at.tzinfo is None:
        updated_at = updated_at.replace(tzinfo=timezone.utc)

    age = datetime.now(timezone.utc) - updated_at
    return age.total_seconds() / 60
```

### Force Close Session

```python
async def force_close_session(session_id: str):
    """Manually close a session"""
    from app.crud import crud
    from app.models.enums import SessionStatus

    await crud.update_session_status(None, session_id, SessionStatus.completed)
    logger.info(f"Manually closed session {session_id}")
```

### Get Expiring Sessions

```python
async def get_expiring_sessions(minutes: int = 8):
    """Get sessions that will expire soon"""
    from datetime import datetime, timedelta, timezone
    from app.database import supabase

    threshold = (datetime.now(timezone.utc) - timedelta(minutes=minutes)).isoformat()

    response = supabase.table("sessions")\
        .select("id, customer_id, updated_at")\
        .in_("status", ["active", "waiting"])\
        .lt("updated_at", threshold)\
        .execute()

    return response.data
```

## 🎯 Best Practices

1. **Keep expiry threshold consistent** across all components
2. **Monitor cleanup task** regularly via logs
3. **Set up alerts** for failed cleanups
4. **Test with various timezones** before deployment
5. **Document any configuration changes** in git commit messages
6. **Use UTC everywhere** - never local time
7. **Log all session state transitions** for debugging
8. **Implement graceful degradation** if cleanup fails

## 📞 Support

### Log Files

- **Application**: `logs/app.log`
- **Background Task**: Search for "session cleanup task"
- **Session Creation**: Search for "Creating NEW session"

### Metrics to Track

- Sessions closed per hour
- Average session duration
- Reactivation rate
- New session creation rate

### Alerts to Set Up

- Background task failure
- Cleanup taking >5 seconds
- > 100 sessions closed in one run
- Notification delivery failures

---

**Last Updated**: 2026-02-16
**Version**: 1.0
**Maintainer**: Backend Team
