#!/usr/bin/env bash
# One-time setup for the connect-hub backend dev stack (macOS / Linux).
#
#   - Installs Node dependencies (npm install) if needed.
#   - Creates a shared Python venv (.venv-backend) for the lightweight services
#     (edge TTS + OTP microservice).
#   - Optionally installs the heavy WhatsApp/Whisper backend with:  --with-whatsapp
#
# Usage:
#   ./scripts/setup-backend.sh
#   ./scripts/setup-backend.sh --with-whatsapp

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV="$ROOT/.venv-backend"
VENV_PY="$VENV/bin/python"
INCLUDE_WA=0
[[ "${1:-}" == "--with-whatsapp" ]] && INCLUDE_WA=1

echo "==> connect-hub backend setup"

# 1. Node deps
if [[ ! -d "$ROOT/node_modules" ]]; then
  echo "==> Installing Node dependencies (npm install)..."
  (cd "$ROOT" && npm install)
else
  echo "==> Node dependencies already present (skipping npm install)."
fi

# 2. Python venv
if [[ ! -x "$VENV_PY" ]]; then
  echo "==> Creating Python venv at .venv-backend ..."
  python3 -m venv "$VENV"
else
  echo "==> Python venv already exists."
fi

echo "==> Installing lightweight Python deps (edge TTS + OTP service)..."
"$VENV_PY" -m pip install --upgrade pip
"$VENV_PY" -m pip install -r "$ROOT/scripts/backend-requirements.txt"

# 3. Optional heavy WhatsApp backend (torch / Whisper, multi-GB)
if [[ "$INCLUDE_WA" == "1" ]]; then
  echo "==> Installing WhatsApp backend deps (this is large)..."
  "$VENV_PY" -m pip install -r "$ROOT/whatsapp-support-backend/requirements.txt"
fi

# 4. .env check
if [[ ! -f "$ROOT/.env" ]]; then
  echo "==> No .env found. Creating from template - edit it before running."
  cp "$ROOT/.env.example" "$ROOT/.env"
fi

echo ""
echo "Setup complete."
echo "Start the free backend stack with:  npm run backend"
echo "Include OTP service with:           npm run backend:otp"
