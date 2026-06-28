// ============================================================
//  SERIAL PEDAL BRIDGE - PC/Sim Ruito USB -> Arduino -> PXN
//  Input: Serial lines from PC: brake,throttle,clutch percentages
//  Output: PWM -> RC filter -> voltage divider -> PXN RJ45
// ============================================================

// Output PWM pins, in board order: clutch, brake, throttle.
#define PWM_CLUTCH    9
#define PWM_BRAKE     10
#define PWM_THROTTLE  11

// Optional button between pin 8 and GND. Uses Arduino internal pull-up.
#define PROFILE_BUTTON_PIN 8

// Status LED: anode on D12 through a resistor, cathode to GND.
#define STATUS_LED_PIN 12

// Target PWM values measured on the bench.
const int PWM_REST = 3;
const int PWM_MAX_BRAKE = 204;
const int PWM_MAX_THROTTLE = 194;
const int PWM_MAX_CLUTCH = 193;

// Serial protocol.
// Expected line: brake,throttle,clutch
// Example: 23,71,0
const unsigned long SERIAL_BAUD = 115200;
const unsigned long SERIAL_TIMEOUT_MS = 300;
const byte SERIAL_BUFFER_SIZE = 32;

// Pedal profiles.
enum PedalProfile {
  PROFILE_LINEAR = 0,
  PROFILE_GT7 = 1,
  PROFILE_COUNT = 2
};

byte activeProfile = PROFILE_LINEAR;

const byte GT7_THROTTLE_POINT_COUNT = 5;
const byte GT7_THROTTLE_INPUT[GT7_THROTTLE_POINT_COUNT] = {0, 25, 50, 75, 100};
const byte GT7_THROTTLE_OUTPUT[GT7_THROTTLE_POINT_COUNT] = {0, 45, 75, 90, 100};

// Button handling.
const unsigned long BUTTON_DEBOUNCE_MS = 40;
const unsigned long QUICK_PRESS_MAX_MS = 600;

// Status LED.
byte pendingStatusBlinks = 0;
bool statusLedOn = false;
unsigned long nextStatusLedChange = 0;
const unsigned int STATUS_LED_ON_MS = 120;
const unsigned int STATUS_LED_OFF_MS = 160;

int pctBrake = 0;
int pctThrottle = 0;
int pctClutch = 0;
unsigned long lastSerialPacket = 0;
bool serialTimedOut = true;

// ============================================================
void scheduleStatusBlinks(byte count) {
  pendingStatusBlinks = count;
  statusLedOn = false;
  nextStatusLedChange = 0;
  digitalWrite(STATUS_LED_PIN, LOW);
}

// ============================================================
void updateStatusLed() {
  if (pendingStatusBlinks == 0) return;

  unsigned long now = millis();
  if (nextStatusLedChange != 0 && now < nextStatusLedChange) return;

  if (!statusLedOn) {
    digitalWrite(STATUS_LED_PIN, HIGH);
    statusLedOn = true;
    nextStatusLedChange = now + STATUS_LED_ON_MS;
  } else {
    digitalWrite(STATUS_LED_PIN, LOW);
    statusLedOn = false;
    pendingStatusBlinks--;
    nextStatusLedChange = now + STATUS_LED_OFF_MS;
  }
}

// ============================================================
int clampPct(int pct) {
  if (pct < 0) return 0;
  if (pct > 100) return 100;
  return pct;
}

// ============================================================
int calculatePWMFromPct(int pct, int pwmMax) {
  pct = clampPct(pct);
  return map(pct, 0, 100, PWM_REST, pwmMax);
}

// ============================================================
int applyCurveTablePct(int pct, const byte* inputPoints, const byte* outputPoints, byte pointCount) {
  pct = clampPct(pct);
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

  return clampPct(pct);
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
void nextProfile() {
  activeProfile = (activeProfile + 1) % PROFILE_COUNT;
  scheduleStatusBlinks(activeProfile + 1);
  printActiveProfile();
}

// ============================================================
void handleProfileButton() {
  static bool previousReading = false;
  static bool buttonPressed = false;
  static unsigned long lastChange = 0;
  static unsigned long pressStart = 0;

  unsigned long now = millis();
  bool currentReading = digitalRead(PROFILE_BUTTON_PIN) == LOW;

  if (currentReading != previousReading) {
    previousReading = currentReading;
    lastChange = now;
  }

  if ((now - lastChange) < BUTTON_DEBOUNCE_MS) return;

  if (currentReading != buttonPressed) {
    buttonPressed = currentReading;
    if (buttonPressed) {
      pressStart = now;
    } else if ((now - pressStart) <= QUICK_PRESS_MAX_MS) {
      nextProfile();
    }
  }
}

// ============================================================
bool parsePedalLine(char* line, int* brake, int* throttle, int* clutch) {
  int parsedBrake = 0;
  int parsedThrottle = 0;
  int parsedClutch = 0;

  if (sscanf(line, "%d,%d,%d", &parsedBrake, &parsedThrottle, &parsedClutch) != 3) {
    return false;
  }

  *brake = clampPct(parsedBrake);
  *throttle = clampPct(parsedThrottle);
  *clutch = clampPct(parsedClutch);
  return true;
}

// ============================================================
void readSerialPedals() {
  static char buffer[SERIAL_BUFFER_SIZE];
  static byte index = 0;

  while (Serial.available() > 0) {
    char c = Serial.read();
    if (c == '\r') continue;

    if (c == '\n') {
      buffer[index] = '\0';
      index = 0;

      int newBrake = 0;
      int newThrottle = 0;
      int newClutch = 0;
      if (parsePedalLine(buffer, &newBrake, &newThrottle, &newClutch)) {
        pctBrake = newBrake;
        pctThrottle = newThrottle;
        pctClutch = newClutch;
        lastSerialPacket = millis();
        if (serialTimedOut) {
          serialTimedOut = false;
          Serial.println(F("Serial pedal input active."));
        }
      } else if (buffer[0] != '\0') {
        Serial.print(F("Invalid pedal line: "));
        Serial.println(buffer);
      }
    } else if (index < SERIAL_BUFFER_SIZE - 1) {
      buffer[index++] = c;
    } else {
      index = 0;
      Serial.println(F("Serial line too long; dropped."));
    }
  }
}

// ============================================================
void applyOutputs() {
  bool timedOut = (millis() - lastSerialPacket) > SERIAL_TIMEOUT_MS;
  if (timedOut) {
    pctBrake = 0;
    pctThrottle = 0;
    pctClutch = 0;
    if (!serialTimedOut) {
      serialTimedOut = true;
      Serial.println(F("Serial pedal input timeout. Outputs at rest."));
    }
  }

  int throttleOut = applyThrottleProfilePct(pctThrottle);

  analogWrite(PWM_BRAKE, calculatePWMFromPct(pctBrake, PWM_MAX_BRAKE));
  analogWrite(PWM_THROTTLE, calculatePWMFromPct(throttleOut, PWM_MAX_THROTTLE));
  analogWrite(PWM_CLUTCH, calculatePWMFromPct(pctClutch, PWM_MAX_CLUTCH));
}

// ============================================================
void setup() {
  Serial.begin(SERIAL_BAUD);
  pinMode(PROFILE_BUTTON_PIN, INPUT_PULLUP);
  pinMode(STATUS_LED_PIN, OUTPUT);
  digitalWrite(STATUS_LED_PIN, LOW);

  // Timer1 -> pins 9 and 10 at ~62kHz.
  TCCR1A = _BV(COM1A1) | _BV(COM1B1) | _BV(WGM10);
  TCCR1B = _BV(CS10);

  // Timer2 -> pin 11 at ~31kHz.
  TCCR2B = (TCCR2B & 0b11111000) | 0x01;

  analogWrite(PWM_BRAKE, PWM_REST);
  analogWrite(PWM_THROTTLE, PWM_REST);
  analogWrite(PWM_CLUTCH, PWM_REST);

  lastSerialPacket = millis();
  serialTimedOut = true;

  Serial.println(F("Serial pedal bridge ready."));
  Serial.println(F("Send lines as: brake,throttle,clutch"));
  printActiveProfile();
  scheduleStatusBlinks(activeProfile + 1);
}

// ============================================================
void loop() {
  readSerialPedals();
  applyOutputs();
  handleProfileButton();
  updateStatusLed();
  delay(0);
}
