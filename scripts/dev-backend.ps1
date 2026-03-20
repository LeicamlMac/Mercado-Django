Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Set-Location "$PSScriptRoot\.."
if (-not $env:BLUESOFT_COSMOS_TOKEN -or -not $env:BLUESOFT_COSMOS_USER_AGENT) {
  Write-Host "Aviso: Bluesoft Cosmos nao configurada. Defina BLUESOFT_COSMOS_TOKEN e BLUESOFT_COSMOS_USER_AGENT." -ForegroundColor Yellow
}
.\.venv\Scripts\python.exe manage.py runserver 8001
