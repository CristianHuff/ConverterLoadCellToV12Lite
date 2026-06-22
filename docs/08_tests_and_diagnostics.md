# Tests and Diagnostics

This file records tests done during the prototype stage and how to repeat the investigation.

## Issues Found

### PXN GND

Symptom:

- the base recognized the box through one USB hub but failed through another.

Finding:

- RJ45 pin 2 also works as GND/return on the tested base.

Fix:

- connect RJ45 pins 2, 3, and 5 to common GND.

### Noise with Disconnected Pedal

Symptom:

- the HX711 generated readings even with the pedal/brake disconnected.

Interpretation:

- a floating HX711 input generates noise.

Fix:

- use a dead zone;
- avoid leaving inputs floating;
- improve wiring and GND.

### Throttle Cutting Out

Two hypotheses were tested:

1. real drop in the HX711 reading;
2. problem in the analog output sent to the PXN.

Tools used:

- serial log with `useful`, `pct`, `out`, and `pwm`;
- `THROTTLE_DROPOUT_PROTECTION`;
- `TEST_THROTTLE_OUTPUT` mode;
- multimeter in max/min mode on RJ45 pin 6.

Temporary conclusions:

- the throttle output was seen by the base during ramps/steps;
- maximum voltage on RJ45 pin 6 was close to `1.9 V`;
- the cut became intermittent and was not reproduced reliably;
- the breadboard build remains a strong suspect.

## Output Test Mode

In firmware:

```cpp
const bool TEST_THROTTLE_OUTPUT = true;
```

With `TEST_THROTTLE_OUTPUT_STEPS = true`, the Arduino generates:

```text
0% -> 25% -> 50% -> 75% -> 100% -> 75% -> 50% -> 25%
```

This test ignores the throttle HX711. If the base does not follow these steps, the problem is in the analog output, RJ45, GND, or PXN input.

After the test, restore:

```cpp
const bool TEST_THROTTLE_OUTPUT = false;
```

## Multimeter Test

Measure at the RJ45:

```text
Positive probe: pin 6 (throttle)
Negative probe: base GND (pin 2, 3, or 5)
```

Expected values:

| Condition | Approximate voltage |
|-----------|---------------------|
| Rest | near 0 V |
| Full throttle | up to ~1.9 V |

If the game cuts out:

- if `pwm` in the log remains high and voltage drops, the problem is in the output circuit;
- if `pwm` drops and voltage drops, the problem comes from reading/calibration/firmware;
- if `pwm` and voltage remain high, suspect the PXN base/game/reference.

## Bass Shakers and Power Supply

Bass shakers, car audio modules, and switching power supplies can introduce noise through USB, GND, or the electrical environment.

Recommendations:

- separate power cables from load-cell cables;
- avoid running `A+`/`A-` signals near high-current wires;
- use a well-defined common GND;
- add decoupling capacitors to the HX711 modules and rail.

## Without an Oscilloscope

A multimeter does not show fast spikes or PWM ripple well. Without an oscilloscope, the best tests are:

- step mode;
- max/min measurement at the RJ45;
- swapping HX711 modules between pedals;
- testing only one connected pedal;
- gently moving the breadboard/wires to detect bad contacts.

## Final Board Revalidation

After soldering:

1. Check GND continuity.
2. Check RJ45 pins 1, 4, 6, 2, 3, and 5.
3. Measure the maximum voltage of each output before connecting to the PXN.
4. Run output test mode.
5. Calibrate pedals.
6. Test in-game with logging enabled.
