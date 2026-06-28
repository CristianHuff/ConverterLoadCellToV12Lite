# Gamepad Serial Pedal Bridge Tool

Browser-based bridge that reads the Sim Ruito pedal board through the Gamepad API and sends `clutch,brake,throttle` percentages to the Arduino serial bridge through Web Serial.

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

Keep pedal order as `clutch,brake,throttle` in the UI, logs, and serial output so it matches the physical pedal order and Arduino firmware.

## Configuration Features

- `Save Preset` stores a known-good browser configuration separately from the live auto-saved values.
- Presets are named, can be selected later, and can be deleted.
- `Load Preset` restores the selected snapshot.
- `Export` and `Import` move the current setup as JSON between browsers or PCs.
- `Set Min` and `Set Max` capture the current raw gamepad axis value for each pedal.
- `Set All Min` and `Set All Max` capture all pedal axis limits in one action.
- `Auto start when ready` starts the bridge when both the locked gamepad and serial port are available.
- The profile preview canvas shows the active throttle curve before values are sent to the Arduino.
- `Custom throttle` lets the PC-side curve be edited at `[0,25,50,75,100]%` input points.
- The diagnostics graph shows recent clutch, brake, and throttle output history.
- The calibration panel captures released and pressed axis snapshots before applying them.
- Dropout guard filtering is configurable per pedal.
- Automatic alerts flag missing locked gamepad, stale serial TX, dropout guard activity, and non-monotonic custom curves.
- Diagnostics also shows recommendations based on the current alert and telemetry state, with apply buttons for supported adjustments.
