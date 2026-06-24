// ============================================================
//  TRANSLATOR BOX - Sim Ruito (Load Cell) -> PXN -> PS5
//  Hardware: Arduino Nano + 3x HX711
//  Output: PWM -> RC filter -> voltage divider -> PXN RJ45
// ============================================================

#include "HX711.h"
#include <EEPROM.h>

// HX711 pins
#define CLUTCH_DT     3
#define CLUTCH_SCK    2
#define BRAKE_DT      5
#define BRAKE_SCK     4
#define THROTTLE_DT   7
#define THROTTLE_SCK  6

// Output PWM pins
#define PWM_CLUTCH    9
#define PWM_BRAKE     10
#define PWM_THROTTLE  11

// Button between pin 8 and GND. Uses Arduino internal pull-up.
#define CAL_BUTTON_PIN 8

// Status LED: anode on D12 through a resistor, cathode to GND.
#define STATUS_LED_PIN 12

// HX711 instances
HX711 scaleBrake;
HX711 scaleThrottle;
HX711 scaleClutch;

// Maximum load in raw values.
// STEP 1: run with CALIBRATION enabled and press each pedal fully
// STEP 2: write down the highest "raw" value shown
// STEP 3: put those values here and remove #define CALIBRATION
long MAX_LOAD_BRAKE = 200000;  // adjust after calibration
long MAX_LOAD_THROTTLE  = 200000;  // adjust after calibration
long MAX_LOAD_CLUTCH  = 200000;  // adjust after calibration

long learnedMaxBrake = 0;
long learnedMaxThrottle  = 0;
long learnedMaxClutch  = 0;

// Adjustment for the saved maximum per pedal:
// 100 = learned maximum becomes 100%.
// Above 100 = takes more force/travel to reach 100%.
// Below 100 = reaches 100% earlier, without crushing the pedal as much.
const int MAX_ADJUST_BRAKE_PERCENT = 90;
const int MAX_ADJUST_THROTTLE_PERCENT  = 95;
const int MAX_ADJUST_CLUTCH_PERCENT  = 95;

// Target PWM values measured on the bench.
const int PWM_REST   = 3;
const int PWM_MAX_BRAKE = 204;
const int PWM_MAX_THROTTLE  = 194;
const int PWM_MAX_CLUTCH  = 193;

// Base response curve per pedal:
// 0 = linear.
// Positive = more response at the start/middle of travel.
// Negative = softer response at the start/middle of travel.
// The active pedal profile can add its own curve after this base curve.
const int CURVE_BRAKE_PERCENT = 0;
const int CURVE_THROTTLE_PERCENT  = 0;
const int CURVE_CLUTCH_PERCENT  = 0;

// Pedal profiles.
// Profile 1 keeps all pedals linear.
// Profile 2 keeps brake/clutch linear and applies a GT7 inverse curve to throttle.
enum PedalProfile {
  PROFILE_LINEAR = 0,
  PROFILE_GT7 = 1,
  PROFILE_COUNT = 2
};

byte activeProfile = PROFILE_LINEAR;

const byte GT7_THROTTLE_POINT_COUNT = 5;
const byte GT7_THROTTLE_INPUT[GT7_THROTTLE_POINT_COUNT] = {0, 25, 50, 75, 100};
const byte GT7_THROTTLE_OUTPUT[GT7_THROTTLE_POINT_COUNT] = {0, 45, 75, 90, 100};

// Dead zone in raw HX711 counts.
// Small values near zero are normal noise, especially with disconnected inputs.
const long DEAD_ZONE_BRAKE = 40000;
const long DEAD_ZONE_THROTTLE  = 1500;
const long DEAD_ZONE_CLUTCH  = 500;

// Plausible minimums for accepting saved calibration.
// Avoids saving/using a tiny maximum after an accidental touch.
const long CALIB_MIN_BRAKE = 20000;
const long CALIB_MIN_THROTTLE  = 20000;
const long CALIB_MIN_CLUTCH  = 20000;

// Moving average filter.
const int SAMPLE_COUNT = 2;
const bool FILTER_BRAKE = true;
const bool FILTER_THROTTLE  = false;
const bool FILTER_CLUTCH  = true;
long bufferBrake[SAMPLE_COUNT], bufferThrottle[SAMPLE_COUNT], bufferClutch[SAMPLE_COUNT];
int indexBrake = 0, indexThrottle = 0, indexClutch = 0;

// Protection against electrical/mechanical throttle dropout.
// Ignores a few impossible readings; accepts the release if the drop persists.
const bool THROTTLE_DROPOUT_PROTECTION = true;
const byte THROTTLE_DROPOUT_CONFIRMATIONS = 3;
const int THROTTLE_SHARP_DROP_PERCENT = 35;
const int THROTTLE_MIN_PROTECTION_PERCENT = 20;

// Calibration mode.
// Keep enabled to see raw values and calibrate MAX_LOAD.
// Remove the define when calibration is done.
#define CALIBRATION

// Serial log flags.
// Enable/disable according to what you want to see in Serial Monitor.
const bool LOG_RAW = false;
const bool LOG_FILTERED  = false;
const bool LOG_USEFUL  = true;
const bool LOG_PCT   = true;
const bool LOG_OUT   = true;
const bool LOG_PWM   = true;
const bool LOG_THROTTLE_PROTECTION = true;

// Electrical output test for the base.
// Set true to ignore the throttle HX711 and generate a ramp on PWM_THROTTLE.
const bool TEST_THROTTLE_OUTPUT = false;
const unsigned long TEST_OUTPUT_PERIOD_MS = 10000;
const int PWM_MAX_THROTTLE_TEST = 180;
const bool TEST_THROTTLE_OUTPUT_STEPS = true;
const unsigned long TEST_OUTPUT_STEP_MS = 2500;

// Tolerance for considering HX711 values truly changed.
const long LOG_DELTA_HX711 = 100;

const unsigned long QUICK_PRESS_MAX_MS = 600;
const unsigned long BUTTON_COMBO_WINDOW_MS = 900;
const unsigned long HOLD_TO_CLEAR_MS = 3000;
const unsigned long HOLD_TO_SAVE_MS = 6000;
const unsigned long BUTTON_DEBOUNCE_MS = 40;

const unsigned long EEPROM_SIGNATURE = 0xC4112026;
const int EEPROM_VERSION = 2;

struct CalibrationDataV1 {
  unsigned long signature;
  int version;
  long maxBrake;
  long maxThrottle;
  long maxClutch;
};

struct CalibrationData {
  unsigned long signature;
  int version;
  long maxBrake;
  long maxThrottle;
  long maxClutch;
  byte activeProfile;
  byte reserved[3];
};

bool throttleProtectionActive = false;
long throttleUsefulBeforeProtection = 0;

byte pendingStatusBlinks = 0;
bool statusLedOn = false;
bool statusLedForcedOn = false;
byte forcedStatusLedToggles = 0;
bool forcedStatusLedOn = true;
unsigned long nextForcedStatusLedChange = 0;
unsigned long nextStatusLedChange = 0;
unsigned int statusLedOnMs = 120;
unsigned int statusLedOffMs = 160;
const unsigned int STATUS_LED_SHORT_ON_MS = 120;
const unsigned int STATUS_LED_SHORT_OFF_MS = 160;
const unsigned int STATUS_LED_LONG_ON_MS = 260;
const unsigned int STATUS_LED_LONG_OFF_MS = 220;
const unsigned int STATUS_LED_HOLD_MARKER_MS = 90;

// ============================================================
void scheduleStatusBlinks(byte count, unsigned int onMs, unsigned int offMs) {
  statusLedForcedOn = false;
  pendingStatusBlinks = count;
  statusLedOn = false;
  nextStatusLedChange = 0;
  statusLedOnMs = onMs;
  statusLedOffMs = offMs;
  digitalWrite(STATUS_LED_PIN, LOW);
}

// ============================================================
void scheduleShortStatusBlinks(byte count) {
  scheduleStatusBlinks(count, STATUS_LED_SHORT_ON_MS, STATUS_LED_SHORT_OFF_MS);
}

// ============================================================
void scheduleLongStatusBlinks(byte count) {
  scheduleStatusBlinks(count, STATUS_LED_LONG_ON_MS, STATUS_LED_LONG_OFF_MS);
}

// ============================================================
void setStatusLedForcedOn(bool enabled) {
  statusLedForcedOn = enabled;
  forcedStatusLedToggles = 0;
  forcedStatusLedOn = true;
  nextForcedStatusLedChange = 0;
  if (enabled) {
    pendingStatusBlinks = 0;
    statusLedOn = true;
    nextStatusLedChange = 0;
    digitalWrite(STATUS_LED_PIN, HIGH);
  } else {
    statusLedOn = false;
    nextStatusLedChange = 0;
    digitalWrite(STATUS_LED_PIN, LOW);
  }
}

// ============================================================
void scheduleForcedStatusPulses(byte count) {
  if (!statusLedForcedOn || count == 0) return;

  forcedStatusLedToggles = count * 2;
  forcedStatusLedOn = true;
  nextForcedStatusLedChange = 0;
}

// ============================================================
void updateStatusLed() {
  if (statusLedForcedOn) {
    if (forcedStatusLedToggles == 0) {
      digitalWrite(STATUS_LED_PIN, HIGH);
      return;
    }

    unsigned long now = millis();
    if (nextForcedStatusLedChange != 0 && now < nextForcedStatusLedChange) return;

    forcedStatusLedOn = !forcedStatusLedOn;
    digitalWrite(STATUS_LED_PIN, forcedStatusLedOn ? HIGH : LOW);
    forcedStatusLedToggles--;
    nextForcedStatusLedChange = now + STATUS_LED_HOLD_MARKER_MS;
    return;
  }
  if (pendingStatusBlinks == 0) return;

  unsigned long now = millis();
  if (nextStatusLedChange != 0 && now < nextStatusLedChange) return;

  if (!statusLedOn) {
    digitalWrite(STATUS_LED_PIN, HIGH);
    statusLedOn = true;
    nextStatusLedChange = now + statusLedOnMs;
  } else {
    digitalWrite(STATUS_LED_PIN, LOW);
    statusLedOn = false;
    pendingStatusBlinks--;
    nextStatusLedChange = now + statusLedOffMs;
  }
}

// ============================================================
long adjustMaximum(long value, int adjustPercent) {
  long adjusted = (value * adjustPercent) / 100;
  if (adjusted < 1) adjusted = 1;
  return adjusted;
}

// ============================================================
bool calibrationMaximumsAreValid(long maxBrake, long maxThrottle, long maxClutch) {
  return maxBrake > CALIB_MIN_BRAKE &&
         maxThrottle > CALIB_MIN_THROTTLE &&
         maxClutch > CALIB_MIN_CLUTCH;
}

// ============================================================
void saveSettings() {
  CalibrationData data = {
    EEPROM_SIGNATURE,
    EEPROM_VERSION,
    MAX_LOAD_BRAKE,
    MAX_LOAD_THROTTLE,
    MAX_LOAD_CLUTCH,
    activeProfile,
    {0, 0, 0}
  };

  EEPROM.put(0, data);
}

// ============================================================
void printActiveProfile() {
  Serial.print(F("Active pedal profile "));
  Serial.print(activeProfile + 1);
  Serial.print(F(": "));
  if (activeProfile == PROFILE_GT7) {
    Serial.println(F("GT7 inverse throttle"));
  } else {
    Serial.println(F("Linear / PC"));
  }
}

// ============================================================
void applyQuickProfileClicks(byte clickCount) {
  if (clickCount == 0) return;

  activeProfile = (activeProfile + clickCount) % PROFILE_COUNT;
  scheduleShortStatusBlinks(activeProfile + 1);
  printActiveProfile();
}

// ============================================================
void loadCalibration() {
  CalibrationData data;
  EEPROM.get(0, data);

  if (data.signature == EEPROM_SIGNATURE &&
      data.version == EEPROM_VERSION &&
      calibrationMaximumsAreValid(data.maxBrake, data.maxThrottle, data.maxClutch))
  {
    MAX_LOAD_BRAKE = data.maxBrake;
    MAX_LOAD_THROTTLE  = data.maxThrottle;
    MAX_LOAD_CLUTCH  = data.maxClutch;
    activeProfile = data.activeProfile < PROFILE_COUNT ? data.activeProfile : PROFILE_LINEAR;
    Serial.print(F("Calibration loaded from EEPROM. Maximums: BRAKE "));
    Serial.print(MAX_LOAD_BRAKE);
    Serial.print(F(" | THROTTLE "));
    Serial.print(MAX_LOAD_THROTTLE);
    Serial.print(F(" | CLUTCH "));
    Serial.println(MAX_LOAD_CLUTCH);
    printActiveProfile();
    return;
  }

  CalibrationDataV1 oldData;
  EEPROM.get(0, oldData);
  if (oldData.signature == EEPROM_SIGNATURE &&
      oldData.version == 1 &&
      calibrationMaximumsAreValid(oldData.maxBrake, oldData.maxThrottle, oldData.maxClutch))
  {
    MAX_LOAD_BRAKE = oldData.maxBrake;
    MAX_LOAD_THROTTLE  = oldData.maxThrottle;
    MAX_LOAD_CLUTCH  = oldData.maxClutch;
    activeProfile = PROFILE_LINEAR;
    Serial.print(F("Calibration loaded from EEPROM v1. It will migrate when calibration is saved. Maximums: BRAKE "));
    Serial.print(MAX_LOAD_BRAKE);
    Serial.print(F(" | THROTTLE "));
    Serial.print(MAX_LOAD_THROTTLE);
    Serial.print(F(" | CLUTCH "));
    Serial.println(MAX_LOAD_CLUTCH);
    printActiveProfile();
  } else {
    Serial.println(F("No valid calibration in EEPROM. Using default values."));
    printActiveProfile();
  }
}

// ============================================================
void saveCalibration() {
  bool updated = false;

  if (learnedMaxBrake > CALIB_MIN_BRAKE) {
    MAX_LOAD_BRAKE = adjustMaximum(learnedMaxBrake, MAX_ADJUST_BRAKE_PERCENT);
    updated = true;
  }
  if (learnedMaxThrottle > CALIB_MIN_THROTTLE) {
    MAX_LOAD_THROTTLE = adjustMaximum(learnedMaxThrottle, MAX_ADJUST_THROTTLE_PERCENT);
    updated = true;
  }
  if (learnedMaxClutch > CALIB_MIN_CLUTCH) {
    MAX_LOAD_CLUTCH = adjustMaximum(learnedMaxClutch, MAX_ADJUST_CLUTCH_PERCENT);
    updated = true;
  }

  if (!updated) {
    Serial.println(F("Nothing to save: no pedal passed the plausible calibration minimum."));
    return;
  }

  saveSettings();
  scheduleLongStatusBlinks(3);
  Serial.print(F("Calibration saved. Maximums: BRAKE "));
  Serial.print(MAX_LOAD_BRAKE);
  Serial.print(F(" | THROTTLE "));
  Serial.print(MAX_LOAD_THROTTLE);
  Serial.print(F(" | CLUTCH "));
  Serial.println(MAX_LOAD_CLUTCH);
}

// ============================================================
void setup() {
  Serial.begin(115200);
  pinMode(CAL_BUTTON_PIN, INPUT_PULLUP);
  pinMode(STATUS_LED_PIN, OUTPUT);
  digitalWrite(STATUS_LED_PIN, LOW);
  loadCalibration();

  // Timer1 -> pins 9 and 10 at ~62kHz
  TCCR1A = _BV(COM1A1) | _BV(COM1B1) | _BV(WGM10);
  TCCR1B = _BV(CS10);

  // Timer2 -> pin 11 at ~31kHz
  TCCR2B = (TCCR2B & 0b11111000) | 0x01;

  // The base may check the pedals right after power-up. Put outputs at rest
  // before waiting for HX711/tare so it does not see a dead line.
  analogWrite(PWM_BRAKE, PWM_REST);
  analogWrite(PWM_THROTTLE,  PWM_REST);
  analogWrite(PWM_CLUTCH,  PWM_REST);

  // Inicializa HX711 SEM fator de escala (reading bruta)
  scaleBrake.begin(BRAKE_DT, BRAKE_SCK);
  scaleThrottle.begin(THROTTLE_DT,   THROTTLE_SCK);
  scaleClutch.begin(CLUTCH_DT,   CLUTCH_SCK);

  // Wait for modules.
  Serial.println("Waiting for HX711...");
  while (!scaleBrake.is_ready() || !scaleThrottle.is_ready() || !scaleClutch.is_ready()) {
    delay(100);
  }

  // Zero at rest position with all pedals released.
  Serial.println("Taring... keep all pedals released.");
  delay(2000);
  scaleBrake.tare();
  scaleThrottle.tare();
  scaleClutch.tare();

  // Clear buffers.
  memset(bufferBrake, 0, sizeof(bufferBrake));
  memset(bufferThrottle,  0, sizeof(bufferThrottle));
  memset(bufferClutch,  0, sizeof(bufferClutch));

  Serial.println("System ready.");
  scheduleShortStatusBlinks(activeProfile + 1);

#ifdef CALIBRATION
  Serial.println("== CALIBRATION MODE ==");
  Serial.println("Use LOG_RAW, LOG_FILTERED, LOG_USEFUL, LOG_PCT, LOG_OUT, and LOG_PWM to choose the log.");
  if (LOG_RAW) {
    Serial.println("Press each pedal fully and write down the highest RAW value.");
    Serial.println("Paste those values into MAX_LOAD_xxx and remove #define CALIBRATION.");
  }
#endif
}

// ============================================================
long movingAverage(long* buf, int* idx, long newValue) {
  buf[*idx] = newValue;
  *idx = (*idx + 1) % SAMPLE_COUNT;

  long sum = 0;
  for (int i = 0; i < SAMPLE_COUNT; i++) sum += buf[i];
  return sum / SAMPLE_COUNT;
}

// ============================================================
int calculatePWM(long reading, long maxLoad, int pwmMax) {
  if (reading < 0) reading = 0;
  if (reading > maxLoad) reading = maxLoad;
  return map(reading, 0, maxLoad, PWM_REST, pwmMax);
}

// ============================================================
int calculatePct(long reading, long maxLoad) {
  if (reading < 0) reading = 0;
  if (reading > maxLoad) reading = maxLoad;
  return map(reading, 0, maxLoad, 0, 100);
}

// ============================================================
int applyCurvePct(int pct, int curvePercent) {
  if (pct < 0) pct = 0;
  if (pct > 100) pct = 100;

  long adjustment = ((long)pct * (100 - pct) * abs(curvePercent)) / 10000;
  if (curvePercent > 0) pct += adjustment;
  if (curvePercent < 0) pct -= adjustment;

  if (pct < 0) pct = 0;
  if (pct > 100) pct = 100;
  return pct;
}

// ============================================================
int applyCurveTablePct(int pct, const byte* inputPoints, const byte* outputPoints, byte pointCount) {
  if (pct <= inputPoints[0]) return outputPoints[0];
  if (pct >= inputPoints[pointCount - 1]) return outputPoints[pointCount - 1];

  for (byte i = 1; i < pointCount; i++) {
    if (pct <= inputPoints[i]) {
      int inputLow = inputPoints[i - 1];
      int inputHigh = inputPoints[i];
      int outputLow = outputPoints[i - 1];
      int outputHigh = outputPoints[i];
      long numerator = (long)(pct - inputLow) * (outputHigh - outputLow);
      return outputLow + numerator / (inputHigh - inputLow);
    }
  }

  return pct;
}

// ============================================================
int applyThrottleProfilePct(int pct) {
  if (activeProfile == PROFILE_GT7) {
    return applyCurveTablePct(pct, GT7_THROTTLE_INPUT, GT7_THROTTLE_OUTPUT, GT7_THROTTLE_POINT_COUNT);
  }

  return pct;
}

// ============================================================
int calculatePWMFromPct(int pct, int pwmMax) {
  if (pct < 0) pct = 0;
  if (pct > 100) pct = 100;
  return map(pct, 0, 100, PWM_REST, pwmMax);
}

// ============================================================
int triangularTestPct(unsigned long periodMs) {
  unsigned long phase = millis() % periodMs;
  unsigned long half = periodMs / 2;

  if (phase < half) return map(phase, 0, half, 0, 100);
  return map(phase - half, 0, half, 100, 0);
}

// ============================================================
int steppedTestPct(unsigned long stepTimeMs) {
  const int steps[] = {0, 25, 50, 75, 100, 75, 50, 25};
  const byte stepCount = sizeof(steps) / sizeof(steps[0]);
  byte index = (millis() / stepTimeMs) % stepCount;
  return steps[index];
}

// ============================================================
long applyDeadZone(long reading, long deadZone) {
  if (abs(reading) <= deadZone) return 0;
  if (reading < 0) return 0;
  return reading;
}

// ============================================================
bool changedLong(long current, long previous, long minimumDelta) {
  return abs(current - previous) >= minimumDelta;
}

// ============================================================
long protectThrottleDropout(long usefulThrottle) {
  static long lastAcceptedThrottle = 0;
  static byte dropReadings = 0;

  throttleProtectionActive = false;
  throttleUsefulBeforeProtection = usefulThrottle;

  if (!THROTTLE_DROPOUT_PROTECTION) return usefulThrottle;

  long minimumDrop = (MAX_LOAD_THROTTLE * THROTTLE_SHARP_DROP_PERCENT) / 100;
  long protectedMinimum = (MAX_LOAD_THROTTLE * THROTTLE_MIN_PROTECTION_PERCENT) / 100;
  bool sharpDrop = lastAcceptedThrottle > protectedMinimum &&
                     usefulThrottle + minimumDrop < lastAcceptedThrottle;

  if (sharpDrop) {
    dropReadings++;
    if (dropReadings < THROTTLE_DROPOUT_CONFIRMATIONS) {
      throttleProtectionActive = true;
      return lastAcceptedThrottle;
    }
  } else {
    dropReadings = 0;
  }

  lastAcceptedThrottle = usefulThrottle;
  return usefulThrottle;
}

// ============================================================
void learnMaximums(long usefulBrake, long usefulThrottle, long usefulClutch) {
  if (usefulBrake > learnedMaxBrake) learnedMaxBrake = usefulBrake;
  if (usefulThrottle  > learnedMaxThrottle)  learnedMaxThrottle  = usefulThrottle;
  if (usefulClutch  > learnedMaxClutch)  learnedMaxClutch  = usefulClutch;
}

// ============================================================
void clearLearnedMaximums() {
  learnedMaxBrake = 0;
  learnedMaxThrottle  = 0;
  learnedMaxClutch  = 0;
  scheduleLongStatusBlinks(1);
  Serial.println(F("Learned maximums cleared. Press the pedals and use quick click + 6s hold to save."));
}

// ============================================================
void handleCalibrationButton() {
  static bool previousReading = false;
  static bool buttonPressed = false;
  static bool comboHoldPress = false;
  static unsigned long lastChange = 0;
  static unsigned long pressStart = 0;
  static unsigned long lastQuickRelease = 0;
  static bool profileClickPending = false;
  static bool clearHoldMarkerShown = false;
  static bool saveHoldMarkerShown = false;

  unsigned long now = millis();
  bool currentReading = digitalRead(CAL_BUTTON_PIN) == LOW;

  if (currentReading != previousReading) {
    previousReading = currentReading;
    lastChange = now;
  }

  if ((now - lastChange) < BUTTON_DEBOUNCE_MS) return;

  if (!buttonPressed &&
      profileClickPending &&
      (now - lastQuickRelease) > BUTTON_COMBO_WINDOW_MS)
  {
    applyQuickProfileClicks(1);
    profileClickPending = false;
  }

  if (currentReading != buttonPressed) {
    buttonPressed = currentReading;
    if (buttonPressed) {
      pressStart = now;
      comboHoldPress = profileClickPending &&
                       (now - lastQuickRelease) <= BUTTON_COMBO_WINDOW_MS;
      if (comboHoldPress) {
        profileClickPending = false;
        clearHoldMarkerShown = false;
        saveHoldMarkerShown = false;
        setStatusLedForcedOn(true);
        Serial.println(F("Hold command: release after 3s to clear learned maximums, or after 6s to save."));
      }
    } else {
      unsigned long pressDuration = now - pressStart;

      if (comboHoldPress) {
        setStatusLedForcedOn(false);
        if (pressDuration >= HOLD_TO_SAVE_MS) {
          saveCalibration();
        } else if (pressDuration >= HOLD_TO_CLEAR_MS) {
          clearLearnedMaximums();
        } else {
          Serial.println(F("Second click released before 3s. Command cancelled; profile unchanged."));
        }
        comboHoldPress = false;
      } else if (pressDuration <= QUICK_PRESS_MAX_MS) {
        profileClickPending = true;
        lastQuickRelease = now;
        Serial.println(F("Quick click: wait briefly to change profile, or hold the next click for calibration."));
      } else {
        Serial.println(F("Long press ignored. Use quick click + hold for calibration commands."));
      }
    }
  }

  if (buttonPressed && comboHoldPress) {
    unsigned long pressDuration = now - pressStart;
    if (!saveHoldMarkerShown && pressDuration >= HOLD_TO_SAVE_MS) {
      saveHoldMarkerShown = true;
      clearHoldMarkerShown = true;
      scheduleForcedStatusPulses(3);
      Serial.println(F("6s reached: release now to save calibration and active profile."));
    } else if (!clearHoldMarkerShown && pressDuration >= HOLD_TO_CLEAR_MS) {
      clearHoldMarkerShown = true;
      scheduleForcedStatusPulses(1);
      Serial.println(F("3s reached: release now to clear learned maximums, or keep holding to save."));
    }
  }
}

// ============================================================
void loop() {
  static long rawBrake = 0, rawThrottle = 0, rawClutch = 0;
  static long filteredBrake = 0, filteredThrottle = 0, filteredClutch = 0;

  // Each HX711 updates at its own rhythm. When there is no new sample,
  // keep the last reading and do not repeat a value into the filter.
  if (scaleBrake.is_ready()) {
    rawBrake = scaleBrake.read_average(1) - scaleBrake.get_offset();
    filteredBrake = FILTER_BRAKE ? movingAverage(bufferBrake, &indexBrake, rawBrake) : rawBrake;
  }
  if (scaleThrottle.is_ready()) {
    rawThrottle = scaleThrottle.read_average(1) - scaleThrottle.get_offset();
    filteredThrottle = FILTER_THROTTLE ? movingAverage(bufferThrottle, &indexThrottle, rawThrottle) : rawThrottle;
  }
  if (scaleClutch.is_ready()) {
    rawClutch = scaleClutch.read_average(1) - scaleClutch.get_offset();
    filteredClutch = FILTER_CLUTCH ? movingAverage(bufferClutch, &indexClutch, rawClutch) : rawClutch;
  }

  long usefulBrake = applyDeadZone(filteredBrake, DEAD_ZONE_BRAKE);
  long usefulThrottle  = applyDeadZone(filteredThrottle,  DEAD_ZONE_THROTTLE);
  long usefulClutch  = applyDeadZone(filteredClutch,  DEAD_ZONE_CLUTCH);
  usefulThrottle = protectThrottleDropout(usefulThrottle);
  learnMaximums(usefulBrake, usefulThrottle, usefulClutch);

  int pctBrake = calculatePct(usefulBrake, MAX_LOAD_BRAKE);
  int pctThrottle  = calculatePct(usefulThrottle,  MAX_LOAD_THROTTLE);
  int pctClutch  = calculatePct(usefulClutch,  MAX_LOAD_CLUTCH);
  int pctBrakeCurve = applyCurvePct(pctBrake, CURVE_BRAKE_PERCENT);
  int pctThrottleCurve  = applyThrottleProfilePct(applyCurvePct(pctThrottle,  CURVE_THROTTLE_PERCENT));
  int pctClutchCurve  = applyCurvePct(pctClutch,  CURVE_CLUTCH_PERCENT);

  // Proportional PWM with optional per-pedal curve.
  int pwmBrake = calculatePWMFromPct(pctBrakeCurve, PWM_MAX_BRAKE);
  int pwmThrottle  = calculatePWMFromPct(pctThrottleCurve,  PWM_MAX_THROTTLE);
  int pwmClutch  = calculatePWMFromPct(pctClutchCurve,  PWM_MAX_CLUTCH);

  if (TEST_THROTTLE_OUTPUT) {
    if (TEST_THROTTLE_OUTPUT_STEPS) {
      pctThrottle = steppedTestPct(TEST_OUTPUT_STEP_MS);
    } else {
      pctThrottle = triangularTestPct(TEST_OUTPUT_PERIOD_MS);
    }
    pctThrottleCurve = pctThrottle;
    pwmThrottle = calculatePWMFromPct(pctThrottleCurve, PWM_MAX_THROTTLE_TEST);
  }

  analogWrite(PWM_BRAKE, pwmBrake);
  analogWrite(PWM_THROTTLE,  pwmThrottle);
  analogWrite(PWM_CLUTCH,  pwmClutch);
  handleCalibrationButton();
  updateStatusLed();

#ifdef CALIBRATION
  static bool firstLog = true;
  static long lastRawBrake = 0, lastRawThrottle = 0, lastRawClutch = 0;
  static long lastFilteredBrake = 0, lastFilteredThrottle = 0, lastFilteredClutch = 0;
  static long lastUsefulBrake = 0, lastUsefulThrottle = 0, lastUsefulClutch = 0;
  static int lastPctBrake = 0, lastPctThrottle = 0, lastPctClutch = 0;
  static int lastOutBrake = 0, lastOutThrottle = 0, lastOutClutch = 0;
  static int lastPwmBrake = 0, lastPwmThrottle = 0, lastPwmClutch = 0;

  bool changed = firstLog;
  if (LOG_RAW) {
    changed |= changedLong(rawBrake, lastRawBrake, LOG_DELTA_HX711);
    changed |= changedLong(rawThrottle,  lastRawThrottle,  LOG_DELTA_HX711);
    changed |= changedLong(rawClutch,  lastRawClutch,  LOG_DELTA_HX711);
  }
  if (LOG_FILTERED) {
    changed |= changedLong(filteredBrake, lastFilteredBrake, LOG_DELTA_HX711);
    changed |= changedLong(filteredThrottle,  lastFilteredThrottle,  LOG_DELTA_HX711);
    changed |= changedLong(filteredClutch,  lastFilteredClutch,  LOG_DELTA_HX711);
  }
  if (LOG_USEFUL) {
    changed |= changedLong(usefulBrake, lastUsefulBrake, LOG_DELTA_HX711);
    changed |= changedLong(usefulThrottle,  lastUsefulThrottle,  LOG_DELTA_HX711);
    changed |= changedLong(usefulClutch,  lastUsefulClutch,  LOG_DELTA_HX711);
  }
  if (LOG_PCT) {
    changed |= pctBrake != lastPctBrake;
    changed |= pctThrottle  != lastPctThrottle;
    changed |= pctClutch  != lastPctClutch;
  }
  if (LOG_OUT) {
    changed |= pctBrakeCurve != lastOutBrake;
    changed |= pctThrottleCurve  != lastOutThrottle;
    changed |= pctClutchCurve  != lastOutClutch;
  }
  if (LOG_PWM) {
    changed |= pwmBrake != lastPwmBrake;
    changed |= pwmThrottle  != lastPwmThrottle;
    changed |= pwmClutch  != lastPwmClutch;
  }
  if (LOG_THROTTLE_PROTECTION) {
    changed |= throttleProtectionActive;
  }

  if (changed) {
    Serial.print("BRAKE");
    if (LOG_RAW) { Serial.print(" raw:"); Serial.print(rawBrake); }
    if (LOG_FILTERED)  { Serial.print(" filt:");  Serial.print(filteredBrake); }
    if (LOG_USEFUL)  { Serial.print(" useful:");  Serial.print(usefulBrake); }
    if (LOG_PCT)   { Serial.print(" pct:");   Serial.print(pctBrake); }
    if (LOG_OUT)   { Serial.print(" out:");   Serial.print(pctBrakeCurve); }
    if (LOG_PWM)   { Serial.print(" pwm:");   Serial.print(pwmBrake); }

    Serial.print(" | THROTTLE");
    if (LOG_RAW) { Serial.print(" raw:"); Serial.print(rawThrottle); }
    if (LOG_FILTERED)  { Serial.print(" filt:");  Serial.print(filteredThrottle); }
    if (LOG_USEFUL)  { Serial.print(" useful:");  Serial.print(usefulThrottle); }
    if (LOG_PCT)   { Serial.print(" pct:");   Serial.print(pctThrottle); }
    if (LOG_OUT)   { Serial.print(" out:");   Serial.print(pctThrottleCurve); }
    if (LOG_PWM)   { Serial.print(" pwm:");   Serial.print(pwmThrottle); }
    if (LOG_THROTTLE_PROTECTION && throttleProtectionActive) {
      Serial.print(" raw:");
      Serial.print(throttleUsefulBeforeProtection);
      Serial.print(" prot:1");
    }

    Serial.print(" | CLUTCH");
    if (LOG_RAW) { Serial.print(" raw:"); Serial.print(rawClutch); }
    if (LOG_FILTERED)  { Serial.print(" filt:");  Serial.print(filteredClutch); }
    if (LOG_USEFUL)  { Serial.print(" useful:");  Serial.print(usefulClutch); }
    if (LOG_PCT)   { Serial.print(" pct:");   Serial.print(pctClutch); }
    if (LOG_OUT)   { Serial.print(" out:");   Serial.print(pctClutchCurve); }
    if (LOG_PWM)   { Serial.print(" pwm:");   Serial.print(pwmClutch); }
    Serial.println();

    firstLog = false;
    lastRawBrake = rawBrake;
    lastRawThrottle  = rawThrottle;
    lastRawClutch  = rawClutch;
    lastFilteredBrake = filteredBrake;
    lastFilteredThrottle  = filteredThrottle;
    lastFilteredClutch  = filteredClutch;
    lastUsefulBrake = usefulBrake;
    lastUsefulThrottle  = usefulThrottle;
    lastUsefulClutch  = usefulClutch;
    lastPctBrake = pctBrake;
    lastPctThrottle  = pctThrottle;
    lastPctClutch  = pctClutch;
    lastOutBrake = pctBrakeCurve;
    lastOutThrottle  = pctThrottleCurve;
    lastOutClutch  = pctClutchCurve;
    lastPwmBrake = pwmBrake;
    lastPwmThrottle  = pwmThrottle;
    lastPwmClutch  = pwmClutch;
  }
#endif

  delay(0);
}

