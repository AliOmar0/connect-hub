# One-time setup for the connect-hub backend dev stack (Windows / PowerShell).
#
#   - Installs Node dependencies (npm install) if needed.
#   - Creates a shared Python venv (.venv-backend) for the lightweight services
#     (edge TTS + OTP microservice).
#   - Optionally installs the heavy WhatsApp/Whisper backend with:  -IncludeWhatsApp
#
# Usage:
#   ./scripts/setup-backend.ps1
#   ./scripts/setup-backend.ps1 -IncludeWhatsApp

param(
    [switch]$IncludeWhatsApp
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$venv = Join-Path $root ".venv-backend"
$venvPy = Join-Path $venv "Scripts\python.exe"

Write-Host "==> connect-hub backend setup" -ForegroundColor Cyan

# 1. Node deps
if (-not (Test-Path (Join-Path $root "node_modules"))) {
    Write-Host "==> Installing Node dependencies (npm install)..." -ForegroundColor Cyan
    Push-Location $root
    npm install
    Pop-Location
} else {
    Write-Host "==> Node dependencies already present (skipping npm install)." -ForegroundColor DarkGray
}

# 2. Python venv
if (-not (Test-Path $venvPy)) {
    Write-Host "==> Creating Python venv at .venv-backend ..." -ForegroundColor Cyan
    python -m venv $venv
} else {
    Write-Host "==> Python venv already exists." -ForegroundColor DarkGray
}

Write-Host "==> Installing lightweight Python deps (edge TTS + OTP service)..." -ForegroundColor Cyan
& $venvPy -m pip install --upgrade pip
& $venvPy -m pip install -r (Join-Path $root "scripts\backend-requirements.txt")

# 3. Optional heavy WhatsApp backend (torch / Whisper, multi-GB)
if ($IncludeWhatsApp) {
    Write-Host "==> Installing WhatsApp backend deps (this is large)..." -ForegroundColor Yellow
    & $venvPy -m pip install -r (Join-Path $root "whatsapp-support-backend\requirements.txt")
}

# 4. .env check
if (-not (Test-Path (Join-Path $root ".env"))) {
    Write-Host "==> No .env found. Copy .env.example to .env and fill in values." -ForegroundColor Yellow
    Copy-Item (Join-Path $root ".env.example") (Join-Path $root ".env")
    Write-Host "    Created .env from template - edit it before running." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Setup complete." -ForegroundColor Green
Write-Host "Start the free backend stack with:  npm run backend" -ForegroundColor Green
Write-Host "Include OTP service with:           npm run backend:otp" -ForegroundColor Green
