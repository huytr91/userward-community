$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Userward requires Node.js 22 or newer." -ForegroundColor Red
  Write-Host "Install Node.js, then double-click START-USERWARD.cmd again."
  exit 1
}

if (-not (Test-Path "node_modules")) {
  Write-Host "Preparing Userward locally for the first run..."
  & npm.cmd install
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "Building the local application..."
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Userward is local-only: http://127.0.0.1:3000" -ForegroundColor Green
Write-Host "Close this window to stop Userward."
Start-Job -ScriptBlock {
  Start-Sleep -Seconds 3
  Start-Process "http://127.0.0.1:3000"
} | Out-Null

& npm.cmd run start:local
