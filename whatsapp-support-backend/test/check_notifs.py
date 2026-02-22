import asyncio
from app.database import supabase
import os

async def check_notifs():
    try:
        response = supabase.table("notifications").select("*").order("created_at", desc=True).limit(5).execute()
        print(f"Total notifications found: {len(response.data)}")
        for n in response.data:
            print(f"ID: {n['id']} | Title: {n['title']} | UserID: {n['user_id']} | Created: {n['created_at']}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(check_notifs())
