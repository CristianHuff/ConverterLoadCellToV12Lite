# Electrical Schematic

## Per-Channel Overview

Each pedal follows the same signal path:

```text
Load cell
   |
 HX711
   | (digital data)
 Arduino Nano
   | (PWM ~62kHz)
 RC filter
   | (smoothed analog voltage)
 Voltage divider
   | (scales 5V to a theoretical ~2.5V maximum)
 PXN RJ45 pin
```

## Per-Channel Circuit (Detailed)

```text
Arduino PWM (D9 / D10 / D11)
        |
       1k
        |
     Node A ---- 10k ---- Node B ---- RJ45 signal
        |                   |
      470nF               10k
        |                   |
       GND                 GND
```

Node A is the filtered PWM point. Node B is the divided output sent to the PXN.

## RC Filter Components

| Component | Value | Function |
|-----------|-------|----------|
| Series R | 1 k | Limits current and forms part of the RC filter |
| C | 470 nF (code 474) | Smooths PWM into DC voltage |
| Cutoff frequency | ~338 Hz | fc = 1/(2pi x 1k x 470nF) |

## Voltage Divider Components

| Component | Value | Function |
|-----------|-------|----------|
| R1 | 10 k | Upper divider resistor |
| R2 | 10 k | Lower divider resistor |
| Ratio | /2 | Output = Input x R2/(R1+R2) = 0.5 |
| Max output voltage | theoretical ~2.5 V | With PWM = 255 and 5 V supply |

## Why Divide by 2?

The measured original PXN pedals work near 0 V to 2 V on the signal pins. Arduino PWM can reach 5 V. The 1:1 divider halves the output. In firmware, the maximum PWM values stay below 255, so the measured output remains close to the original PXN range.

## Arduino Nano Pins

| Pin | Function |
|-----|----------|
| D2 | HX711 Brake - CLOCK |
| D3 | HX711 Brake - DATA |
| D4 | HX711 Throttle - CLOCK |
| D5 | HX711 Throttle - DATA |
| D6 | HX711 Clutch - CLOCK |
| D7 | HX711 Clutch - DATA |
| D9 | Brake PWM (Timer1, ~62kHz) |
| D10 | Throttle PWM (Timer1, ~62kHz) |
| D11 | Clutch PWM (Timer2, ~31kHz) |
| D8 | Calibration button to GND |
| 5V | HX711 power (VCC) |
| GND | Common GND |

## Timer Configuration (High Frequency)

Default Arduino PWM (~490 Hz) leaves audible residual ripple after the RC filter. This configuration raises PWM to ~62kHz, eliminating the issue:

```cpp
// Timer1 -> pins 9 and 10 -> ~62kHz
TCCR1A = _BV(COM1A1) | _BV(COM1B1) | _BV(WGM10);
TCCR1B = _BV(CS10);  // no prescaler

// Timer2 -> pin 11 -> ~31kHz
TCCR2B = (TCCR2B & 0b11111000) | 0x01;
```

## RJ45 Connection to PXN

| Signal | RJ45 Pin |
|--------|----------|
| Brake signal | 4 |
| Throttle signal | 6 |
| Clutch signal | 1 |
| GND | 2, 3, and 5 |

## Power and GND

The Arduino Nano is powered through USB. In tests, all relevant GNDs were tied together, including Arduino GND, HX711 E-, and PXN GND/return (RJ45 pins 2, 3, and 5).

On a breadboard, reference problems can appear when the Arduino and base are connected to different hubs or supplies. Connecting RJ45 pin 2 to common GND fixed a base recognition problem in the prototype.

## Recommendations for the Final Board

- Place 100 nF near each HX711 between VCC and GND.
- Place 10 uF to 100 uF on the 5 V/GND rail.
- Keep RC filters close to the RJ45 output.
- Keep the filter capacitor GND short and tied to the same return used by the PXN.
- Avoid running PWM traces parallel to analog PXN signals.
- For more robustness, consider two RC stages or an external DAC instead of filtered PWM.

## Modularity Diagram

```text
                    +-------------+
    PC USB hub -----| Arduino Nano|----- USB -> PC (SimHub)
                    |             |
    Brake HX711 --->| D3/D2   D9  |--> RC filter -> Divider -> RJ45 pin 4
    Throttle HX711 >| D5/D4   D10 |--> RC filter -> Divider -> RJ45 pin 6
    Clutch HX711 -->| D7/D6   D11 |--> RC filter -> Divider -> RJ45 pin 1
                    +-------------+
                                              RJ45 -> PXN base -> USB -> PS5
```
