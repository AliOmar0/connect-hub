from pyngrok import ngrok
import os
from dotenv import load_dotenv
import time

# Load environment variables
load_dotenv()

def start_tunnel():
    # Open a HTTP tunnel on port 5001
    try:
        # Use ID and URL from .env if available
        ngrok_id = os.getenv("ID")
        ngrok_url = os.getenv("URL")
        
        if ngrok_id and len(ngrok_id) > 20 and not ngrok_id.startswith("rd_"): 
            ngrok.set_auth_token(ngrok_id)
        
        connect_kwargs = {"addr": 5001}
        if ngrok_url:
            connect_kwargs["domain"] = ngrok_url
            
        # Only use ID as name if it's not the auth token
        if ngrok_id and len(ngrok_id) <= 20:
            connect_kwargs["name"] = ngrok_id
        else:
            connect_kwargs["name"] = "otp-service-tunnel"
            
        try:
            public_url = ngrok.connect(**connect_kwargs).public_url
            print(f"\n==============================================")
            print(f"OTP Service NGROK Tunnel is live!")
            print(f"Public URL: {public_url}")
            print(f"==============================================\n")
        except Exception as connect_error:
            if "already online" in str(connect_error).lower():
                print(f"\n[NGROK] Tunnel is already online for domain {ngrok_url}.")
                print("If you want to restart it, stop the other process or run 'taskkill /f /im ngrok.exe'\n")
                # We can't get the public_url easily if we didn't connect, 
                # but it should be the same as ngrok_url if it's reserved.
            else:
                raise connect_error
        
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
