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
const byte STATUS_LED = LED_BUILTIN;

// Serial protocol.
// Expected line: clutch,brake,throttle
// Example: 0,23,71
// Diagnostic command: PING
const unsigned long SERIAL_BAUD = 115200;
const unsigned long SERIAL_TIMEOUT_MS = 250;
const unsigned long SERIAL_REPORT_MS = 1000;
const unsigned long MANUAL_COMMAND_HOLD_MS = 3000;
const byte SERIAL_BUFFER_SIZE = 32;

int pctBrake = 0;
int pctThrottle = 0;
int pctClutch = 0;
unsigned long lastSerialPacket = 0;
unsigned long lastSerialReport = 0;
unsigned long serialPacketCount = 0;
unsigned long lastReportedPacketCount = 0;
unsigned long statusLedUntil = 0;
unsigned long manualCommandHoldUntil = 0;
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
void acceptPedalValues(int clutch, int brake, int throttle, unsigned long holdMs) {
  pctClutch = clampPct(clutch);
  pctBrake = clampPct(brake);
  pctThrottle = clampPct(throttle);
  lastSerialPacket = millis();
  manualCommandHoldUntil = holdMs > 0 ? lastSerialPacket + holdMs : 0;
  serialPacketCount++;
  pulseStatusLed();
  if (serialTimedOut) {
    serialTimedOut = false;
    Serial.println(F("Serial pedal input active."));
  }
}

// ============================================================
void pulseStatusLed() {
  digitalWrite(STATUS_LED, HIGH);
  statusLedUntil = millis() + 40;
}

// ============================================================
void updateStatusLed() {
  if (statusLedUntil != 0 && millis() >= statusLedUntil) {
    digitalWrite(STATUS_LED, LOW);
    statusLedUntil = 0;
  }
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
bool handleSerialCommand(char* line) {
  if (strcmp(line, "PING") == 0) {
    pulseStatusLed();
    Serial.println(F("PONG serial_pedal_bridge"));
    return true;
  }

  if (strcmp(line, "R") == 0 || strcmp(line, "REST") == 0) {
    acceptPedalValues(0, 0, 0, MANUAL_COMMAND_HOLD_MS);
    Serial.println(F("Manual command: rest"));
    return true;
  }

  char pedal = line[0];
  if ((pedal == 'C' || pedal == 'B' || pedal == 'T') && line[1] != '\0') {
    int pct = clampPct(atoi(line + 1));
    int clutch = 0;
    int brake = 0;
    int throttle = 0;

    if (pedal == 'C') clutch = pct;
    if (pedal == 'B') brake = pct;
    if (pedal == 'T') throttle = pct;

    acceptPedalValues(clutch, brake, throttle, MANUAL_COMMAND_HOLD_MS);
    Serial.print(F("Manual command: "));
    Serial.print(pedal);
    Serial.print(F(" "));
    Serial.println(pct);
    return true;
  }

  return false;
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
      if (handleSerialCommand(buffer)) {
        // Command handled; no pedal output change.
      } else if (parsePedalLine(buffer, &newClutch, &newBrake, &newThrottle)) {
        acceptPedalValues(newClutch, newBrake, newThrottle, 0);
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
void reportSerialActivity() {
  if (serialTimedOut) return;
  if (serialPacketCount == lastReportedPacketCount) return;
  if ((millis() - lastSerialReport) < SERIAL_REPORT_MS) return;

  lastSerialReport = millis();
  lastReportedPacketCount = serialPacketCount;
  Serial.print(F("RX ok packets:"));
  Serial.print(serialPacketCount);
  Serial.print(F(" last:"));
  Serial.print(pctClutch);
  Serial.print(',');
  Serial.print(pctBrake);
  Serial.print(',');
  Serial.println(pctThrottle);
}

// ============================================================
void applyOutputs() {
  unsigned long now = millis();
  bool manualHoldActive = manualCommandHoldUntil != 0 && now < manualCommandHoldUntil;
  bool timedOut = !manualHoldActive && (now - lastSerialPacket) > SERIAL_TIMEOUT_MS;
  if (timedOut) {
    pctBrake = 0;
    pctThrottle = 0;
    pctClutch = 0;
    manualCommandHoldUntil = 0;
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
  pinMode(STATUS_LED, OUTPUT);
  digitalWrite(STATUS_LED, LOW);

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
  reportSerialActivity();
  updateStatusLed();
  delay(0);
}
