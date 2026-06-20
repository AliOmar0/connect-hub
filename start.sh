#!/usr/bin/env bash
# Quick start for local development (macOS / Linux).
# Runs the backend stack (Node API + free edge TTS) AND the Vite frontend together.
#
# First time only:  ./scripts/setup-backend.sh
#
# Backend-only (frontend is on Vercel):  npm run backend

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

echo "Starting backend (Node API + edge TTS) and frontend..."
# concurrently is already a dev dependency; run both with prefixed output.
npx concurrently -n backend,web -c cyan,green \
  "node scripts/dev-backend.mjs node tts" \
  "npm run dev"
