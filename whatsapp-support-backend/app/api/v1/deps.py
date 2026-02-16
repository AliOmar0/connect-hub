from app.database import get_supabase

async def get_session():
    """
    Dependency to get the supabase client.
    """
    return await get_supabase()
