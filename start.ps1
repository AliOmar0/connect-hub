Write-Host "Starting backend..."
cd whatsapp-support-backend
.venv\Scripts\Activate.ps1
Start-Process powershell -ArgumentList "python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"

Write-Host "Starting frontend..."
cd ../whatsapp-support-frontend
npm run dev