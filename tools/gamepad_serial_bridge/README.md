# Gamepad Serial Pedal Bridge Tool

Configuration and diagnostics panel for the PC pedal bridge.

The recommended transport is `Native pedal bridge`: `tools/local_serial_http_bridge.ps1` reads the Sim Ruito/FreeJoy pedal board through the Windows native joystick API and sends pedal percentages directly to the Arduino serial bridge. The browser panel monitors that local service and pushes configuration changes to it. This avoids Chrome/Edge exposing only a limited subset of connected controllers.

Open:

```text
tools/gamepad_serial_bridge/index.html
```

The older `tools/gamepad_serial_bridge.html` file is kept as a compatibility launcher and redirects here.

## File Layout

| File | Purpose |
|------|---------|
| `index.html` | UI structure and stable element IDs |
| `styles.css` | Racing-themed layout and visual styling |
| `js/config.js` | Protocol constants, default axes, profile tables |
| `js/profiles.js` | Pedal curve helpers and GT7 inverse throttle profile |
| `js/settings.js` | Preset save/load and JSON import/export helpers |
| `js/telemetry.js` | Runtime TX rate, packet count, last line, and guard counters |
| `js/logger.js` | Detailed JSONL/text logging and file download |
| `js/app.js` | Gamepad polling, serial handling, settings, and UI state |

Keep pedal order as clutch, brake, throttle in the UI and logs so it matches the physical pedal order. The current Arduino firmware uses serial protocol `clutch,brake,throttle`; the browser can also auto-detect the legacy firmware protocol `brake,throttle,clutch`.

The browser sends `PING` after opening the serial port, but Start/Test only require the serial port to be open. Arduino replies are diagnostics, not a transmit gate. The expected current firmware response is `PONG serial_pedal_bridge`; older bridge firmware may answer with `Invalid pedal line: PING`, which still proves the selected COM port is the Arduino.

When the browser sees `PONG serial_pedal_bridge` or `Send lines as: clutch,brake,throttle`, it uses the current protocol. When it sees `Invalid pedal line: PING` or `Send lines as: brake,throttle,clutch`, it switches to the legacy protocol automatically.

Current bridge firmware also reports valid serial input about once per second as `RX ok packets:<count> last:<clutch>,<brake>,<throttle>`. If this counter does not increase while the bridge is running, the Arduino is not receiving valid pedal lines.

While running in native mode, the PowerShell local bridge sends a continuous low-latency serial stream at `Send rate Hz`; it does not wait for pedal values to change before transmitting.
Manual `Test 50%` also streams at the configured rate for the test window, so the Arduino's low timeout does not drop the output during the test.

## Configuration Features

- `Save Preset` stores a known-good browser configuration separately from the live auto-saved values.
- Presets are named, can be selected later, and can be deleted.
- `Load Preset` restores the selected snapshot.
- `Export` and `Import` move the current setup as JSON between browsers or PCs.
- `Set Min` and `Set Max` capture the current raw gamepad axis value for each pedal.
- `Set All Min` and `Set All Max` capture all pedal axis limits in one action.
- `Auto start when ready` starts the bridge when the locked gamepad is available and the Arduino serial port is open.
- `Native pedal bridge` is the default transport and uses the Windows joystick list from the local bridge, not the browser Gamepad API.
- `TX mode` defaults to `Continuous / low latency`. Use `Changed + heartbeat` to match the older single-file bridge behavior when comparing stability.
- Remote-play/XInput gamepads are ignored by auto-selection so Moonlight/Xbox controllers do not steal the pedal slot; SimJack devices are not treated as Sim Ruito pedals.
- The profile preview canvas shows the active throttle curve before values are sent to the Arduino.
- `Custom throttle` lets the PC-side curve be edited at `[0,25,50,75,100]%` input points.
- The diagnostics graph shows recent clutch, brake, and throttle output history.
- `Connected Gamepads` shows every gamepad currently exposed by the browser.
- The calibration panel captures released and pressed axis snapshots before applying them.
- Dropout guard filtering is configurable per pedal, but defaults to `0 ms` for lowest latency.
- Automatic alerts flag missing locked gamepad, unconfirmed Arduino diagnostic replies, stale serial TX, dropout guard activity, and non-monotonic custom curves.
- Diagnostics also shows recommendations based on the current alert and telemetry state, with apply buttons for supported adjustments.
