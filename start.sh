#!/bin/bash

echo "Starting backend..."
cd whatsapp-support-backend
source .venv/Scripts/activate
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &

echo "Starting frontend..."
cd ../whatsapp-support-frontend
npm run dev