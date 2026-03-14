
import requests
import json

url = "https://natxxgvlkdclejswvxha.supabase.co/rest/v1/sessions?select=id,status,created_at&order=created_at.desc&limit=20"
headers = {
    "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5hdHh4Z3Zsa2RjbGVqc3d2eGhhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTkzMzkyOSwiZXhwIjoyMDg1NTA5OTI5fQ.Y08XkCtTEBs4iChkeoxH6ioAai80INg-KC6sPjuAaNY",
    "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5hdHh4Z3Zsa2RjbGVqc3d2eGhhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTkzMzkyOSwiZXhwIjoyMDg1NTA5OTI5fQ.Y08XkCtTEBs4iChkeoxH6ioAai80INg-KC6sPjuAaNY"
}

response = requests.get(url, headers=headers)
if response.status_code == 200:
    data = response.json()
    print("Recent Sessions:")
    for s in data:
        print(f"ID: {s['id']}, Status: {s['status']}, Created At: {s['created_at']}")
    
    # Count statuses
    statuses = [s['status'] for s in data]
    print(f"\nStatus Counts in last 20:")
    for st in set(statuses):
        print(f"{st}: {statuses.count(st)}")
else:
    print(f"Error: {response.status_code}")
    print(response.text)
