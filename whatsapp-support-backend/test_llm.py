import asyncio
from app.core.llm import LLMService
from app.core.rag import retrieve, build_context_block
import json

async def test():
    try:
        llm = LLMService()
        
        # Simulating the RAG context retrieval that happens in llm.py
        results = await retrieve('كم حد السحب من الصراف الآلي؟')
        context_block = build_context_block(results)
        
        print('--- CONTEXT ---')
        print(context_block)
        print('---------------')
        
        resp = await llm.generate_response('كم حد السحب من الصراف الآلي؟', [], context=context_block)
        print('\n--- AI RESPONSE ---')
        print(resp)
        print('-------------------')
        
    except Exception as e:
        print('Error:', e)

asyncio.run(test())
