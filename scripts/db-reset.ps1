Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Set-Location "$PSScriptRoot\.."
.\scripts\load-env.ps1

docker compose -f docker-compose.postgres.yml down -v
docker compose -f docker-compose.postgres.yml up -d

Write-Host "PostgreSQL resetado com volume limpo."
Write-Host "Proximo passo: .\\.venv\\Scripts\\python.exe manage.py migrate"
