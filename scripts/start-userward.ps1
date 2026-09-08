$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)
Write-Host "Starting Userward Local build 2026.08.15.2" -ForegroundColor Cyan
# Port 3001: dedicated to Userward. Port 3000 is reserved for AI agent RPA tools (Next.js).
$UserwardPort = 3001
$userwardUrl = "http://127.0.0.1:$UserwardPort/"

function Test-UserwardHealthy {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $userwardUrl -TimeoutSec 3
    return ($response.StatusCode -eq 200 -and $response.Content -match "Userward")
  } catch {
    return $false
  }
}

function Get-UserwardPortListeners {
  # netstat is used instead of Get-NetTCPConnection, which can hang for tens of seconds on this machine.
  # Do not use $matches — PowerShell's -match overwrites the automatic $Matches hashtable (same variable).
  $found = New-Object System.Collections.Generic.List[object]
  $lines = & netstat.exe -ano -p TCP 2>$null
  $pattern = "127\.0\.0\.1:$UserwardPort\s+\S+\s+LISTENING\s+(\d+)"
  foreach ($line in $lines) {
    if ($line -notmatch $pattern) { continue }
    $processId = [int]$Matches[1]
    $found.Add([pscustomobject]@{ OwningProcess = $processId })
  }
  return @($found | Sort-Object OwningProcess -Unique)
}

function Stop-UserwardPort {
  $listeners = @(Get-UserwardPortListeners)
  if (-not $listeners.Count) { return }
  $processIds = @($listeners | ForEach-Object { $_.OwningProcess }) | Where-Object { $_ } | Select-Object -Unique
  foreach ($processId in $processIds) {
    Write-Host "Stopping process $processId on port $UserwardPort so a clean rebuild can replace the live UI..." -ForegroundColor Yellow
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
  }
  $deadline = (Get-Date).AddSeconds(12)
  do {
    Start-Sleep -Milliseconds 400
    $listeners = Get-UserwardPortListeners
  } while ($listeners.Count -and (Get-Date) -lt $deadline)
  if ((Get-UserwardPortListeners).Count) {
    Write-Host "Port $UserwardPort is still in use after stopping the previous process." -ForegroundColor Red
    Write-Host "Close that application, then run START-USERWARD.cmd again."
    exit 1
  }
}

function Test-NeedsBuild {
  if (-not (Test-Path "dist\server\index.js")) { return $true }
  $distTime = (Get-Item "dist\server\index.js").LastWriteTimeUtc
  $watch = @("app", "scripts", "package.json", "vite.config.ts", "next.config.ts", "tsconfig.json")
  foreach ($item in $watch) {
    if (-not (Test-Path $item)) { continue }
    $newer = Get-ChildItem -Path $item -Recurse -File -ErrorAction SilentlyContinue |
      Where-Object { $_.LastWriteTimeUtc -gt $distTime } |
      Select-Object -First 1
    if ($newer) { return $true }
  }
  return $false
}

$needsBuild = Test-NeedsBuild
$alreadyHealthy = Test-UserwardHealthy

if ($alreadyHealthy -and -not $needsBuild) {
  Write-Host "Userward is already running with an up-to-date build. Opening Microsoft Edge..." -ForegroundColor Green
  & (Join-Path $PSScriptRoot "open-userward.ps1")
  return
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Userward requires Node.js 22 or newer." -ForegroundColor Red
  Write-Host "Install Node.js, then double-click START-USERWARD.cmd again."
  exit 1
}

$nodeMajor = [int]((& node --version).TrimStart("v").Split(".")[0])
if ($nodeMajor -lt 22) {
  Write-Host "Userward requires Node.js 22 or newer; this machine has Node.js $nodeMajor." -ForegroundColor Red
  exit 1
}

if (-not (Test-Path "node_modules")) {
  Write-Host "Preparing Userward locally for the first run..."
  & npm.cmd install
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

# Rebuild needs Userward's own port free. Do NOT touch port 3000 (RPA).
if ($needsBuild -or (Get-UserwardPortListeners).Count) {
  Stop-UserwardPort
}

if ($needsBuild -or -not (Test-Path "dist\server\index.js")) {
  Write-Host "Building the local application (clean rebuild)..."
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "Userward is local-only: $userwardUrl" -ForegroundColor Green
Write-Host "Port 3000 is reserved for AI agent RPA tools; Userward uses $UserwardPort." -ForegroundColor DarkGray
Write-Host "Microsoft Edge will open automatically when the app is ready." -ForegroundColor Green
Write-Host "Keep this window open while you use Userward. Closing it stops the server." -ForegroundColor Yellow
$openerPath = Join-Path $PSScriptRoot "open-userward.ps1"
Start-Process -FilePath powershell.exe -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $openerPath) -WindowStyle Hidden
& npm.cmd run start:local
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
