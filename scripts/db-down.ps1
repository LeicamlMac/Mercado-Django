Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Set-Location "$PSScriptRoot\.."
.\scripts\load-env.ps1

docker compose -f docker-compose.postgres.yml down
Write-Host "PostgreSQL parado."
