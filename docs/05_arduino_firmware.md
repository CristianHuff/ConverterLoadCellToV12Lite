# Arduino Firmware

Main file: `translator_box/translator_box.ino`.

## Responsibilities

The firmware does four main things:

1. Reads the three HX711 modules as raw values.
2. Applies tare, dead zone, optional filtering, and calibration.
3. Converts each pedal to percentage and PWM.
4. Generates high-frequency PWM so the RC filter/divider can send analog voltage to the PXN.

## Pins

| Function | Arduino Pin |
|----------|-------------|
| HX711 brake DATA/SCK | D3 / D2 |
| HX711 throttle DATA/SCK | D5 / D4 |
| HX711 clutch DATA/SCK | D7 / D6 |
| Calibration button | D8 to GND |
| Brake PWM | D9 |
| Throttle PWM | D10 |
| Clutch PWM | D11 |
| Status LED | D12 through resistor to GND |

## PWM

Default Arduino PWM is too slow for this application. The firmware changes the timers:

| Pin | Timer | Approximate frequency |
|-----|-------|-----------------------|
| D9 / D10 | Timer1 | ~62 kHz |
| D11 | Timer2 | ~31 kHz |

This reduces audible/visible ripple after the RC filter.

## EEPROM Calibration

The `CalibrationData` structure stores the three pedal maximums in EEPROM with a signature and version:

- `EEPROM_SIGNATURE`
- `EEPROM_VERSION`
- `maxBrake`
- `maxThrottle`
- `maxClutch`
- `activeProfile`

At startup, if the data is valid and above the plausible minimums, the firmware uses those values. Otherwise it uses the default values in code. Version 1 calibration data is loaded with the Linear/PC profile and is written as version 2 only when calibration is saved.

## Pedal Profiles

The firmware has two profiles:

| Profile | Behavior |
|---------|----------|
| 1 - Linear/PC | Brake, throttle, and clutch are linear |
| 2 - GT7 inverse throttle | Brake and clutch are linear; throttle uses an inverse GT7 table |

GT7 throttle table:

| Pedal input | Output sent to PXN |
|-------------|--------------------|
| 0% | 0% |
| 25% | 45% |
| 50% | 75% |
| 75% | 90% |
| 100% | 100% |

The firmware interpolates between these points.

Changing profile with the button does not write EEPROM. The active profile is written only together with calibration save, so temporary testing does not wear the EEPROM.

## Status LED

The status LED is on D12 and uses non-blocking blinks:

| Event | Pattern |
|-------|---------|
| Profile 1 active | 1 short blink |
| Profile 2 active | 2 short blinks |
| Holding calibration command | Solid on |
| Clear learned maximums | 1 long blink |
| Save calibration and active profile to EEPROM | 3 long blinks |

Recommended wiring:

```text
D12 -> 220 ohm to 1 k resistor -> LED anode
LED cathode -> GND
```

## Maximum Adjustment

These parameters apply margin to the learned maximum:

```cpp
const int MAX_ADJUST_BRAKE_PERCENT = 90;
const int MAX_ADJUST_THROTTLE_PERCENT = 95;
const int MAX_ADJUST_CLUTCH_PERCENT = 95;
```

Interpretation:

- `100`: uses the learned maximum as 100%.
- below `100`: reaches 100% earlier.
- above `100`: requires more travel/force to reach 100%.

## Dead Zone

Current dead zones:

```cpp
const long DEAD_ZONE_BRAKE = 40000;
const long DEAD_ZONE_THROTTLE = 100;
const long DEAD_ZONE_CLUTCH = 500;
```

The brake uses a larger zone so resting a foot does not trigger braking in-game.

## Digital Filter

The firmware can enable/disable moving average filtering per pedal:

```cpp
const int SAMPLE_COUNT = 2;
const bool FILTER_BRAKE = true;
const bool FILTER_THROTTLE = false;
const bool FILTER_CLUTCH = true;
```

The throttle has no digital filter to keep response fast.

## Throttle Dropout Protection

There is short-dropout protection for the throttle:

```cpp
const bool THROTTLE_DROPOUT_PROTECTION = true;
const byte THROTTLE_DROPOUT_CONFIRMATIONS = 3;
```

It holds a few impossible readings when the throttle was high and suddenly drops. If the drop persists, the firmware accepts the drop so the throttle is not left stuck.

When `LOG_THROTTLE_PROTECTION` is enabled, the log shows `raw:<value> prot:1` when protection is active.

## Logs

Main flags:

```cpp
const bool LOG_RAW = false;
const bool LOG_FILTERED = false;
const bool LOG_USEFUL = true;
const bool LOG_PCT = true;
const bool LOG_OUT = true;
const bool LOG_PWM = true;
const bool LOG_THROTTLE_PROTECTION = true;
```

Fields:

| Field | Meaning |
|-------|---------|
| `raw` | Raw/tared HX711 reading |
| `filt` | Value after digital filtering |
| `useful` | Value after dead zone/protection |
| `pct` | Percentage before curve |
| `out` | Percentage after curve |
| `pwm` | Value sent to `analogWrite` |
| `raw/prot` | Held throttle dropout |

## Output Test Mode

The firmware includes a test to separate reading problems from analog-output problems:

```cpp
const bool TEST_THROTTLE_OUTPUT = false;
const bool TEST_THROTTLE_OUTPUT_STEPS = true;
```

When `TEST_THROTTLE_OUTPUT` is `true`, the throttle ignores the HX711 and generates steps/a ramp directly on PWM D10.

Use this mode to verify whether the PXN sees the signal without depending on the load cell.
