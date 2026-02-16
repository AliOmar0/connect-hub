import asyncio
import edge_tts
from flask import Flask, request, send_file
import io
import traceback
import sys
import codecs

# Fix Windows console encoding
if sys.platform == 'win32':
    try:
        sys.stdout = codecs.getwriter("utf-8")(sys.stdout.detach())
        sys.stderr = codecs.getwriter("utf-8")(sys.stderr.detach())
    except:
        pass

app = Flask(__name__)

# Jordanian voice
VOICE = "ar-JO-SanaNeural" 

async def generate_audio_async(text):
    print(f"Synthesizing: {len(text)} chars")
    communicate = edge_tts.Communicate(text, VOICE)
    memory_file = io.BytesIO()
    
    found_audio = False
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            memory_file.write(chunk["data"])
            found_audio = True
            
    if not found_audio:
        raise Exception("No audio chunks received")
        
    memory_file.seek(0)
    return memory_file

@app.route('/tts', methods=['POST'])
def tts_route():
    try:
        data = request.json
        text = data.get('text', '')
        if not text:
            return "No text provided", 400
        
        print(f"[EdgeTTS] Request for: {text[:20]}...")
        
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            audio_data = loop.run_until_complete(generate_audio_async(text))
        finally:
            loop.close()
        
        return send_file(audio_data, mimetype="audio/mpeg")

    except Exception as e:
        err = traceback.format_exc()
        print(f"[EdgeTTS] Error:\n{err}")
        return err, 500

@app.route('/')
def index():
    return "Edge TTS Server is Running on /tts (POST)"

if __name__ == '__main__':
    # Use port 5070 to avoid conflicts
    app.run(port=5070, host='0.0.0.0', debug=False)
