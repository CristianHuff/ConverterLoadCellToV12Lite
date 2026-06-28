param(
  [string]$Port = "COM4",
  [int]$Baud = 115200,
  [int]$HttpPort = 17384
)

$ErrorActionPreference = "Stop"

$serial = [System.IO.Ports.SerialPort]::new($Port, $Baud, [System.IO.Ports.Parity]::None, 8, [System.IO.Ports.StopBits]::One)
$serial.Handshake = [System.IO.Ports.Handshake]::None
$serial.NewLine = "`n"
$serial.ReadTimeout = 20
$serial.WriteTimeout = 1000

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://127.0.0.1:$HttpPort/")

$rxLines = New-Object System.Collections.Generic.List[string]
$rxCount = 0
$txCount = 0
$startedAt = [DateTimeOffset]::UtcNow
$lastHeartbeatAt = [DateTimeOffset]::UtcNow

function Write-Banner {
  Clear-Host
  Write-Host "============================================================"
  Write-Host "  Pedal Bridge - Local COM Bridge"
  Write-Host "============================================================"
  Write-Host "  Project: Sim Ruito / PC pedal bridge to Arduino/PXN"
  Write-Host "  Serial:  $Port @ $Baud"
  Write-Host "  HTTP:    http://127.0.0.1:$HttpPort/"
  Write-Host ""
  Write-Host "  Keep this window open while playing."
  Write-Host "  Close it only when you want to release the Arduino COM port."
  Write-Host "  Browser panel: tools/gamepad_serial_bridge/index.html"
  Write-Host "============================================================"
  Write-Host ""
}

function Add-RxLine([string]$line) {
  if ([string]::IsNullOrWhiteSpace($line)) { return }
  $script:rxCount++
  $rxLines.Add($line)
  while ($rxLines.Count -gt 50) {
    $rxLines.RemoveAt(0)
  }
}

function Drain-Serial {
  while ($serial.BytesToRead -gt 0) {
    try {
      $line = $serial.ReadLine().Trim()
      Add-RxLine $line
      Write-Host "RX: $line"
    } catch {
      break
    }
  }
}

function Send-Json($response, [int]$statusCode, $body) {
  $json = $body | ConvertTo-Json -Depth 6 -Compress
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $response.StatusCode = $statusCode
  $response.ContentType = "application/json; charset=utf-8"
  $response.Headers.Add("Access-Control-Allow-Origin", "*")
  $response.Headers.Add("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
  $response.Headers.Add("Access-Control-Allow-Headers", "Content-Type")
  $response.OutputStream.Write($bytes, 0, $bytes.Length)
  $response.Close()
}

function Bridge-Status {
  Drain-Serial

  $now = [DateTimeOffset]::UtcNow
  if (($now - $script:lastHeartbeatAt).TotalSeconds -ge 30) {
    $script:lastHeartbeatAt = $now
    $uptime = [int](($now - $startedAt).TotalSeconds)
    Write-Host "STATUS: uptime ${uptime}s | TX $txCount | RX $rxCount | last RX: $(if ($rxLines.Count -gt 0) { $rxLines[$rxLines.Count - 1] } else { 'none' })"
  }

  return @{
    ok = $true
    port = $Port
    baud = $Baud
    uptimeMs = [int](([DateTimeOffset]::UtcNow - $startedAt).TotalMilliseconds)
    txCount = $txCount
    rxCount = $rxCount
    rxLast = if ($rxLines.Count -gt 0) { $rxLines[$rxLines.Count - 1] } else { "" }
    rxLines = @($rxLines)
  }
}

try {
  Write-Banner
  Write-Host "Opening $Port at $Baud..."
  $serial.Open()

  # Arduino Nano usually resets when the port opens.
  Start-Sleep -Milliseconds 3500

  $listener.Start()
  Write-Host "READY: local serial bridge is listening."
  Write-Host "READY: open the panel and select Local COM bridge."
  Write-Host "STOP: press Ctrl+C or close this window."
  Write-Host ""

  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response

    if ($request.HttpMethod -eq "OPTIONS") {
      Send-Json $response 200 @{ ok = $true }
      continue
    }

    try {
      if ($request.Url.AbsolutePath -eq "/status") {
        Send-Json $response 200 (Bridge-Status)
        continue
      }

      if ($request.Url.AbsolutePath -eq "/send" -and $request.HttpMethod -eq "POST") {
        $reader = [System.IO.StreamReader]::new($request.InputStream, $request.ContentEncoding)
        $bodyText = $reader.ReadToEnd()
        $reader.Close()

        $command = ""
        if ($request.ContentType -like "application/json*") {
          $payload = $bodyText | ConvertFrom-Json
          $command = [string]$payload.line
        } else {
          $command = $bodyText
        }

        $command = $command.Trim()
        if ($command.Length -eq 0) {
          Send-Json $response 400 @{ ok = $false; error = "Empty command" }
          continue
        }

        $serial.WriteLine($command)
        $txCount++
        Write-Host "TX: $command"

        Start-Sleep -Milliseconds 10
        $status = Bridge-Status
        $status.command = $command
        Send-Json $response 200 $status
        continue
      }

      Send-Json $response 404 @{ ok = $false; error = "Not found" }
    } catch {
      Send-Json $response 500 @{ ok = $false; error = $_.Exception.Message }
    }
  }
} finally {
  if ($listener.IsListening) {
    $listener.Stop()
  }
  if ($serial.IsOpen) {
    $serial.Close()
  }
}
