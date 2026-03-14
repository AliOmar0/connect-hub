
import os
from supabase import create_client, Client

url = "https://natxxgvlkdclejswvxha.supabase.co"
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5hdHh4Z3Zsa2RjbGVqc3d2eGhhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTkzMzkyOSwiZXhwIjoyMDg1NTA5OTI5fQ.Y08XkCtTEBs4iChkeoxH6ioAai80INg-KC6sPjuAaNY"

supabase: Client = create_client(url, key)

response = supabase.table("sessions").select("id, status, created_at").order("created_at", desc=True).limit(20).execute()
print("Recent Sessions:")
for s in response.data:
    print(f"ID: {s['id']}, Status: {s['status']}, Created At: {s['created_at']}")

active_count = supabase.table("sessions").select("*", count="exact").eq("status", "active").execute()
print(f"\nActive Sessions Count: {active_count.count}")

waiting_count = supabase.table("sessions").select("*", count="exact").eq("status", "waiting").execute()
print(f"Waiting Sessions Count: {waiting_count.count}")
