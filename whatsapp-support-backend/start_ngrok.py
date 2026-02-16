from pyngrok import ngrok
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def start_tunnel():
    # Set authtoken if you have one (optional, but recommended)
    # ngrok.set_auth_token("YOUR_AUTHTOKEN")
    
    # Open a HTTP tunnel on port 8000
    public_url = ngrok.connect(5000).public_url
    print(f"\n==============================================")
    print(f"NGROK Tunnel is live!")
    print(f"Public URL: {public_url}")
    print(f"WhatsApp Webhook URL: {public_url}/webhook")
    print(f"Verify Token: {os.getenv('WHATSAPP_VERIFY_TOKEN', 'pib_verify_token_2024')}")
    print(f"==============================================\n")
    
    # Keep the tunnel open
    try:
        # Block until the tunnel is closed
        ngrok_process = ngrok.get_ngrok_process()
        ngrok_process.proc.wait()
    except KeyboardInterrupt:
        print("Shutting down tunnel...")
        ngrok.kill()

if __name__ == "__main__":
    start_tunnel()
