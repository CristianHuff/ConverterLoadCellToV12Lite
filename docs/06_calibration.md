# Calibration

## Button

Wire a momentary button between:

```text
Arduino D8 ---- button ---- GND
```

The firmware uses `INPUT_PULLUP`, so no external resistor is required.

## Status LED

Optionally, wire an LED to D12:

```text
D12 -> 220 ohm to 1 k resistor -> LED anode
LED cathode -> GND
```

Indications:

- 1 short blink: profile 1, Linear/PC;
- 2 short blinks: profile 2, GT7 inverse throttle;
- solid on while holding the second click of a calibration command;
- 1 quick pulse while holding: 3s clear point reached;
- 3 quick pulses while holding: 6s save point reached;
- 1 long blink: learned maximums cleared;
- 3 long blinks: calibration and active profile saved to EEPROM.

## Startup

At power-up:

1. Keep all pedals released.
2. The firmware waits for the HX711 modules to become ready.
3. It then runs `tare()` on all three pedals.
4. If valid calibration exists in EEPROM, it loads the saved maximums.
5. The LED blinks the active profile.

## Change Pedal Profile

Quick-click the button once and wait briefly:

- profile 1: Linear/PC, all pedals linear;
- profile 2: GT7 inverse throttle, with brake and clutch linear.

This changes the current profile without writing EEPROM. The active profile becomes the startup default only after saving calibration.

## Clear Learned Maximums

With the system powered:

1. Quick-click the button once.
2. Quick-click again and keep holding.
3. Release after the 1 quick pulse at 3 seconds.

This clears only the learned maximums in RAM.

It does not immediately erase EEPROM.

## Save Calibration

1. Clear learned maximums.
2. Press each pedal to the desired maximum.
3. You do not need to crush the pedals; use the force/travel you want to represent 100%.
4. Quick-click the button once.
5. Quick-click again and keep holding.
6. Release after the 3 quick pulses at 6 seconds.
7. The firmware saves the maximums and the active profile to EEPROM.

## Maximum Margin

The `MAX_ADJUST_*_PERCENT` parameters change how the learned maximum becomes 100%:

```cpp
const int MAX_ADJUST_BRAKE_PERCENT = 90;
const int MAX_ADJUST_THROTTLE_PERCENT = 95;
const int MAX_ADJUST_CLUTCH_PERCENT = 95;
```

Example:

- if the brake learned 1,000,000 and the adjustment is 90, the saved maximum becomes 900,000;
- this makes the pedal reach 100% earlier, without needing to repeat exactly the highest force used during calibration.

## Plausible Minimum Values

To avoid saving a bad calibration after an accidental touch:

```cpp
const long CALIB_MIN_BRAKE = 20000;
const long CALIB_MIN_THROTTLE = 20000;
const long CALIB_MIN_CLUTCH = 20000;
```

If a pedal did not pass this minimum, it does not update the saved maximum.

## When to Recalibrate

Recalibrate when you:

- change pedal mechanics;
- replace an HX711;
- replace a load cell;
- build the final board;
- notice that 100% is reached too early or too late.

## Symptoms and Adjustments

| Symptom | Likely adjustment |
|---------|-------------------|
| Reaches 100% too early | Increase `MAX_ADJUST_*_PERCENT` or recalibrate with less maximum force |
| Does not reach 100% | Decrease `MAX_ADJUST_*_PERCENT` |
| Pedal triggers by itself at rest | Increase `DEAD_ZONE_*` |
| Pedal takes too long to respond at the beginning | Decrease `DEAD_ZONE_*` |
| Throttle cuts for a few readings | Keep `THROTTLE_DROPOUT_PROTECTION = true` |
