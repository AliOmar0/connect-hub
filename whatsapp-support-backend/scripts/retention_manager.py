"""
Data Retention Manager Script
Handles lifecycle compliance by deleting old records.

Usage:
    python scripts/retention_manager.py           # Execute deletions
    python scripts/retention_manager.py --dry-run # Preview counts only
"""
import asyncio
import argparse
from datetime import datetime, timedelta, timezone
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import supabase

RETENTION_DAYS = 30


async def count_records_to_delete(dry_run: bool = True) -> dict:
    threshold = (datetime.now(timezone.utc) - timedelta(days=RETENTION_DAYS)).isoformat()
    counts = {}
    
    print(f"\n{'[DRY RUN]' if dry_run else '[EXECUTING]'} Retention Threshold: {RETENTION_DAYS} days")
    print(f"Threshold Date: {threshold}")
    print("-" * 50)
    
    msg_response = supabase.table("messages").select("id", count="exact").lt("created_at", threshold).execute()
    counts["messages"] = getattr(msg_response, 'count', len(msg_response.data)) if msg_response.data else 0
    
    session_response = supabase.table("sessions").select("id", count="exact").lt("created_at", threshold).execute()
    counts["sessions"] = getattr(session_response, 'count', len(session_response.data)) if session_response.data else 0
    
    notif_response = supabase.table("notifications").select("id", count="exact").lt("created_at", threshold).execute()
    counts["notifications"] = getattr(notif_response, 'count', len(notif_response.data)) if notif_response.data else 0
    
    return counts


async def execute_retention(dry_run: bool = True) -> dict:
    threshold = (datetime.now(timezone.utc) - timedelta(days=RETENTION_DAYS)).isoformat()
    deleted = {}
    
    if dry_run:
        counts = await count_records_to_delete(dry_run=True)
        print("\nRecords that WOULD be deleted:")
        for table, count in counts.items():
            print(f"  {table}: {count} records")
        print("\nRun without --dry-run to execute deletions.")
        return counts
    
    print(f"\n[EXECUTING] Deleting records older than {RETENTION_DAYS} days...")
    
    msg_response = supabase.table("messages").delete().lt("created_at", threshold).execute()
    deleted["messages"] = len(msg_response.data) if msg_response.data else 0
    print(f"  Deleted {deleted['messages']} messages")
    
    session_response = supabase.table("sessions").delete().lt("created_at", threshold).execute()
    deleted["sessions"] = len(session_response.data) if session_response.data else 0
    print(f"  Deleted {deleted['sessions']} sessions")
    
    notif_response = supabase.table("notifications").delete().lt("created_at", threshold).execute()
    deleted["notifications"] = len(notif_response.data) if notif_response.data else 0
    print(f"  Deleted {deleted['notifications']} notifications")
    
    print("\nRetention cleanup complete.")
    return deleted


async def main():
    parser = argparse.ArgumentParser(description="Data Retention Manager")
    parser.add_argument("--dry-run", action="store_true", help="Count records without deleting")
    parser.add_argument("--days", type=int, default=RETENTION_DAYS, help="Retention period in days")
    
    args = parser.parse_args()
    
    global RETENTION_DAYS
    RETENTION_DAYS = args.days
    
    print("=" * 50)
    print("DATA RETENTION MANAGER")
    print("=" * 50)
    
    await execute_retention(dry_run=args.dry_run)


if __name__ == "__main__":
    asyncio.run(main())
