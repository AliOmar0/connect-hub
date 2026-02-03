from supabase import create_client, Client
from app.core.config import settings

# Create the Supabase client
supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)

async def get_supabase():
    """
    Dependency to get the supabase client.
    Since the client is already initialized, we just return it.
    """
    return supabase
