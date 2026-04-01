Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Set-Location "$PSScriptRoot\.."
.\scripts\load-env.ps1

docker compose -f docker-compose.postgres.yml up -d
docker compose -f docker-compose.postgres.yml ps

Write-Host "PostgreSQL em execucao. Aguarde o healthcheck ficar healthy se for o primeiro boot."
