# RJ9 Pinout - Sim Ruito Pedals

## Methodology

Measurements were taken with a multimeter in DC voltage mode while the system was powered (Sim Ruito board connected to the PC through USB). A 5 kg load cell was connected to the brake connector for validation.

## Measured Voltage Matrix (between pins)

Reading: line pin voltage relative to the column pin.

|   | P1 | P2 | P3 | P4 |
|---|----|----|----|----|
| P1 | x | -2.446 V | -2.446 V | -4.91 V |
| P2 | +2.446 V | x | 0.5 mV | -2.444 V |
| P3 | +2.446 V | -0.5 mV | x | -4.91 V |
| P4 | +4.90 V | +2.445 V | +2.444 V | x |

With the pedal pressed, the difference between P2 and P3 rises from 0.5 mV to about 1.5 mV, which is classic Wheatstone bridge behavior.

## Final Pinout

### Female Connector View (pedal side)

| Pin | Function | Wire color |
|-----|----------|------------|
| 1 | GND | Black |
| 2 | S+ | Light green |
| 3 | S- | Green |
| 4 | 5 V | White |

### Male Connector View (cable side after opening the cable)

| Pin | Function | Notes |
|-----|----------|-------|
| 1 | 5 V | Highest potential (+4.90 V relative to GND) |
| 2 | S- | Bridge negative signal |
| 3 | S+ | Bridge positive signal |
| 4 | GND | Zero reference |

> Warning: numbering is reversed between male and female connectors. Always confirm visually before soldering.

## HX711 Wiring

| Pedal wire | Male pin | Color | HX711 terminal |
|------------|----------|-------|----------------|
| Power + | 1 | White | E+ |
| GND | 4 | Black | E- |
| Signal + | 3 | Light green | A+ |
| Signal - | 2 | Green | A- |

HX711 terminals B+ and B- remain unconnected (channel B is not used).

## RJ9 Cable Structure

- Standard landline phone cable.
- Wires have colored PVC insulation, not enamel.
- Central nylon thread: mechanical reinforcement, not conductive, can be cut.
- Stripping: press with a fingernail and pull, or use a utility knife with minimum pressure.

## Parallel Use with the Original Board

The project idea is to let the pedals keep existing in the Sim Ruito/PC ecosystem while also feeding the translator box for PXN/PS5. This part still requires care.

Defined points:

- signal wires `S+` and `S-` should not receive series diodes;
- GND must be common when signals are shared;
- it is not recommended to let two boards power the same load-cell bridge without isolation or switching;
- a physical selector switch for power/USB/pedals may be more predictable than powering everything at once.

1N4148 diodes were considered to avoid backfeed, but the final parallel solution still needs bench validation before becoming a build recommendation.
