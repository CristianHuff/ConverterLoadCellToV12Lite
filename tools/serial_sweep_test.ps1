param(
  [Parameter(Mandatory = $true)]
  [string]$Port,

  [int]$Baud = 115200,

  [ValidateSet("C", "B", "T")]
  [string]$Pedal = "T",

  [int]$DurationSec = 12,

  [int]$IntervalMs = 100
)

$ErrorActionPreference = "Stop"

$serial = [System.IO.Ports.SerialPort]::new($Port, $Baud, [System.IO.Ports.Parity]::None, 8, [System.IO.Ports.StopBits]::One)
$serial.Handshake = [System.IO.Ports.Handshake]::None
$serial.NewLine = "`n"
$serial.ReadTimeout = 50
$serial.WriteTimeout = 1000

try {
  Write-Host "Opening $Port at $Baud..."
  $serial.Open()

  # Arduino Nano commonly resets when the serial port opens.
  Start-Sleep -Milliseconds 3500

  $start = Get-Date
  while (((Get-Date) - $start).TotalSeconds -lt $DurationSec) {
    $elapsedMs = ((Get-Date) - $start).TotalMilliseconds
    $phase = ($elapsedMs % 4000) / 4000
    if ($phase -lt 0.5) {
      $pct = [int][Math]::Round($phase * 200)
    } else {
      $pct = [int][Math]::Round((1 - $phase) * 200)
    }

    $command = "$Pedal$pct"
    Write-Host "TX: $command"
    $serial.WriteLine($command)

    while ($serial.BytesToRead -gt 0) {
      try {
        $line = $serial.ReadLine().Trim()
        if ($line.Length -gt 0) {
          Write-Host "RX: $line"
        }
      } catch {
        break
      }
    }

    Start-Sleep -Milliseconds $IntervalMs
  }

  Write-Host "TX: R"
  $serial.WriteLine("R")
} finally {
  if ($serial.IsOpen) {
    $serial.Close()
  }
}
