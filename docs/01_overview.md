# Project: Sim Ruito Translator Box to PS5 through PXN

## Overview

Convert Sim Ruito load-cell pedals to work on PS5 by using a PXN wheel controller board as a bridge. The current prototype uses an Arduino Nano to read the cells through HX711 modules and generate analog signals compatible with the PXN RJ45 pedal input.

```text
[Sim Ruito pedals] --RJ9--> [Translator Box] --USB--> PC (log/power)
                                      |
                                    RJ45
                                      |
                               [PXN wheel base] --USB--> PS5
```

## System Components

| Component | Function |
|-----------|----------|
| Sim Ruito pedals (3x) | Load cells: brake, throttle, clutch |
| Arduino Nano | Central processing |
| 3x HX711 module | Load-cell reading |
| 3x RC filter (1k + 470nF) | Smooths PWM into analog voltage |
| 3x voltage divider (2x 10k) | Scales 5 V to a 2.5 V maximum range compatible with PXN |
| PXN base/wheel | USB bridge to PS5 |

## Current State

- The PXN base recognizes the generated analog signals.
- The throttle was tested with Arduino-generated ramps/steps, confirming that the output reaches the base.
- The throttle range measured at the RJ45 was around 0 V to 1.9 V, similar to the original pedal.
- RJ45 pin 2 was confirmed as GND/return on the tested base.
- The build is still on a breadboard, so bad contacts, ripple, and weak GND are real risks.
- The final soldered board must be revalidated.

## Parallel Use with the Original Sim Ruito Board

Keeping the original STM32 board and the Arduino connected to the same pedal set still needs hardware validation. To avoid backfeed and unstable readings:

- keep common GND between boards when signals are shared;
- do not let two boards power the same bridge without isolation/selection;
- a physical USB/power or pedal selector may be more predictable than trying to keep everything powered at the same time;
- load-cell `S+` and `S-` wires should not receive series diodes.

## Documentation Files

| File | Contents |
|------|----------|
| `01_overview.md` | This file: architecture and components |
| `02_pxn_rj45_pinout.md` | Reverse engineering of the PXN base connector |
| `03_pedal_rj9_pinout.md` | Reverse engineering of the Sim Ruito pedals |
| `04_electrical_schematic.md` | Complete per-channel circuit and protection notes |
| `05_arduino_firmware.md` | Firmware documentation |
| `06_calibration.md` | Physical calibration procedure |
| `07_component_list.md` | Complete BOM with specifications |
| `08_tests_and_diagnostics.md` | Bench tests and diagnostics |
