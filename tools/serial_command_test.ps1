param(
  [Parameter(Mandatory = $true)]
  [string]$Port,

  [int]$Baud = 115200,

  [string]$Command = "T50",

  [int]$Repeat = 1,

  [int]$IntervalMs = 500
)

$ErrorActionPreference = "Stop"

$serial = [System.IO.Ports.SerialPort]::new($Port, $Baud, [System.IO.Ports.Parity]::None, 8, [System.IO.Ports.StopBits]::One)
$serial.Handshake = [System.IO.Ports.Handshake]::None
$serial.NewLine = "`n"
$serial.ReadTimeout = 250
$serial.WriteTimeout = 1000

try {
  Write-Host "Opening $Port at $Baud..."
  $serial.Open()

  # Arduino Nano commonly resets when the serial port opens.
  Start-Sleep -Milliseconds 3500

  for ($index = 0; $index -lt $Repeat; $index++) {
    Write-Host "TX: $Command"
    $serial.WriteLine($Command)
    Start-Sleep -Milliseconds $IntervalMs

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
  }
} finally {
  if ($serial.IsOpen) {
    $serial.Close()
  }
}
