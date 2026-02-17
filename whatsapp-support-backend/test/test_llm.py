import asyncio
from app.core.llm import llm_service
from app.crud import crud
from uuid import UUID

async def test_classification():
    print("Testing classification...")
    types = [
        {"id": "fed8f941-a0d3-443f-9f09-cab7312a1dd8", "name": "خدمات إسلامي أونلاين"},
        {"id": "fed8f941-a0d3-443f-9f09-cab7312a1dd9", "name": "استفسار عن تمويل"},
    ]
    text = "بدي أسأل عن كيف أسجل في إسلامي أونلاين"
    
    result = await llm_service.classify_session(text, types)
    print(f"Classification result: {result}")

if __name__ == "__main__":
    asyncio.run(test_classification())
