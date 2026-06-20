// ============================================================
//  CAIXA TRADUTORA — Sim Ruito (Célula de Carga) → PXN → PS5
//  Hardware: Arduino Nano + 3x HX711
//  Saída: PWM → Filtro RC → Divisor de tensão → RJ45 PXN
// ============================================================

#include "HX711.h"

// ── Pinos HX711 ─────────────────────────────────────────────
#define FREIO_DT      2
#define FREIO_SCK     3
#define ACEL_DT       4
#define ACEL_SCK      5
#define EMBR_DT       6
#define EMBR_SCK      7

// ── Pinos PWM de saída ──────────────────────────────────────
#define PWM_FREIO     9
#define PWM_ACEL      10
#define PWM_EMBR      11

// ── Instâncias HX711 ────────────────────────────────────────
HX711 scFreio;
HX711 scAcel;
HX711 scEmbr;

// ── Carga máxima em valores BRUTOS ──────────────────────────
// PASSO 1: rode com CALIBRACAO ativo e aperte cada pedal ao fundo
// PASSO 2: anote o maior valor "bruto" que aparecer
// PASSO 3: coloque esses valores aqui e retire o #define CALIBRACAO
long CARGA_MAX_FREIO = 200000;  // ajustar após calibração
long CARGA_MAX_ACEL  = 200000;  // ajustar após calibração
long CARGA_MAX_EMBR  = 200000;  // ajustar após calibração

// ── PWM alvo (calculado dos valores medidos na bancada) ──────
const int PWM_REPOUSO   = 3;
const int PWM_MAX_FREIO = 204;
const int PWM_MAX_ACEL  = 194;
const int PWM_MAX_EMBR  = 193;

// ── Filtro de média móvel ────────────────────────────────────
const int AMOSTRAS = 8;
long bufFreio[AMOSTRAS], bufAcel[AMOSTRAS], bufEmbr[AMOSTRAS];
int idxBuf = 0;

// ── Modo de calibração ───────────────────────────────────────
// Deixe ativo para ver os valores brutos e calibrar CARGA_MAX
// Retire o define quando estiver calibrado
#define CALIBRACAO

// ============================================================
void setup() {
  Serial.begin(115200);

  // Timer1 → pinos 9 e 10 em ~62kHz
  TCCR1A = _BV(COM1A1) | _BV(COM1B1) | _BV(WGM10);
  TCCR1B = _BV(CS10);

  // Timer2 → pino 11 em ~31kHz
  TCCR2B = (TCCR2B & 0b11111000) | 0x01;

  // Inicializa HX711 SEM fator de escala (leitura bruta)
  scFreio.begin(FREIO_DT, FREIO_SCK);
  scAcel.begin(ACEL_DT,   ACEL_SCK);
  scEmbr.begin(EMBR_DT,   EMBR_SCK);

  // Aguarda módulos
  Serial.println("Aguardando HX711...");
  while (!scFreio.is_ready() || !scAcel.is_ready() || !scEmbr.is_ready()) {
    delay(100);
  }

  // Zera na posição de repouso — pedais soltos
  Serial.println("Zerando... mantenha todos os pedais soltos.");
  delay(2000);
  scFreio.tare();
  scAcel.tare();
  scEmbr.tare();

  // Buffer zerado
  memset(bufFreio, 0, sizeof(bufFreio));
  memset(bufAcel,  0, sizeof(bufAcel));
  memset(bufEmbr,  0, sizeof(bufEmbr));

  // Saída inicial em repouso
  analogWrite(PWM_FREIO, PWM_REPOUSO);
  analogWrite(PWM_ACEL,  PWM_REPOUSO);
  analogWrite(PWM_EMBR,  PWM_REPOUSO);

  Serial.println("Sistema pronto.");

#ifdef CALIBRACAO
  Serial.println("== MODO CALIBRACAO ==");
  Serial.println("Aperte cada pedal ao fundo e anote o maior valor BRUTO.");
  Serial.println("Cole esses valores em CARGA_MAX_xxx e retire o #define CALIBRACAO.");
#endif
}

// ============================================================
long mediaMovel(long* buf, long novoValor) {
  buf[idxBuf] = novoValor;
  long soma = 0;
  for (int i = 0; i < AMOSTRAS; i++) soma += buf[i];
  return soma / AMOSTRAS;
}

// ============================================================
int calcPWM(long leitura, long cargaMax, int pwmMax) {
  if (leitura < 0) leitura = 0;
  if (leitura > cargaMax) leitura = cargaMax;
  return map(leitura, 0, cargaMax, PWM_REPOUSO, pwmMax);
}

// ============================================================
void loop() {
  long brutoFreio = 0, brutoAcel = 0, brutoEmbr = 0;

  // Leitura bruta direta — sem get_units(), sem escala
  if (scFreio.is_ready()) brutoFreio = scFreio.read_average(1) - scFreio.get_offset();
  if (scAcel.is_ready())  brutoAcel  = scAcel.read_average(1)  - scAcel.get_offset();
  if (scEmbr.is_ready())  brutoEmbr  = scEmbr.read_average(1)  - scEmbr.get_offset();

  // Média móvel
  long filtFreio = mediaMovel(bufFreio, brutoFreio);
  long filtAcel  = mediaMovel(bufAcel,  brutoAcel);
  long filtEmbr  = mediaMovel(bufEmbr,  brutoEmbr);
  idxBuf = (idxBuf + 1) % AMOSTRAS;

  // PWM proporcional
  int pwmFreio = calcPWM(filtFreio, CARGA_MAX_FREIO, PWM_MAX_FREIO);
  int pwmAcel  = calcPWM(filtAcel,  CARGA_MAX_ACEL,  PWM_MAX_ACEL);
  int pwmEmbr  = calcPWM(filtEmbr,  CARGA_MAX_EMBR,  PWM_MAX_EMBR);

  analogWrite(PWM_FREIO, pwmFreio);
  analogWrite(PWM_ACEL,  pwmAcel);
  analogWrite(PWM_EMBR,  pwmEmbr);

#ifdef CALIBRACAO
  static long ultFreio = 0, ultAcel = 0, ultEmbr = 0;

  if (abs(brutoFreio - ultFreio) > 100 ||
      abs(brutoAcel  - ultAcel)  > 100 ||
      abs(brutoEmbr  - ultEmbr)  > 100)
  {
    Serial.print("FREIO bruto:"); Serial.print(brutoFreio);
    Serial.print(" pwm:");        Serial.print(pwmFreio);
    Serial.print(" | ACEL bruto:"); Serial.print(brutoAcel);
    Serial.print(" pwm:");          Serial.print(pwmAcel);
    Serial.print(" | EMBR bruto:"); Serial.print(brutoEmbr);
    Serial.print(" pwm:");          Serial.println(pwmEmbr);

    ultFreio = brutoFreio;
    ultAcel  = brutoAcel;
    ultEmbr  = brutoEmbr;
  }
#endif

  delay(5);
}
