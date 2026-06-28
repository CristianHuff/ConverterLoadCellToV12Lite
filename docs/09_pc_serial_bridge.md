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
                                   tools/gamepad_serial_bridge.html
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
brake,throttle,clutch
```

Example:

```text
12,47,0
```

If no valid serial packet is received for `300 ms`, all outputs go to rest.

PWM output mapping remains:

| Function | Arduino pin |
|----------|-------------|
| Clutch PWM | D9 |
| Brake PWM | D10 |
| Throttle PWM | D11 |

The profile button on D8 still works:

- quick click: switch profile;
- profile 1: Linear/PC;
- profile 2: GT7 inverse throttle.

The active profile is volatile in this firmware. It is not saved to EEPROM.

## PC Sender

The primary PC bridge is a browser tool:

```text
tools/gamepad_serial_bridge.html
```

Open it in Chrome or Edge. It reads the original Sim Ruito board through the browser Gamepad API and sends the selected pedal percentages to the Arduino through Web Serial.

Workflow:

1. Open `tools/gamepad_serial_bridge.html` in Chrome or Edge.
2. Press a pedal or button so the browser can see the gamepad.
3. Select the Sim Ruito gamepad and keep `Lock selected gamepad` enabled.
4. Click `Connect Serial` and choose the Arduino COM port.
5. Map brake, throttle, and clutch axes.
6. Click `Start`.

The selected gamepad and axis mapping are saved in the browser. This prevents a remote-play controller, such as an Xbox controller created by Moonlight, from taking over when it connects later.

After the first manual serial selection, Chrome/Edge can remember the Arduino port permission. On the next page load, the bridge tries to reconnect that authorized port and start automatically when the Sim Ruito gamepad is available.

Default filtering:

| Setting | Default | Purpose |
|---------|---------|---------|
| Send rate | 50 Hz | Sends pedal state often enough for smooth output |
| Serial heartbeat | 100 ms | Keeps the Arduino below its 300 ms serial timeout |
| Deadzone | 0% | Calibration/deadzone should be handled in FreeJoy/Sim Ruito |
| Throttle dropout guard | 80 ms | Ignores very short full-throttle-to-zero glitches |

## Detailed Logs

The browser bridge can record a detailed text log for debugging. Use `Start Log` before a test session and `Stop Log` when the issue happens. In Chrome/Edge, the page tries to write directly to a selected `.txt`/`.jsonl` file; if the browser does not allow that, it keeps the log in memory and `Download Log` saves it afterward.

Each line is a JSON record with timestamps, selected gamepad, all raw axes, button states, pedal mapping, calculated percentages, filtered percentages, serial line sent to the Arduino, send reason, and current filter settings. Use `Mark Event` while testing to add a manual marker around a problem moment.

The bridge also reads Arduino serial output and stores it as `serial_rx` records. After connecting the correct Arduino port, the log/status area should show messages such as `Serial pedal bridge ready.` or `Serial pedal input active.`.

Use `Test 50%` and `Test Rest` to send fixed serial commands directly to the Arduino. These buttons stop the live bridge before sending the test line, which helps separate gamepad mapping problems from Arduino/PXN output problems. `Test 50%` holds throttle at 50% for about 3 seconds before the stopped bridge keepalive returns the output to rest.

When the serial port is connected but the live bridge is stopped, the page still sends a `0,0,0` rest keepalive so the Arduino does not enter serial timeout just because the bridge is idle.

The browser sends the same Arduino protocol:

```text
brake,throttle,clutch
```

The default browser axis mapping is:

| Pedal | Joystick axis |
|-------|---------------|
| Brake | Axis 2 |
| Throttle | Axis 3 |
| Clutch | Axis 1 |

Axis raw ranges default to `-1..1`, which is the normal browser Gamepad API range. Keep the real pedal calibration, deadzones, and maximums in FreeJoy/Sim Ruito so the behavior is native for both PC and PS5 bridge use. The Arduino then maps `0..100%` to the measured PWM ranges in firmware: brake `3..204`, throttle `3..194`, and clutch `3..193`.

An optional Python version with equivalent parameters is also available:

```text
tools/sim_ruito_to_serial.py
```

## Validation Steps

1. Upload the serial bridge firmware.
2. Connect the original Sim Ruito board to the PC.
3. Connect the Arduino/translator box to the PC.
4. Open `tools/gamepad_serial_bridge.html` in Chrome or Edge.
5. Use the live axis view to find the brake, throttle, and clutch axes.
6. Connect the Arduino serial port and click `Start`.
7. Confirm the Arduino receives valid serial input.
8. Measure RJ45 output voltages before connecting the PXN/base.
9. Connect the PXN/base and test in game.

Keep the Arduino/translator box USB and PXN/base USB on the same USB hub/reference when bass shakers are used.
