from pyngrok import ngrok
import os
from dotenv import load_dotenv
import time

# Load environment variables
load_dotenv()

def start_tunnel():
    # Open a HTTP tunnel on port 5001
    try:
        public_url = ngrok.connect(5001).public_url
        print(f"\n==============================================")
        print(f"OTP Service NGROK Tunnel is live!")
        print(f"Public URL: {public_url}")
        print(f"==============================================\n")
        
        # Keep the tunnel open
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("Shutting down tunnel...")
        ngrok.kill()
    except Exception as e:
        print(f"Error starting ngrok: {e}")

if __name__ == "__main__":
    start_tunnel()
