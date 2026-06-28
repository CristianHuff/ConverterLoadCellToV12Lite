// ============================================================
//  PWM OUTPUT TEST - Arduino -> PXN/base output isolation
//  Upload this sketch when you want to test the Arduino PWM,
//  RC filters, voltage dividers, RJ45 wiring, and base input
//  without PC serial, browser, gamepad, or Sim Ruito involved.
// ============================================================

// Output PWM pins, in board order: clutch, brake, throttle.
#define PWM_CLUTCH    9
#define PWM_BRAKE     10
#define PWM_THROTTLE  11

const int PWM_REST = 3;
const int PWM_MAX_BRAKE = 204;
const int PWM_MAX_THROTTLE = 194;
const int PWM_MAX_CLUTCH = 193;

const unsigned long STEP_MS = 2500;
const byte STATUS_LED = LED_BUILTIN;

byte stepIndex = 0;
unsigned long nextStepAt = 0;

int pwmAtPct(int pct, int pwmMax) {
  if (pct < 0) pct = 0;
  if (pct > 100) pct = 100;
  return map(pct, 0, 100, PWM_REST, pwmMax);
}

void writeOutputs(int clutchPct, int brakePct, int throttlePct) {
  analogWrite(PWM_CLUTCH, pwmAtPct(clutchPct, PWM_MAX_CLUTCH));
  analogWrite(PWM_BRAKE, pwmAtPct(brakePct, PWM_MAX_BRAKE));
  analogWrite(PWM_THROTTLE, pwmAtPct(throttlePct, PWM_MAX_THROTTLE));
}

void printStep(const __FlashStringHelper* label, int clutchPct, int brakePct, int throttlePct) {
  Serial.print(F("PWM test: "));
  Serial.print(label);
  Serial.print(F(" | clutch:"));
  Serial.print(clutchPct);
  Serial.print(F(" brake:"));
  Serial.print(brakePct);
  Serial.print(F(" throttle:"));
  Serial.println(throttlePct);
}

void applyStep() {
  digitalWrite(STATUS_LED, !digitalRead(STATUS_LED));

  switch (stepIndex) {
    case 0:
      writeOutputs(0, 0, 0);
      printStep(F("all rest"), 0, 0, 0);
      break;
    case 1:
      writeOutputs(50, 0, 0);
      printStep(F("clutch 50%"), 50, 0, 0);
      break;
    case 2:
      writeOutputs(0, 50, 0);
      printStep(F("brake 50%"), 0, 50, 0);
      break;
    case 3:
      writeOutputs(0, 0, 50);
      printStep(F("throttle 50%"), 0, 0, 50);
      break;
    case 4:
      writeOutputs(100, 0, 0);
      printStep(F("clutch 100%"), 100, 0, 0);
      break;
    case 5:
      writeOutputs(0, 100, 0);
      printStep(F("brake 100%"), 0, 100, 0);
      break;
    case 6:
      writeOutputs(0, 0, 100);
      printStep(F("throttle 100%"), 0, 0, 100);
      break;
  }

  stepIndex = (stepIndex + 1) % 7;
}

void setup() {
  Serial.begin(115200);
  pinMode(STATUS_LED, OUTPUT);
  digitalWrite(STATUS_LED, LOW);

  // Timer1 -> pins 9 and 10 at ~62kHz.
  TCCR1A = _BV(COM1A1) | _BV(COM1B1) | _BV(WGM10);
  TCCR1B = _BV(CS10);

  // Timer2 -> pin 11 at ~31kHz.
  TCCR2B = (TCCR2B & 0b11111000) | 0x01;

  writeOutputs(0, 0, 0);
  Serial.println(F("PWM output test ready."));
  Serial.println(F("Cycling rest, clutch, brake, and throttle every 2.5 seconds."));
  nextStepAt = 0;
}

void loop() {
  unsigned long now = millis();
  if (nextStepAt == 0 || now >= nextStepAt) {
    applyStep();
    nextStepAt = now + STEP_MS;
  }
}
