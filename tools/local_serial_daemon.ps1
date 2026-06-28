param(
  [Parameter(Mandatory = $true)]
  [string]$Port,

  [int]$Baud = 115200
)

$ErrorActionPreference = "Stop"

$serial = [System.IO.Ports.SerialPort]::new($Port, $Baud, [System.IO.Ports.Parity]::None, 8, [System.IO.Ports.StopBits]::One)
$serial.Handshake = [System.IO.Ports.Handshake]::None
$serial.NewLine = "`n"
$serial.ReadTimeout = 20
$serial.WriteTimeout = 1000

try {
  Write-Output "DAEMON opening $Port at $Baud"
  $serial.Open()

  # Arduino Nano usually resets when the port opens.
  Start-Sleep -Milliseconds 3500
  Write-Output "DAEMON ready"

  while ($true) {
    while ($serial.BytesToRead -gt 0) {
      try {
        $rx = $serial.ReadLine().Trim()
        if ($rx.Length -gt 0) {
          Write-Output "RX $rx"
        }
      } catch {
        break
      }
    }

    if ([Console]::In.Peek() -ge 0) {
      $line = [Console]::In.ReadLine()
      if ($null -eq $line) {
        Start-Sleep -Milliseconds 5
        continue
      }

      $command = $line.Trim()
      if ($command.Length -eq 0) {
        continue
      }

      if ($command -eq "__QUIT__") {
        Write-Output "DAEMON quit"
        break
      }

      $serial.WriteLine($command)
      Write-Output "TX $command"
    } else {
      Start-Sleep -Milliseconds 5
    }
  }
} catch {
  Write-Output "ERROR $($_.Exception.Message)"
  exit 1
} finally {
  if ($serial.IsOpen) {
    $serial.Close()
  }
}
