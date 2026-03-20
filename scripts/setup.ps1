Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Set-Location "$PSScriptRoot\.."

if (-not (Test-Path ".venv")) {
  python -m venv .venv
}

.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py bootstrap_users
.\.venv\Scripts\python.exe manage.py seed_products
.\.venv\Scripts\python.exe manage.py normalize_catalog_taxonomy

Set-Location "frontend"
corepack pnpm install

Write-Host "Setup completed."
