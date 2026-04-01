param(
  [string]$Path = ".env"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not (Test-Path $Path)) {
  return
}

Get-Content $Path | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith("#")) {
    return
  }
  $parts = $line -split "=", 2
  if ($parts.Count -ne 2) {
    return
  }
  $key = $parts[0].Trim()
  $value = $parts[1].Trim().Trim("'").Trim('"')
  if ($key) {
    Set-Item -Path "Env:$key" -Value $value
  }
}
