import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")

supabase: Client = create_client(url, key)

sql = """
-- Fix RLS policies for notifications to allow broadcast (NULL user_id)
DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own or broadcast notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own or broadcast notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;
CREATE POLICY "Users can delete own or broadcast notifications"
  ON public.notifications FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id OR user_id IS NULL);
"""

try:
    # Supabase Python SDK doesn't have a direct 'rpc' for raw SQL unless defined
    # But we can try to use the migrations or if there is an rpc defined.
    # Alternatively, since I can't run raw SQL easily through the client without an RPC,
    # I will suggest the user to run this in the Supabase SQL Editor.
    # OR, I can check if there's a way to run it.
    
    print("Please run the following SQL in your Supabase SQL Editor to fix notifications:")
    print(sql)
    
except Exception as e:
    print(f"Error: {e}")
