# Component List

This list is kept at the repository root for compatibility. The organized BOM is available at [docs/07_component_list.md](docs/07_component_list.md).

## Electronics

| Qty | Component | Notes |
|-----|-----------|-------|
| 1 | Arduino Nano | ATmega328P |
| 3 | HX711 module | One per pedal |
| 1 | Momentary button | Profile/calibration, between D8 and GND |
| 1 | LED | Profile/calibration status |
| 1 | 220 ohm to 1 k resistor | LED series resistor |
| 3 | 1 k resistor | RC filter, one per channel |
| 3 | 470 nF capacitor | RC filter, one per channel |
| 6 | 10 k resistor | Voltage divider, two per channel |
| 3+ | 100 nF capacitor | Decoupling near the HX711 modules |
| 1+ | 10 uF to 100 uF capacitor | 5 V/GND rail |

## Connectors

| Qty | Component | Notes |
|-----|-----------|-------|
| 3 | Female RJ9 | Sim Ruito pedal input |
| 1 | Female RJ45/breakout | Output to PXN base |
| 1 | USB for Arduino | Power and serial log |

## Notes

- For the final build, prefer a soldered board over a breadboard.
- If the project is used in parallel with the original Sim Ruito board, plan power isolation/selection carefully. A physical selector is more predictable than letting two controllers power the same bridge at the same time.
