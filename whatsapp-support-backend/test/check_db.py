from app.database import supabase
from uuid import uuid4
import asyncio

async def check_db_schema():
    print("Checking sessions table schema...")
    try:
        # Try to update a non-existent session with the the fields to see if columns exist
        test_id = str(uuid4())
        response = supabase.table("sessions").update({
            "wait_time_seconds": 0,
            "duration_seconds": 0,
            "satisfaction_score": 0
        }).eq("id", test_id).execute()
        print("Columns exist (or at least update command didn't fail on column names)")
    except Exception as e:
        print(f"Error checking columns: {e}")

if __name__ == "__main__":
    asyncio.run(check_db_schema())
