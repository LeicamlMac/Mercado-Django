param(
  [int]$Threads = 64,
  [int]$OpsPerThread = 1200,
  [double]$ReadRatio = 0.85,
  [ValidateSet("real", "dry-run")][string]$WriteMode = "dry-run"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Set-Location "$PSScriptRoot\.."
.\scripts\load-env.ps1

if (-not $env:DB_BACKEND) {
  $env:DB_BACKEND = "postgres"
}

New-Item -ItemType Directory -Force -Path ".tmp" | Out-Null

.\.venv\Scripts\python.exe manage.py stress_db `
  --threads $Threads `
  --ops-per-thread $OpsPerThread `
  --read-ratio $ReadRatio `
  --write-mode $WriteMode `
  --serve `
  --open-browser `
  --output ".tmp/stress-report-heavy.html" `
  --json-output ".tmp/stress-report-heavy.json"
