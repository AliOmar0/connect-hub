# Quick start for local development (Windows / PowerShell).
# Runs the backend stack (Node API + free edge TTS) AND the Vite frontend together.
#
# First time only:  ./scripts/setup-backend.ps1
#
# Backend-only (frontend is on Vercel):  npm run backend

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "Starting backend (Node API + edge TTS) and frontend..." -ForegroundColor Cyan
Push-Location $root
# concurrently is already a dev dependency; run both with prefixed output.
npx concurrently -n backend,web -c cyan,green `
    "node scripts/dev-backend.mjs node tts" `
    "npm run dev"
Pop-Location
