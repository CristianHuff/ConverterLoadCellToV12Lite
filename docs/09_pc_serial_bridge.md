# PC Serial Pedal Bridge

This mode keeps the original `translator_box/translator_box.ino` untouched and uses a separate firmware/sketch:

```text
serial_pedal_bridge/serial_pedal_bridge.ino
```

Use this mode when the original Sim Ruito board should remain responsible for reading the load cells and bass shaker ecosystem. The PC reads the Sim Ruito board as a joystick/HID device, sends pedal percentages to the Arduino over USB serial, and the Arduino generates the analog PWM outputs for the PXN RJ45.

```text
Sim Ruito pedals -> original Sim Ruito board -> PC USB
                                               |
                                               v
                      tools/local_serial_http_bridge.ps1
                         Windows native joystick API + COM4
                                               |
                                               v
                                   tools/gamepad_serial_bridge/index.html
                                      monitoring/config UI
                                               |
                                               v
Arduino Nano serial bridge -> PWM/filter/divider -> PXN RJ45 -> PXN/base -> PS5
```

## Why This Exists

The HX711 translator cannot stay connected to the same load cells as the original Sim Ruito board. The two analog front ends influence each other even when one board is not powered.

This bridge avoids that by keeping the load cells connected only to the original Sim Ruito board.

## Arduino Firmware

Upload:

```text
serial_pedal_bridge/serial_pedal_bridge.ino
```

The Arduino expects serial lines at `115200` baud:

```text
clutch,brake,throttle
```

The browser can also talk to the legacy firmware from the `Old` reference files. If the Arduino replies with `Send lines as: brake,throttle,clutch` or `Invalid pedal line: PING`, the browser switches the wire protocol to `brake,throttle,clutch` automatically.

It also answers the diagnostic command:

```text
PING
```

with:

```text
PONG serial_pedal_bridge
```

Example:

```text
0,12,47
```

If no valid serial packet is received for `250 ms`, all outputs go to rest. During normal operation the browser sends a continuous low-latency serial stream at the configured `Send rate Hz`, even when pedal values do not change.

PWM output mapping remains:

| Function | Arduino pin |
|----------|-------------|
| Clutch PWM | D9 |
| Brake PWM | D10 |
| Throttle PWM | D11 |

This serial firmware intentionally does not handle pedal profiles, calibration, EEPROM, button input, or status LED feedback. The Arduino only maps already-processed `0..100%` serial values to the measured PWM output ranges. Pedal profiles are handled by the PC bridge.

## PC Sender

The primary PC bridge is now the local native bridge:

```powershell
powershell -ExecutionPolicy Bypass -File tools\local_serial_http_bridge.ps1 -Port COM4
```

It reads the Sim Ruito/FreeJoy joystick through the Windows native joystick API, applies the selected pedal profile, axis mapping, calibration, deadzone, and dropout guard settings, and writes the Arduino serial stream directly. This avoids the browser Gamepad API limit where Chrome/Edge may expose only part of the connected controllers when the cockpit has many USB devices.

The browser tool is still the configuration and monitoring panel:

```text
tools/gamepad_serial_bridge/index.html
```

Open it in Chrome or Edge and keep `Serial transport` set to `Native pedal bridge`. The panel talks to `http://127.0.0.1:17384/`, shows the native joystick list, and pushes settings to the PowerShell bridge. `Browser Web Serial` and `Local COM bridge` remain available as fallback/debug transports.

For normal use there are two automation options:

```text
start_pedal_bridge.cmd
```

starts the native local bridge and opens the panel with auto-start enabled.

```powershell
powershell -ExecutionPolicy Bypass -File tools\install_local_bridge_startup.ps1 -Port COM4
```

installs a Windows scheduled task that starts the local COM bridge automatically at logon. After that, just open:

```text
open_pedal_panel.cmd
```

To remove the startup task:

```powershell
powershell -ExecutionPolicy Bypass -File tools\uninstall_local_bridge_startup.ps1
```

The older `tools/gamepad_serial_bridge.html` file is kept as a compatibility launcher and redirects to the organized tool folder.

Native workflow:

1. Run `start_pedal_bridge.cmd`.
2. Keep `Serial transport` set to `Native pedal bridge`.
3. Select the Sim Ruito/FreeJoy pedal device from the native joystick list and keep `Lock selected gamepad` enabled.
4. Map clutch, brake, and throttle axes if needed. Native axis `0` is a dummy slot, so the default mapping keeps clutch `1`, brake `2`, and throttle `3`.
5. Click `Start`, or leave `Auto start when ready` enabled.

The selected gamepad and axis mapping are saved in the browser and pushed to the native bridge. This prevents a remote-play controller, such as an Xbox controller created by Moonlight, from taking over when it connects later.

In native mode, the `Connected Gamepads` panel shows devices reported by Windows `winmm`, not by the browser. This is the recommended mode when FreeJoy sees the board but Chrome/Edge lists only a few controllers. If you switch to Browser Web Serial fallback, the old browser Gamepad API limitations still apply.

After the first manual serial selection, Chrome/Edge can remember the Arduino port permission. On the next page load, the bridge tries to reconnect that authorized port and start automatically when the Sim Ruito gamepad is available.

The tool also has a named preset system. Use `Save Preset` after a known-good setup, `Load Preset` to restore the selected preset, `Delete Preset` to remove old entries, and `Export`/`Import` to move the setup between browsers or PCs. The axis mapping panel can capture the current raw value as `Min` or `Max` for each pedal, or capture all pedals at once with `Set All Min` / `Set All Max`, when browser-side range adjustment is needed.

The calibration panel provides a staged capture flow for released and pressed pedal snapshots before applying the values to the axis mapping. The diagnostics panel also shows automatic alerts and recommendations for missing locked gamepads, unconfirmed Arduino serial, quiet Arduino RX, stale serial TX, dropout guard activity, low TX rate, rest noise, and non-monotonic custom curves. Supported recommendations include an apply button to adjust the related setting directly.

Default filtering:

| Setting | Default | Purpose |
|---------|---------|---------|
| Pedal profile | Linear / PC | Selects the PC-side pedal curve before serial output |
| Send rate | 50 Hz | Continuous low-latency serial stream while running |
| TX mode | Continuous / low latency | Use `Changed + heartbeat` to match the older bridge behavior during stability tests |
| Serial heartbeat | 100 ms | Rest keepalive when the live bridge is stopped |
| Deadzone | 0% | Calibration/deadzone should be handled in FreeJoy/Sim Ruito |
| Clutch dropout guard | 0 ms | Disabled by default for lowest latency |
| Brake dropout guard | 0 ms | Disabled by default for lowest latency |
| Throttle dropout guard | 0 ms | Disabled by default for lowest latency |
| Auto start | Enabled | Starts when the locked gamepad and Arduino serial port are available |

## Detailed Logs

The browser bridge can record a detailed text log for debugging. Use `Start Log` before a test session and `Stop Log` when the issue happens. In Chrome/Edge, the page tries to write directly to a selected `.txt`/`.jsonl` file; if the browser does not allow that, it keeps the log in memory and `Download Log` saves it afterward.

Each line is a JSON record with timestamps, selected gamepad, all raw axes, button states, pedal mapping, calculated percentages, filtered percentages, serial line sent to the Arduino, send reason, and current filter settings. Use `Mark Event` while testing to add a manual marker around a problem moment.

The bridge also reads Arduino serial output and stores it as `serial_rx` records. After connecting the correct Arduino port, the status should show `Arduino confirmed` and `Arduino RX` should show messages such as `PONG serial_pedal_bridge`, `Serial pedal bridge ready.`, `Serial pedal input active.`, or `RX ok packets:123 last:0,0,4`. Live pedal sending only requires the serial port to be open; Arduino replies are diagnostics and do not gate TX.

If `Arduino RX` shows unreadable characters such as `K0?>?.`, the browser is receiving serial bytes but not the expected bridge text. The usual causes are wrong COM port, wrong firmware on the Arduino, baud mismatch, or another serial monitor/tool still holding or configuring the port. Upload `serial_pedal_bridge/serial_pedal_bridge.ino`, close Arduino Serial Monitor/Plotter, reconnect in the browser, and confirm the Arduino port is running at `115200` baud.

Use `Test 50%` and `Test Rest` to send fixed serial commands directly to the Arduino. These buttons stop the live bridge before sending the test line, which helps separate gamepad mapping problems from Arduino/PXN output problems. `Test 50%` streams throttle at 50% for about 3 seconds at the configured send rate before returning the output to rest.

When the Arduino serial port is open but the live bridge is stopped, the page still sends a `0,0,0` rest keepalive so the Arduino does not enter serial timeout just because the bridge is idle. When the bridge is running, every polling tick sends a fresh serial line for the lowest practical latency.

If you need to compare against the older single-file bridge, set `TX mode` to `Changed + heartbeat`. In that mode the browser sends when pedal output changes or when the heartbeat interval expires, instead of streaming every polling tick.

The browser sends the same Arduino protocol:

```text
clutch,brake,throttle
```

If legacy firmware is detected, the UI and logs still stay in clutch, brake, throttle order, but the USB serial line is serialized as `brake,throttle,clutch`.

The default browser axis mapping is:

| Pedal | Joystick axis |
|-------|---------------|
| Clutch | Axis 1 |
| Brake | Axis 2 |
| Throttle | Axis 3 |

Axis raw ranges default to `-1..1`, which is the normal browser Gamepad API range. Keep the real pedal calibration, deadzones, and maximums in FreeJoy/Sim Ruito so the behavior is native for both PC and PS5 bridge use.

Available PC-side profiles:

| Profile | Behavior |
|---------|----------|
| Linear / PC | Sends clutch, brake, and throttle linearly |
| GT7 inverse throttle | Applies the GT7 inverse throttle table before sending serial output |
| Custom throttle | Uses editable output points for throttle `[0,25,50,75,100]%` input |

The GT7 inverse throttle table maps throttle `[0,25,50,75,100]%` to `[0,45,75,90,100]%`. The Arduino then maps the final `0..100%` values to the measured PWM ranges in firmware: brake `3..204`, throttle `3..194`, and clutch `3..193`.

For lowest latency, keep all dropout guards at `0 ms`. A guard above zero intentionally holds a sudden full-press-to-zero transition for the configured time, which can feel like delayed pedal release. Use a guard only when logs prove there is a real momentary zero glitch while the pedal is still physically pressed.

An optional Python version with equivalent parameters is also available:

```text
tools/sim_ruito_to_serial.py
```

## Validation Steps

1. Upload the serial bridge firmware.
2. Connect the original Sim Ruito board to the PC.
3. Connect the Arduino/translator box to the PC.
4. Open `tools/gamepad_serial_bridge/index.html` in Chrome or Edge.
5. Use the live axis view to find the clutch, brake, and throttle axes.
6. Connect the Arduino serial port. `Arduino confirmed` is helpful, but TX can start without it.
7. Click `Start` and confirm the Arduino receives valid serial input.
8. Measure RJ45 output voltages before connecting the PXN/base.
9. Connect the PXN/base and test in game.

Keep the Arduino/translator box USB and PXN/base USB on the same USB hub/reference when bass shakers are used.
