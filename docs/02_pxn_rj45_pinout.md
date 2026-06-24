# RJ45 Pinout - PXN Base

## Methodology

Bench reverse engineering was done with a multimeter while the system was powered and the original PXN pedals were connected. DC voltage was measured between all pins.

## Pin Table

| RJ45 Pin | Function | Rest Voltage | Full Press Voltage | Notes |
|----------|----------|--------------|--------------------|-------|
| 1 | Clutch signal | ~23 mV | ~1.99 V | Pure analog |
| 2 | GND | ~0 V | ~0 V | GND/return pair; connect to common GND |
| 3 | GND | 0 V | 0 V | |
| 4 | Brake signal | ~23 mV | ~1.74 V | Pure analog |
| 5 | GND | 0 V | 0 V | |
| 6 | Throttle signal | ~23 mV | ~1.89 V | Pure analog |
| 7 | 3.3 V VREF | 3.314 V | 3.314 V | Passive reference: do not use as VCC |
| 8 | 3.3 V VREF | 3.314 V | 3.314 V | Passive reference: do not use as VCC |

## Critical Findings

- Pure analog signal: no serial protocol and no multiplexing.
- Maximum voltage around 2 V: injecting 5 V could damage the PXN board.
- Pin 2 also behaves as GND/return on the tested base. In the current prototype, pins 2, 3, and 5 are tied to common GND.
- Pins 7 and 8 are passive VREF: they do not provide power current.
- Pedal power comes through the pedal's own RJ9 connector, not through RJ45.
- Linearity confirmed: voltage rises proportionally with applied force.

## Connection to This Project

Signal pins (1, 4, 6) receive the output from the translator box voltage divider.
GND pins (2, 3, 5) connect to the circuit common GND.
Pins 7 and 8 remain disconnected.

When bass shakers are used on the pedal set, the PXN/base USB and translator box USB should share the same USB hub/reference, and the metal pedal frame should be bonded to the translator box GND. Testing showed that separate USB references or a floating pedal frame could make the base lose or misread the analog pedal signal even while the firmware log and measured output voltage stayed stable.

## Prototype Validations

- Throttle on RJ45 pin 6 was measured with a maximum close to 1.9 V, compatible with the original pedal.
- The firmware test mode generated a ramp/steps on pin 6 and the PXN base recognized the variation.
- On a breadboard, stability depends heavily on common GND and firm contact at the RJ45 and rails.
- With bass shakers active, using the same USB hub for the PXN/base and translator box resolved signal loss seen at the base.
- With bass shakers active, bonding the metal pedal frame to translator box GND was also required; without it, the signal could spike/pop.
