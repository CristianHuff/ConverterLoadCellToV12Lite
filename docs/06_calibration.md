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

- 1 blink: learned maximums cleared;
- 3 blinks: calibration saved to EEPROM.

## Startup

At power-up:

1. Keep all pedals released.
2. The firmware waits for the HX711 modules to become ready.
3. It then runs `tare()` on all three pedals.
4. If valid calibration exists in EEPROM, it loads the saved maximums.

## Clear Learned Maximums

With the system powered, short-press the button. This clears only the learned maximums in RAM.

It does not immediately erase EEPROM.

## Save Calibration

1. Short-press the button to clear learned maximums.
2. Press each pedal to the desired maximum.
3. You do not need to crush the pedals; use the force/travel you want to represent 100%.
4. Hold the button for 3 seconds.
5. The firmware saves the maximums to EEPROM.

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
