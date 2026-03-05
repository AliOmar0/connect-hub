from pyngrok import ngrok
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def start_tunnel():
    # Set authtoken if you have one (optional, but recommended)
    # ngrok.set_auth_token("YOUR_AUTHTOKEN")
    
    # Open a HTTP tunnel on port 5000
    # Use ID and URL from .env if available
    ngrok_id = os.getenv("ID")
    ngrok_url = os.getenv("URL")
    
    if ngrok_id and len(ngrok_id) > 20 and not ngrok_id.startswith("rd_"):
        ngrok.set_auth_token(ngrok_id)
    
    connect_kwargs = {"addr": 5000}
    if ngrok_url:
        connect_kwargs["domain"] = ngrok_url
    if ngrok_id:
        connect_kwargs["name"] = ngrok_id
        
    public_url = ngrok.connect(**connect_kwargs).public_url
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
