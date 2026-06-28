# ConverterLoadCellToV12Lite

Experimental converter for using Sim Ruito load-cell pedals with a PXN wheel base, exposing analog signals similar to the original PXN pedals. The PXN base acts as the USB bridge to the PS5.

The project is still in the breadboard prototype stage. Pedal reading and analog output have been validated in tests, but the final soldered board still needs to be built and revalidated.

## Overview

```text
Sim Ruito pedals
   | RJ9 / load cells
   v
HX711 x3 -> Arduino Nano -> high-frequency PWM -> RC filter -> divider -> PXN RJ45
                                                                           |
                                                                           v
                                                                      PXN base -> PS5
```

## Current Status

- All 3 pedals are read through HX711 modules.
- Analog outputs are accepted by the PXN base.
- RJ45 pin 2 was confirmed as GND/return on the tested base.
- Automatic calibration with a button and EEPROM persistence.
- Pedal profiles: Linear/PC and GT7 inverse throttle. The active profile is persisted only when calibration is saved.
- Per-pedal maximum margin so the pedals do not need to be crushed.
- Short dropout protection for the throttle.
- Throttle output ramp/step test mode for diagnostics.
- Bass shaker validation: the translator box USB and PXN/base USB should share the same USB hub/reference, RJ45 pins 2, 3, and 5 should be tied to common GND, and the metal pedal frame should be bonded to the translator box GND.
- Parallel Sim Ruito + translator-box load-cell connection is not supported; the two boards influence each other even when one is not powered.
- Tested on a breadboard; the final board still needs better GND, filters, and decoupling.

## Main Hardware

| Item | Use |
|------|-----|
| Arduino Nano | Processes readings and generates PWM |
| 3x HX711 | Reads the load cells |
| 3x RC filter | Converts PWM into an approximate analog voltage |
| 3x voltage divider | Reduces the 5 V range to a PXN-safe range |
| RJ9 | Sim Ruito pedal input |
| RJ45 | Analog output to the PXN base |
| Momentary button | Changes profile and clears/saves calibration |

## Quick Pinout

### Arduino

| Function | Pins |
|----------|------|
| HX711 clutch | D3 DATA, D2 SCK |
| HX711 brake | D5 DATA, D4 SCK |
| HX711 throttle | D7 DATA, D6 SCK |
| Clutch PWM | D9 |
| Brake PWM | D10 |
| Throttle PWM | D11 |
| Calibration button | D8 to GND |
| Status LED | D12 through resistor to GND |

### PXN RJ45

| Pin | Function |
|-----|----------|
| 1 | Clutch |
| 2 | GND/return |
| 3 | GND |
| 4 | Brake |
| 5 | GND |
| 6 | Throttle |
| 7 | 3.3 V VREF, do not use as VCC |
| 8 | 3.3 V VREF, do not use as VCC |

For stable bass shaker use, connect RJ45 pins `2`, `3`, and `5` to the translator box common GND, bond the metal pedal frame to the translator box GND, and keep the Arduino/translator box USB on the same USB hub/reference as the PXN/base.

## Calibration

The firmware tares the pedals at startup, so power it on with all pedals released. The calibration button is wired between D8 and GND:

- one quick click, then wait briefly: changes pedal profile without writing EEPROM;
- one quick click, then hold the second click for 3 seconds: clears learned maximums in RAM;
- one quick click, then hold the second click for 6 seconds: saves learned maximums and the active profile to EEPROM.

Optional status LED on D12:

- 1 short blink: profile 1, Linear/PC;
- 2 short blinks: profile 2, GT7 inverse throttle;
- solid on while holding the second click;
- 1 quick pulse while holding: 3s clear point reached;
- 3 quick pulses while holding: 6s save point reached;
- 1 long blink: learned maximums cleared;
- 3 long blinks: calibration and active profile saved to EEPROM.

After clearing, press each pedal to the desired maximum and use quick click + 6-second hold to save calibration and the active profile. The `MAX_ADJUST_*_PERCENT` settings apply a margin to the saved maximum.

## Diagnostics

The firmware has log flags (`LOG_USEFUL`, `LOG_PCT`, `LOG_PWM`, etc.) and an electrical test mode:

```cpp
const bool TEST_THROTTLE_OUTPUT = false;
```

When enabled, it ignores the throttle HX711 and generates steps/a ramp on the throttle PWM output. This helps separate pedal-reading problems from analog-output problems at the base.

## PC Serial Bridge Mode

There is also a separate firmware/script path that keeps the original Sim Ruito board responsible for reading the load cells and sends pedal percentages from the PC to the Arduino over USB serial:

- Arduino firmware: `serial_pedal_bridge/serial_pedal_bridge.ino`
- Browser bridge: `tools/gamepad_serial_bridge/index.html`
- Optional Python helper: `tools/sim_ruito_to_serial.py`
- Documentation: [docs/09_pc_serial_bridge.md](docs/09_pc_serial_bridge.md)

Use this mode when the PC is already required for SimHub/bass shakers and the HX711 translator should not be connected to the same load cells as the original Sim Ruito board.

In this mode, FreeJoy/Sim Ruito owns pedal calibration and the browser bridge owns pedal profiles/curves. The Arduino serial bridge only converts received `0..100%` values into PXN-compatible PWM outputs. The legacy `tools/gamepad_serial_bridge.html` file remains as a compatibility launcher for the new organized tool folder.
The serial bridge protocol uses pedal order `clutch,brake,throttle`, matching the physical pedal order.

## Documentation

| File | Contents |
|------|----------|
| [docs/01_overview.md](docs/01_overview.md) | Architecture and project state |
| [docs/02_pxn_rj45_pinout.md](docs/02_pxn_rj45_pinout.md) | Reverse engineering of the PXN base |
| [docs/03_pedal_rj9_pinout.md](docs/03_pedal_rj9_pinout.md) | Sim Ruito pedal pinout |
| [docs/04_electrical_schematic.md](docs/04_electrical_schematic.md) | Per-channel circuit |
| [docs/05_arduino_firmware.md](docs/05_arduino_firmware.md) | Firmware and flags |
| [docs/06_calibration.md](docs/06_calibration.md) | Calibration procedure |
| [docs/07_component_list.md](docs/07_component_list.md) | Component list |
| [docs/08_tests_and_diagnostics.md](docs/08_tests_and_diagnostics.md) | Completed tests and how to repeat them |
| [docs/09_pc_serial_bridge.md](docs/09_pc_serial_bridge.md) | PC-to-Arduino serial bridge mode |

## Warnings

- Do not inject 5 V directly into PXN signal pins.
- RJ45 pins 7 and 8 are the base 3.3 V reference, not a power supply.
- Do not keep the original Sim Ruito board and the HX711 translator connected to the same load cells at the same time. Use a selector/relay/connector swap that disconnects `E+`, `E-`, `S+`, and `S-` from the unused board.
- Breadboards can cause bad contacts, ripple, and GND issues. The final board should use short traces, a well-distributed GND, and capacitors close to the HX711 modules and filters.
- This project is experimental. Validate voltages with a multimeter before connecting it to the base.
