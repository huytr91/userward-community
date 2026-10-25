# Clean production build for Userward Local (AI efficiency).
# Does not start the server. Use START-USERWARD.cmd or -Start to run after build.
# Port 3000 is reserved for AI agent RPA tools; Userward serves 3001 when started.
# -Verify runs the same contract tests the self-upgrade loop uses as gates, plus the UI audit.
param(
  [switch]$Start,
  [switch]$SkipInstall,
  [switch]$Verify
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

Write-Host "Userward Local - build script 2026.10.24.1" -ForegroundColor Cyan

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js 22+ required." -ForegroundColor Red
  exit 1
}
$nodeMajor = [int]((& node --version).TrimStart("v").Split(".")[0])
if ($nodeMajor -lt 22) {
  Write-Host "Node.js 22+ required; found $nodeMajor." -ForegroundColor Red
  exit 1
}

if (-not $SkipInstall -and -not (Test-Path "node_modules")) {
  Write-Host "npm install..."
  & npm.cmd install
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if ($Verify) {
  $failed = @()
  foreach ($suite in @("test:i18n", "test:contracts", "test:userward-core", "test:policy", "test:asi")) {
    Write-Host "npm run $suite..."
    & npm.cmd run $suite --silent | Out-Null
    if ($LASTEXITCODE -ne 0) { $failed += $suite }
  }
  New-Item -ItemType Directory -Force "benchmarks\out" | Out-Null
  & node scripts/asi/ui-audit.mjs | Out-File -Encoding utf8 "benchmarks\out\ui-audit.json"
  Write-Host "UI audit: benchmarks\out\ui-audit.json"
  if ($failed.Count -gt 0) {
    Write-Host ("Failing suites: " + ($failed -join ", ") + " (compare with the self-upgrade baseline: npm run asi:status)") -ForegroundColor Yellow
  } else {
    Write-Host "All verify suites passed." -ForegroundColor Green
  }
}

Write-Host "npm run build (clean dist)..."
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (-not (Test-Path "dist\server\index.js")) {
  Write-Host "Build finished but dist\server\index.js is missing." -ForegroundColor Red
  exit 1
}

Write-Host "Build OK." -ForegroundColor Green

if ($Start) {
  Write-Host "Starting http://127.0.0.1:3001/ (keep this window open)..." -ForegroundColor Yellow
  & npm.cmd run start:local
  exit $LASTEXITCODE
}

Write-Host "Start later: START-USERWARD.cmd  or  .\scripts\build-userward.ps1 -Start"
