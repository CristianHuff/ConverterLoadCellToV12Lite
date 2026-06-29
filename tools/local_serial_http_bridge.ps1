param(
  [string]$Port = "COM4",
  [int]$Baud = 115200,
  [int]$HttpPort = 17384
)

$ErrorActionPreference = "Stop"

$nativeCode = @"
using System;
using System.Runtime.InteropServices;

public static class NativeJoystick
{
    public const int JOY_RETURNX = 0x00000001;
    public const int JOY_RETURNY = 0x00000002;
    public const int JOY_RETURNZ = 0x00000004;
    public const int JOY_RETURNR = 0x00000008;
    public const int JOY_RETURNU = 0x00000010;
    public const int JOY_RETURNV = 0x00000020;
    public const int JOY_RETURNPOV = 0x00000040;
    public const int JOY_RETURNBUTTONS = 0x00000080;
    public const int JOY_RETURNALL = JOY_RETURNX | JOY_RETURNY | JOY_RETURNZ | JOY_RETURNR | JOY_RETURNU | JOY_RETURNV | JOY_RETURNPOV | JOY_RETURNBUTTONS;
    public const int JOYERR_NOERROR = 0;

    [StructLayout(LayoutKind.Sequential)]
    public struct JOYINFOEX
    {
        public UInt32 dwSize;
        public UInt32 dwFlags;
        public UInt32 dwXpos;
        public UInt32 dwYpos;
        public UInt32 dwZpos;
        public UInt32 dwRpos;
        public UInt32 dwUpos;
        public UInt32 dwVpos;
        public UInt32 dwButtons;
        public UInt32 dwButtonNumber;
        public UInt32 dwPOV;
        public UInt32 dwReserved1;
        public UInt32 dwReserved2;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct JOYCAPSW
    {
        public UInt16 wMid;
        public UInt16 wPid;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
        public string szPname;
        public UInt32 wXmin;
        public UInt32 wXmax;
        public UInt32 wYmin;
        public UInt32 wYmax;
        public UInt32 wZmin;
        public UInt32 wZmax;
        public UInt32 wNumButtons;
        public UInt32 wPeriodMin;
        public UInt32 wPeriodMax;
        public UInt32 wRmin;
        public UInt32 wRmax;
        public UInt32 wUmin;
        public UInt32 wUmax;
        public UInt32 wVmin;
        public UInt32 wVmax;
        public UInt32 wCaps;
        public UInt32 wMaxAxes;
        public UInt32 wNumAxes;
        public UInt32 wMaxButtons;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)]
        public string szRegKey;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
        public string szOEMVxD;
    }

    [DllImport("winmm.dll")]
    public static extern UInt32 joyGetNumDevs();

    [DllImport("winmm.dll")]
    public static extern UInt32 joyGetPosEx(UInt32 uJoyID, ref JOYINFOEX pji);

    [DllImport("winmm.dll", CharSet = CharSet.Unicode)]
    public static extern UInt32 joyGetDevCapsW(UInt32 uJoyID, ref JOYCAPSW pjc, UInt32 cbjc);
}
"@

if (-not ("NativeJoystick" -as [type])) {
  Add-Type -TypeDefinition $nativeCode
}

$serial = [System.IO.Ports.SerialPort]::new($Port, $Baud, [System.IO.Ports.Parity]::None, 8, [System.IO.Ports.StopBits]::One)
$serial.Handshake = [System.IO.Ports.Handshake]::None
$serial.NewLine = "`n"
$serial.ReadTimeout = 5
$serial.WriteTimeout = 1000

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://127.0.0.1:$HttpPort/")

$rxLines = New-Object System.Collections.Generic.List[string]
$rxCount = 0
$txCount = 0
$startedAt = [DateTimeOffset]::UtcNow
$lastHeartbeatAt = [DateTimeOffset]::UtcNow
$running = $false
$lastLine = "0,0,0"
$lastSendAt = [DateTimeOffset]::MinValue
$lastError = ""
$lastSample = $null
$lastOutput = @{ clutch = 0; brake = 0; throttle = 0 }
$dropStart = @{ clutch = 0.0; brake = 0.0; throttle = 0.0 }
$guardCount = @{ clutch = 0; brake = 0; throttle = 0 }

$config = @{
  joystickId = $null
  selectedGamepadId = ""
  lockGamepad = $true
  rateHz = 50
  txMode = "continuous"
  pedalProfile = "linear"
  customCurve = @(0, 45, 75, 90, 100)
  deadzonePct = 0
  dropoutGuardMs = @{ clutch = 0; brake = 0; throttle = 0 }
  mappings = @{
    clutch = @{ axis = 1; min = -1.0; max = 1.0; invert = $false }
    brake = @{ axis = 2; min = -1.0; max = 1.0; invert = $false }
    throttle = @{ axis = 3; min = -1.0; max = 1.0; invert = $false }
  }
}

function Write-Banner {
  Clear-Host
  Write-Host "============================================================"
  Write-Host "  Pedal Bridge - Native Gamepad + COM Bridge"
  Write-Host "============================================================"
  Write-Host "  Project: Sim Ruito / PC pedal bridge to Arduino/PXN"
  Write-Host "  Serial:  $Port @ $Baud"
  Write-Host "  HTTP:    http://127.0.0.1:$HttpPort/"
  Write-Host "  Input:   Windows native joystick API, not browser Gamepad API"
  Write-Host ""
  Write-Host "  Keep this window open while playing."
  Write-Host "  Close it only when you want to release the Arduino COM port."
  Write-Host "============================================================"
  Write-Host ""
}

function Clamp-Pct([double]$value) {
  if ([double]::IsNaN($value) -or [double]::IsInfinity($value)) { return 0 }
  return [Math]::Max(0, [Math]::Min(100, [int][Math]::Round($value)))
}

function Normalize-Axis([uint32]$value) {
  $normalized = (($value / 65535.0) * 2.0) - 1.0
  return [Math]::Round([Math]::Max(-1.0, [Math]::Min(1.0, $normalized)), 6)
}

function Apply-Curve([int]$pct, [object[]]$outputs) {
  $inputPoints = @(0, 25, 50, 75, 100)
  $points = @(0, 45, 75, 90, 100)
  if ($outputs -and $outputs.Count -eq 5) {
    $points = @($outputs | ForEach-Object { Clamp-Pct ([double]$_) })
  }

  $pct = Clamp-Pct $pct
  if ($pct -le $inputPoints[0]) { return [int]$points[0] }
  if ($pct -ge $inputPoints[4]) { return [int]$points[4] }

  for ($index = 1; $index -lt $inputPoints.Count; $index++) {
    if ($pct -le $inputPoints[$index]) {
      $inputLow = $inputPoints[$index - 1]
      $inputHigh = $inputPoints[$index]
      $outputLow = [double]$points[$index - 1]
      $outputHigh = [double]$points[$index]
      $ratio = ($pct - $inputLow) / ($inputHigh - $inputLow)
      return Clamp-Pct ($outputLow + ($ratio * ($outputHigh - $outputLow)))
    }
  }
  return $pct
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

function Write-SerialLine([string]$line) {
  $command = ([string]$line).Trim()
  if ($command.Length -eq 0) { return }
  $serial.WriteLine($command)
  $script:txCount++
  $script:lastLine = $command
  $script:lastSendAt = [DateTimeOffset]::UtcNow
}

function New-JoyInfo {
  $info = [NativeJoystick+JOYINFOEX]::new()
  $info.dwSize = [System.Runtime.InteropServices.Marshal]::SizeOf([NativeJoystick+JOYINFOEX])
  $info.dwFlags = [NativeJoystick]::JOY_RETURNALL
  return $info
}

function Get-JoystickInfo([int]$id) {
  $info = New-JoyInfo
  $result = [NativeJoystick]::joyGetPosEx([uint32]$id, [ref]$info)
  if ($result -ne [NativeJoystick]::JOYERR_NOERROR) { return $null }
  return $info
}

function Get-JoystickCaps([int]$id) {
  $caps = [NativeJoystick+JOYCAPSW]::new()
  $size = [System.Runtime.InteropServices.Marshal]::SizeOf([NativeJoystick+JOYCAPSW])
  $result = [NativeJoystick]::joyGetDevCapsW([uint32]$id, [ref]$caps, [uint32]$size)
  if ($result -ne [NativeJoystick]::JOYERR_NOERROR) { return $null }
  return $caps
}

function Get-NormalizedAxes($info) {
  # Axis 0 is intentionally a dummy so saved mappings 1/2/3 map to X/Y/Z.
  return @(
    0.0,
    (Normalize-Axis $info.dwXpos),
    (Normalize-Axis $info.dwYpos),
    (Normalize-Axis $info.dwZpos),
    (Normalize-Axis $info.dwRpos),
    (Normalize-Axis $info.dwUpos),
    (Normalize-Axis $info.dwVpos)
  )
}

function Get-Joysticks {
  $result = @()
  $count = [int][NativeJoystick]::joyGetNumDevs()
  for ($id = 0; $id -lt $count; $id++) {
    $caps = Get-JoystickCaps $id
    if (-not $caps) { continue }
    $info = Get-JoystickInfo $id
    if (-not $info) { continue }
    $axes = Get-NormalizedAxes $info
    $name = if ($caps.szPname) { $caps.szPname } else { "Joystick $id" }
    $result += [ordered]@{
      id = $id
      index = $id
      name = $name
      axes = $axes
      axisCount = $axes.Count
      buttons = [int]$caps.wNumButtons
      connected = $true
    }
  }
  return @($result)
}

function Get-SelectedJoystickId {
  $joysticks = @(Get-Joysticks)
  if ($joysticks.Count -eq 0) { return $null }

  if ($null -ne $config.joystickId) {
    foreach ($joystick in $joysticks) {
      if ([int]$joystick.id -eq [int]$config.joystickId) { return [int]$joystick.id }
    }
  }

  $selected = ([string]$config.selectedGamepadId).Trim()
  if ($selected.Length -gt 0) {
    $prefix = $selected.Split([char]":", 2)[0]
    $parsed = 0
    if ([int]::TryParse($prefix, [ref]$parsed)) {
      foreach ($joystick in $joysticks) {
        if ([int]$joystick.id -eq $parsed) { return [int]$joystick.id }
      }
    }

    foreach ($joystick in $joysticks) {
      if ($selected -eq $joystick.name -or $selected -eq "$($joystick.id): $($joystick.name)") {
        return [int]$joystick.id
      }
    }
  }

  foreach ($joystick in $joysticks) {
    $name = ([string]$joystick.name).ToLowerInvariant()
    if ($name -match "sim|ruito|pedal|freejoy") { return [int]$joystick.id }
  }

  return [int]$joysticks[0].id
}

function Get-AxisSample([object[]]$axes, [string]$key) {
  $mapping = $config.mappings[$key]
  $axis = [int]$mapping.axis
  $raw = if ($axis -ge 0 -and $axis -lt $axes.Count) { [double]$axes[$axis] } else { 0.0 }
  $min = [double]$mapping.min
  $max = [double]$mapping.max
  $pct = if ($max -eq $min) { 0.0 } else { (($raw - $min) * 100.0) / ($max - $min) }
  if ([bool]$mapping.invert) { $pct = 100.0 - $pct }

  return [ordered]@{
    axis = $axis
    raw = $raw
    min = $min
    max = $max
    invert = [bool]$mapping.invert
    pct = (Clamp-Pct $pct)
  }
}

function Filter-Pct([string]$key, [int]$pct) {
  $deadzone = [Math]::Max(0, [Math]::Min(10, [int][double]$config.deadzonePct))
  if ($pct -le $deadzone) { $pct = 0 }

  $guardMs = [Math]::Max(0, [Math]::Min(250, [int][double]$config.dropoutGuardMs[$key]))
  $previous = [int]$lastOutput[$key]
  $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()

  if ($guardMs -gt 0 -and $previous -ge 95 -and $pct -eq 0) {
    if ([double]$dropStart[$key] -eq 0.0) {
      $dropStart[$key] = [double]$now
      $guardCount[$key] = [int]$guardCount[$key] + 1
    }
    if (($now - [double]$dropStart[$key]) -lt $guardMs) {
      return $previous
    }
  } else {
    $dropStart[$key] = 0.0
  }

  return $pct
}

function Apply-Profile([string]$key, [int]$pct) {
  if ($key -ne "throttle") { return (Clamp-Pct $pct) }
  if ($config.pedalProfile -eq "gt7") { return (Apply-Curve $pct @(0, 45, 75, 90, 100)) }
  if ($config.pedalProfile -eq "custom") { return (Apply-Curve $pct @($config.customCurve)) }
  return (Clamp-Pct $pct)
}

function Read-PedalSample {
  $joystickId = Get-SelectedJoystickId
  if ($null -eq $joystickId) {
    return [ordered]@{
      hasGamepad = $false
      joystick = $null
      axes = @()
      buttons = @()
      samples = @{}
      pedals = @{ clutch = 0; brake = 0; throttle = 0 }
      line = "0,0,0"
    }
  }

  $info = Get-JoystickInfo $joystickId
  if (-not $info) {
    throw "Selected joystick $joystickId is not readable"
  }

  $caps = Get-JoystickCaps $joystickId
  $axes = Get-NormalizedAxes $info
  $samples = @{}
  $pedals = @{}
  foreach ($key in @("clutch", "brake", "throttle")) {
    $sample = Get-AxisSample $axes $key
    $filtered = Filter-Pct $key ([int]$sample.pct)
    $output = Apply-Profile $key $filtered
    $sample.filteredPct = $filtered
    $sample.outputPct = $output
    $samples[$key] = $sample
    $pedals[$key] = $output
  }

  return [ordered]@{
    hasGamepad = $true
    joystick = [ordered]@{
      id = $joystickId
      index = $joystickId
      name = if ($caps -and $caps.szPname) { $caps.szPname } else { "Joystick $joystickId" }
      axes = $axes
      connected = $true
    }
    axes = $axes
    buttons = @()
    samples = $samples
    pedals = $pedals
    line = "$($pedals.clutch),$($pedals.brake),$($pedals.throttle)"
  }
}

function Update-Stream {
  if (-not $running) { return }

  try {
    $sample = Read-PedalSample
    $script:lastSample = $sample
    $script:lastOutput = @{
      clutch = [int]$sample.pedals.clutch
      brake = [int]$sample.pedals.brake
      throttle = [int]$sample.pedals.throttle
    }

    if (-not $sample.hasGamepad) { return }

    $line = [string]$sample.line
    $ageMs = if ($lastSendAt -eq [DateTimeOffset]::MinValue) { 999999 } else { ([DateTimeOffset]::UtcNow - $lastSendAt).TotalMilliseconds }
    if ($config.txMode -eq "continuous" -or $line -ne $lastLine -or $ageMs -ge 100) {
      Write-SerialLine $line
    }
  } catch {
    $script:lastError = $_.Exception.Message
  }
}

function Update-Config($payload) {
  if (-not $payload) { return }

  foreach ($property in $payload.PSObject.Properties) {
    $name = $property.Name
    $value = $property.Value

    if ($name -eq "mappings" -and $value) {
      foreach ($pedalProperty in $value.PSObject.Properties) {
        $pedal = $pedalProperty.Name
        if (-not $config.mappings.ContainsKey($pedal)) { continue }
        foreach ($mapProperty in $pedalProperty.Value.PSObject.Properties) {
          $config.mappings[$pedal][$mapProperty.Name] = $mapProperty.Value
        }
      }
    } elseif ($name -eq "dropoutGuardMs" -and $value) {
      foreach ($guardProperty in $value.PSObject.Properties) {
        $config.dropoutGuardMs[$guardProperty.Name] = $guardProperty.Value
      }
    } elseif ($name -eq "selectedGamepadId") {
      $config.selectedGamepadId = [string]$value
      $prefix = ([string]$value).Split([char]":", 2)[0]
      $parsed = 0
      if ([int]::TryParse($prefix, [ref]$parsed)) {
        $config.joystickId = $parsed
      }
    } elseif ($config.ContainsKey($name)) {
      $config[$name] = $value
    }
  }
}

function Bridge-Status {
  Drain-Serial

  if ($null -eq $lastSample) {
    try { $script:lastSample = Read-PedalSample } catch { $script:lastError = $_.Exception.Message }
  }

  $now = [DateTimeOffset]::UtcNow
  if (($now - $script:lastHeartbeatAt).TotalSeconds -ge 30) {
    $script:lastHeartbeatAt = $now
    $uptime = [int](($now - $startedAt).TotalSeconds)
    Write-Host "STATUS: uptime ${uptime}s | running $running | TX $txCount | RX $rxCount | last TX: $lastLine | last RX: $(if ($rxLines.Count -gt 0) { $rxLines[$rxLines.Count - 1] } else { 'none' })"
  }

  $sample = if ($lastSample) { $lastSample } else {
    [ordered]@{
      hasGamepad = $false
      joystick = $null
      axes = @()
      buttons = @()
      samples = @{}
      pedals = @{ clutch = 0; brake = 0; throttle = 0 }
      line = "0,0,0"
    }
  }

  return [ordered]@{
    ok = $true
    mode = "native-pedal-bridge"
    nativeGamepad = $true
    port = $Port
    baud = $Baud
    uptimeMs = [int](([DateTimeOffset]::UtcNow - $startedAt).TotalMilliseconds)
    running = $running
    txCount = $txCount
    rxCount = $rxCount
    rxLast = if ($rxLines.Count -gt 0) { $rxLines[$rxLines.Count - 1] } else { "native bridge active" }
    rxLines = @($rxLines)
    serialConfirmed = $true
    lastLine = $lastLine
    lastError = $lastError
    joysticks = @(Get-Joysticks)
    joystick = $sample.joystick
    hasGamepad = [bool]$sample.hasGamepad
    axes = @($sample.axes)
    buttons = @($sample.buttons)
    samples = $sample.samples
    pedals = $sample.pedals
    outputLine = $sample.line
    guardCount = $guardCount
    config = $config
  }
}

function Send-Json($response, [int]$statusCode, $body) {
  $json = $body | ConvertTo-Json -Depth 12 -Compress
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $response.StatusCode = $statusCode
  $response.ContentType = "application/json; charset=utf-8"
  $response.Headers.Add("Access-Control-Allow-Origin", "*")
  $response.Headers.Add("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
  $response.Headers.Add("Access-Control-Allow-Headers", "Content-Type")
  $response.OutputStream.Write($bytes, 0, $bytes.Length)
  $response.Close()
}

function Read-RequestBody($request) {
  $reader = [System.IO.StreamReader]::new($request.InputStream, $request.ContentEncoding)
  $bodyText = $reader.ReadToEnd()
  $reader.Close()
  if ([string]::IsNullOrWhiteSpace($bodyText)) { return $null }
  if ($request.ContentType -like "application/json*") {
    return ($bodyText | ConvertFrom-Json)
  }
  return @{ line = $bodyText }
}

try {
  Write-Banner
  Write-Host "Opening $Port at $Baud..."
  $serial.Open()

  # Arduino Nano usually resets when the port opens.
  Start-Sleep -Milliseconds 3500

  $listener.Start()
  $pendingContext = $listener.GetContextAsync()
  Write-Host "READY: native pedal bridge is listening."
  Write-Host "READY: open the panel and select Native pedal bridge."
  Write-Host "STOP: press Ctrl+C or close this window."
  Write-Host ""

  while ($listener.IsListening) {
    $rate = [Math]::Max(10, [Math]::Min(120, [int][double]$config.rateHz))
    $periodMs = [Math]::Max(1, [int](1000 / $rate))
    $loopStarted = [DateTimeOffset]::UtcNow

    Drain-Serial
    Update-Stream

    if ($pendingContext.Wait(1)) {
      $context = $pendingContext.Result
      $pendingContext = $listener.GetContextAsync()
      $request = $context.Request
      $response = $context.Response

      if ($request.HttpMethod -eq "OPTIONS") {
        Send-Json $response 200 @{ ok = $true }
        continue
      }

      try {
        $path = $request.Url.AbsolutePath
        if ($path -eq "/status") {
          Send-Json $response 200 (Bridge-Status)
          continue
        }

        if ($path -eq "/config" -and $request.HttpMethod -eq "POST") {
          Update-Config (Read-RequestBody $request)
          Send-Json $response 200 (Bridge-Status)
          continue
        }

        if ($path -eq "/start" -and $request.HttpMethod -eq "POST") {
          $payload = Read-RequestBody $request
          if ($payload -and $payload.config) { Update-Config $payload.config }
          $script:running = $true
          $script:lastLine = ""
          Send-Json $response 200 (Bridge-Status)
          continue
        }

        if ($path -eq "/stop" -and $request.HttpMethod -eq "POST") {
          $script:running = $false
          Write-SerialLine "0,0,0"
          Send-Json $response 200 (Bridge-Status)
          continue
        }

        if ($path -eq "/send" -and $request.HttpMethod -eq "POST") {
          $payload = Read-RequestBody $request
          $command = if ($payload -and $payload.line) { [string]$payload.line } else { "" }
          if ($command.Trim().Length -eq 0) {
            Send-Json $response 400 @{ ok = $false; error = "Empty command" }
            continue
          }
          Write-SerialLine $command
          Write-Host "TX: $($command.Trim())"
          Send-Json $response 200 (Bridge-Status)
          continue
        }

        Send-Json $response 404 @{ ok = $false; error = "Not found" }
      } catch {
        Send-Json $response 500 @{ ok = $false; error = $_.Exception.Message }
      }
    }

    $elapsedMs = ([DateTimeOffset]::UtcNow - $loopStarted).TotalMilliseconds
    $sleepMs = [Math]::Max(1, $periodMs - [int]$elapsedMs)
    Start-Sleep -Milliseconds $sleepMs
  }
} finally {
  try { Write-SerialLine "0,0,0" } catch {}
  if ($listener.IsListening) {
    $listener.Stop()
  }
  if ($serial.IsOpen) {
    $serial.Close()
  }
}
