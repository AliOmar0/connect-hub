import asyncio
import sys
from app.database import supabase

# Set output to UTF-8
if sys.stdout.encoding != 'utf-8':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')

async def list_types():
    response = supabase.table("session_main_types").select("*").execute()
    for t in response.data:
        try:
            print(f"ID: {t['id']}, Name: {t['name']}")
        except:
            print(f"ID: {t['id']}, Name: [Encoding Error]")

if __name__ == "__main__":
    asyncio.run(list_types())
