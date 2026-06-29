param(
  [string]$Port = "COM4",
  [int]$HttpPort = 17384,
  [switch]$TestPulse
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$logsDir = Join-Path $repoRoot "Logs"
$bridgeScript = Join-Path $PSScriptRoot "local_serial_http_bridge.ps1"
$panelPath = Join-Path $PSScriptRoot "gamepad_serial_bridge\index.html"
$bridgeUrl = "http://127.0.0.1:$HttpPort"
$statusUrl = "$bridgeUrl/status"
$panelUrl = "file:///$($panelPath.Replace('\', '/'))?transport=native-bridge&autostart=1"

New-Item -ItemType Directory -Force -Path $logsDir | Out-Null

function Test-BridgeReady {
  try {
    Invoke-RestMethod -Uri $statusUrl -TimeoutSec 1 | Out-Null
    return $true
  } catch {
    return $false
  }
}

if (-not (Test-BridgeReady)) {
  $powershell = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
  $arguments = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", "`"$bridgeScript`"",
    "-Port", $Port,
    "-HttpPort", $HttpPort
  )

  Start-Process `
    -FilePath $powershell `
    -ArgumentList $arguments `
    -WorkingDirectory $repoRoot `
    -WindowStyle Normal
}

$ready = $false
for ($attempt = 0; $attempt -lt 40; $attempt++) {
  if (Test-BridgeReady) {
    $ready = $true
    break
  }
  Start-Sleep -Milliseconds 500
}

if (-not $ready) {
  Write-Host "Native pedal bridge did not answer at $statusUrl."
  Write-Host "Confirm $Port is not open elsewhere and check the bridge PowerShell window."
  Start-Process $panelUrl
  exit 1
}

Write-Host "Native pedal bridge is ready at $bridgeUrl."

if ($TestPulse) {
  Invoke-RestMethod `
    -Uri "$bridgeUrl/send" `
    -Method Post `
    -ContentType "application/json" `
    -Body (@{ line = "T50" } | ConvertTo-Json -Compress) | Out-Null
  Start-Sleep -Milliseconds 1000
  Invoke-RestMethod `
    -Uri "$bridgeUrl/send" `
    -Method Post `
    -ContentType "application/json" `
    -Body (@{ line = "R" } | ConvertTo-Json -Compress) | Out-Null
}

Start-Process $panelUrl
