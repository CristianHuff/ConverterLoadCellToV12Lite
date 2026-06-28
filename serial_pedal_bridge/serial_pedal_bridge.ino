// ============================================================
//  SERIAL PEDAL BRIDGE - PC/Sim Ruito USB -> Arduino -> PXN
//  Input: Serial lines from PC: clutch,brake,throttle percentages
//  Output: PWM -> RC filter -> voltage divider -> PXN RJ45
// ============================================================

// Output PWM pins, in board order: clutch, brake, throttle.
#define PWM_CLUTCH    9
#define PWM_BRAKE     10
#define PWM_THROTTLE  11

// Target PWM values measured on the bench.
const int PWM_REST = 3;
const int PWM_MAX_BRAKE = 204;
const int PWM_MAX_THROTTLE = 194;
const int PWM_MAX_CLUTCH = 193;

// Serial protocol.
// Expected line: clutch,brake,throttle
// Example: 0,23,71
const unsigned long SERIAL_BAUD = 115200;
const unsigned long SERIAL_TIMEOUT_MS = 300;
const byte SERIAL_BUFFER_SIZE = 32;

int pctBrake = 0;
int pctThrottle = 0;
int pctClutch = 0;
unsigned long lastSerialPacket = 0;
bool serialTimedOut = true;

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
bool parsePedalLine(char* line, int* clutch, int* brake, int* throttle) {
  int parsedClutch = 0;
  int parsedBrake = 0;
  int parsedThrottle = 0;

  if (sscanf(line, "%d,%d,%d", &parsedClutch, &parsedBrake, &parsedThrottle) != 3) {
    return false;
  }

  *clutch = clampPct(parsedClutch);
  *brake = clampPct(parsedBrake);
  *throttle = clampPct(parsedThrottle);
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

      int newClutch = 0;
      int newBrake = 0;
      int newThrottle = 0;
      if (parsePedalLine(buffer, &newClutch, &newBrake, &newThrottle)) {
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

  analogWrite(PWM_BRAKE, calculatePWMFromPct(pctBrake, PWM_MAX_BRAKE));
  analogWrite(PWM_THROTTLE, calculatePWMFromPct(pctThrottle, PWM_MAX_THROTTLE));
  analogWrite(PWM_CLUTCH, calculatePWMFromPct(pctClutch, PWM_MAX_CLUTCH));
}

// ============================================================
void setup() {
  Serial.begin(SERIAL_BAUD);

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
  Serial.println(F("Send lines as: clutch,brake,throttle"));
  Serial.println(F("Pedal profiles are handled by the PC bridge."));
}

// ============================================================
void loop() {
  readSerialPedals();
  applyOutputs();
  delay(0);
}
