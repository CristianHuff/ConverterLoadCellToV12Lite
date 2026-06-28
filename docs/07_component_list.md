# Component List

## Main Components

| Qty | Component | Notes |
|-----|-----------|-------|
| 1 | Arduino Nano | ATmega328P |
| 3 | HX711 module | One per pedal |
| 3 | Pedal load cell | Already present in the Sim Ruito pedals |
| 1 | Momentary button | Profile/calibration |
| 1 | LED | Profile/calibration status |
| 1 | 220 ohm to 1 k resistor | LED series resistor |

## Filter and Analog Output

| Qty | Component | Value | Use |
|-----|-----------|-------|-----|
| 3 | Resistor | 1 k | RC filter series resistor |
| 3 | Capacitor | 470 nF | RC filter |
| 6 | Resistor | 10 k | Voltage divider, two per channel |

Values tested on the breadboard:

- rest PWM: `3`
- max brake PWM: `204`
- max throttle PWM: `194`
- max clutch PWM: `193`
- throttle measured at RJ45: maximum close to `1.9 V`

## Recommended Decoupling

| Qty | Component | Use |
|-----|-----------|-----|
| 3 | 100 nF | One near each HX711, between VCC and GND |
| 1 | 10 uF to 100 uF | 5 V/GND rail |
| optional | 47 nF to 100 nF | Extra parallel capacitor on noisy channels |

## Connectors

| Qty | Component | Use |
|-----|-----------|-----|
| 3 | Female RJ9 | Pedal input |
| 1 | RJ45 | Output to PXN base |
| 1 | USB for Arduino | Power/log |

## Final Build

Recommended:

- soldered board or PCB;
- robust GND;
- short wires for analog signals;
- twisted load-cell pairs (`A+` with `A-`, `E+` with `E-`);
- RC filters close to the RJ45 connector;
- decoupling capacitors close to the HX711 modules.

## Parallel Use with the Original Board

If keeping the original Sim Ruito board and the translator box on the same pedal set:

- do not keep both boards connected to the same load cells at the same time;
- one board can influence the other even when it is not powered;
- use a physical selector switch, relay board, or connector swap to disconnect the unused board;
- switch/disconnect `E+`, `E-`, `S+`, and `S-` for each pedal;
- keep common GND only where signals are intentionally shared, but do not rely on GND alone to isolate two load-cell front ends.
