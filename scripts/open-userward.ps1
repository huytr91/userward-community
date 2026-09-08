$ErrorActionPreference = "Stop"
$url = "http://127.0.0.1:3001/"
$ready = $false

for ($attempt = 0; $attempt -lt 120; $attempt++) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2
    if ($response.StatusCode -eq 200 -and $response.Content -match "Userward") {
      $ready = $true
      break
    }
  } catch { }
  Start-Sleep -Milliseconds 500
}

if (-not $ready) {
  throw "Userward did not become ready at $url."
}

$edgeCandidates = @()
$edgeCommand = Get-Command msedge.exe -ErrorAction SilentlyContinue
if ($edgeCommand -and $edgeCommand.Source) {
  $edgeCandidates += $edgeCommand.Source
}
if (${env:ProgramFiles(x86)}) {
  $edgeCandidates += Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe"
}
if ($env:ProgramFiles) {
  $edgeCandidates += Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe"
}

$edgeExe = $edgeCandidates |
  Where-Object { $_ -and (Test-Path -LiteralPath $_) } |
  Select-Object -First 1

try {
  if ($edgeExe) {
    Start-Process -FilePath $edgeExe -ArgumentList @("--new-window", $url) -ErrorAction Stop
    Write-Host "Opened Userward in Microsoft Edge: $url" -ForegroundColor Green
  } else {
    Start-Process -FilePath $url -ErrorAction Stop
    Write-Host "Microsoft Edge was not found; opened Userward in the default browser: $url" -ForegroundColor Yellow
  }
} catch {
  throw "Userward is running, but the browser could not be opened automatically. $($_.Exception.Message)"
}
