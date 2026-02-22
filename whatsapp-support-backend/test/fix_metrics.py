from app.database import supabase
from app.models.enums import MessageDirection, SessionStatus
from datetime import datetime
import asyncio

async def fix_session_metrics():
    print("🚀 Starting metrics fixation for existing sessions...")
    
    # 1. Fetch all sessions
    response = supabase.table("sessions").select("*, messages(*)").execute()
    sessions = response.data
    
    for s in sessions:
        session_id = s["id"]
        messages = s.get("messages", [])
        started_at = datetime.fromisoformat(s["started_at"].replace('Z', '+00:00'))
        
        updates = {}
        
        # Calculate Wait Time: Diff between start and first outbound message
        outbound = [m for m in messages if m["direction"] == "outbound"]
        if outbound:
            # Sort by sent_at
            outbound.sort(key=lambda x: x["sent_at"])
            first_reply_at = datetime.fromisoformat(outbound[0]["sent_at"].replace('Z', '+00:00'))
            wait_time = int((first_reply_at - started_at).total_seconds())
            updates["wait_time_seconds"] = max(0, wait_time)
            print(f"✅ Recalculated Wait Time for session {session_id}: {wait_time}s")

        # Calculate Duration for completed sessions
        if s["status"] == "completed":
            ended_at = s.get("ended_at")
            if ended_at:
                ended_at_dt = datetime.fromisoformat(ended_at.replace('Z', '+00:00'))
                duration = int((ended_at_dt - started_at).total_seconds())
                updates["duration_seconds"] = max(0, duration)
                print(f"✅ Updated Duration for session {session_id}: {duration}s")
            elif messages:
                # Fallback: use last message time as end time
                messages.sort(key=lambda x: x["sent_at"])
                last_msg_at = datetime.fromisoformat(messages[-1]["sent_at"].replace('Z', '+00:00'))
                duration = int((last_msg_at - started_at).total_seconds())
                updates["duration_seconds"] = max(0, duration)
                updates["ended_at"] = messages[-1]["sent_at"]
                print(f"✅ Updated Duration (Fallback) for session {session_id}: {duration}s")

        if updates:
            supabase.table("sessions").update(updates).eq("id", session_id).execute()

    print("🏁 Done!")

if __name__ == "__main__":
    asyncio.run(fix_session_metrics())
