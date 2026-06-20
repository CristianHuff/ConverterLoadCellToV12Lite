// ============================================================
//  CAIXA TRADUTORA — Sim Ruito (Célula de Carga) → PXN → PS5
//  Hardware: Arduino Nano + 3x HX711
//  Saída: PWM → Filtro RC → Divisor de tensão → RJ45 PXN
//
//  Mapa RJ45 PXN (medido em bancada):
//    Pino 1 → Sinal Embreagem  (23mV repouso / 1,99V fundo)
//    Pino 3 → GND
//    Pino 4 → Sinal Freio      (23mV repouso / 1,74V fundo)
//    Pino 5 → GND
//    Pino 6 → Sinal Acelerador (23mV repouso / 1,89V fundo)
//    Pino 7 → VREF 3,3V (não usar para alimentação)
//    Pino 8 → VREF 3,3V (não usar para alimentação)
//
//  Tensão de saída após divisor R1=R2=10kΩ: 0V–2,5V máximo
//  PWM configurado em alta frequência (~62kHz) no Timer1
//  para minimizar ripple residual no filtro RC (1kΩ + 470nF)
// ============================================================

#include "HX711.h"

// ── Pinos HX711 ─────────────────────────────────────────────
// Cada HX711 usa dois pinos: DATA (DT) e CLOCK (SCK)
#define FREIO_DT      2
#define FREIO_SCK     3
#define ACEL_DT       4
#define ACEL_SCK      5
#define EMBR_DT       6
#define EMBR_SCK      7

// ── Pinos PWM de saída ──────────────────────────────────────
// IMPORTANTE: pinos 9 e 10 pertencem ao Timer1 (alta freq.)
// pino 11 pertence ao Timer2 — frequência separada
#define PWM_FREIO     9
#define PWM_ACEL      10
#define PWM_EMBR      11

// ── Instâncias HX711 ────────────────────────────────────────
HX711 scFreio;
HX711 scAcel;
HX711 scEmbr;

// ── Parâmetros de calibração ─────────────────────────────────
// Ajuste FATOR_CALIBRACAO com uma massa conhecida após montar.
// Valor inicial conservador — refinar em bancada.
float FATOR_CALIBRACAO = 1000.0;

// Leitura bruta quando o pedal está completamente solto.
// Rode o modo CALIBRACAO (abaixo) para obter esses valores.
long OFFSET_FREIO = 0;
long OFFSET_ACEL  = 0;
long OFFSET_EMBR  = 0;

// Força máxima esperada em cada pedal (em unidades HX711).
// Ajuste conforme a célula de carga e força do piloto.
// Freio geralmente tem carga maior que acelerador/embreagem.
long CARGA_MAX_FREIO = 50000;
long CARGA_MAX_ACEL  = 30000;
long CARGA_MAX_EMBR  = 30000;

// ── Tensões alvo medidas (referência de calibração PWM) ──────
// Repouso: ~23mV  → com divisor 1:2 → PWM duty ~1%  → valor ~2
// Fundo:   ~1,99V → com divisor 1:2 → saída ~2,0V   → duty ~80%
// Fórmula: PWM_valor = (tensao_alvo / 5.0) * 255 * 2
//          (o *2 compensa o divisor que corta a tensão pela metade)
// Repouso → 23mV/5V * 255 * 2 ≈ 2  (arredondado para 3)
// Fundo   → 1.99V/5V * 255 * 2 ≈ 204 (freio), 194 (acel), 193 (embr)
const int PWM_REPOUSO = 3;
const int PWM_MAX_FREIO = 204;
const int PWM_MAX_ACEL  = 194;
const int PWM_MAX_EMBR  = 193;

// ── Filtro de média móvel (suaviza ruído elétrico) ───────────
const int AMOSTRAS = 8;
long bufFreio[AMOSTRAS], bufAcel[AMOSTRAS], bufEmbr[AMOSTRAS];
int idxBuf = 0;

// ── Modo de calibração ───────────────────────────────────────
// Coloque #define CALIBRACAO para ativar o modo serial
// que imprime os valores brutos — use para ajustar offsets
// e carga máxima. Retire o define para uso normal.
#define CALIBRACAO

// ============================================================
void setup() {
  Serial.begin(115200);

  // Configura Timer1 para PWM de alta frequência (~62kHz)
  // nos pinos 9 e 10. Isso reduz o ripple no filtro RC.
  TCCR1A = _BV(COM1A1) | _BV(COM1B1) | _BV(WGM10);
  TCCR1B = _BV(CS10);  // sem prescaler → ~62kHz

  // Pino 11 (Timer2) — frequência padrão ~31kHz com prescaler 1
  TCCR2B = (TCCR2B & 0b11111000) | 0x01;

  // Inicializa HX711
  scFreio.begin(FREIO_DT, FREIO_SCK);
  scAcel.begin(ACEL_DT,   ACEL_SCK);
  scEmbr.begin(EMBR_DT,   EMBR_SCK);

  // Aguarda os módulos estabilizarem
  while (!scFreio.is_ready() || !scAcel.is_ready() || !scEmbr.is_ready()) {
    Serial.println("Aguardando HX711...");
    delay(100);
  }

  // Aplica o fator de escala
  scFreio.set_scale(FATOR_CALIBRACAO);
  scAcel.set_scale(FATOR_CALIBRACAO);
  scEmbr.set_scale(FATOR_CALIBRACAO);

  // Zera na posição de repouso — pedais devem estar soltos aqui
  Serial.println("Zerando pedais... mantenha todos soltos.");
  delay(2000);
  scFreio.tare();
  scAcel.tare();
  scEmbr.tare();

  // Captura offset bruto para logging
  OFFSET_FREIO = scFreio.get_offset();
  OFFSET_ACEL  = scAcel.get_offset();
  OFFSET_EMBR  = scEmbr.get_offset();

  // Inicializa buffer de média
  memset(bufFreio, 0, sizeof(bufFreio));
  memset(bufAcel,  0, sizeof(bufAcel));
  memset(bufEmbr,  0, sizeof(bufEmbr));

  // Saída em repouso imediata
  analogWrite(PWM_FREIO, PWM_REPOUSO);
  analogWrite(PWM_ACEL,  PWM_REPOUSO);
  analogWrite(PWM_EMBR,  PWM_REPOUSO);

  Serial.println("Sistema pronto.");

#ifdef CALIBRACAO
  Serial.println("== MODO CALIBRACAO ATIVO ==");
  Serial.println("Pressione cada pedal ao fundo e anote os valores brutos.");
  Serial.println("Use esses valores em CARGA_MAX_xxx");
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
  // Garante que nunca vai abaixo de zero
  if (leitura < 0) leitura = 0;
  if (leitura > cargaMax) leitura = cargaMax;
  // Mapeia linearmente da faixa de carga para a faixa PWM
  return map(leitura, 0, cargaMax, PWM_REPOUSO, pwmMax);
}

// ============================================================
void loop() {
  // Leitura bruta dos três canais
  long brutoFreio = 0, brutoAcel = 0, brutoEmbr = 0;

  if (scFreio.is_ready()) brutoFreio = scFreio.get_units();
  if (scAcel.is_ready())  brutoAcel  = scAcel.get_units();
  if (scEmbr.is_ready())  brutoEmbr  = scEmbr.get_units();

  // Aplica média móvel
  long filtFreio = mediaMovel(bufFreio, brutoFreio);
  long filtAcel  = mediaMovel(bufAcel,  brutoAcel);
  long filtEmbr  = mediaMovel(bufEmbr,  brutoEmbr);
  idxBuf = (idxBuf + 1) % AMOSTRAS;

  // Calcula PWM proporcional para cada pedal
  int pwmFreio = calcPWM(filtFreio, CARGA_MAX_FREIO, PWM_MAX_FREIO);
  int pwmAcel  = calcPWM(filtAcel,  CARGA_MAX_ACEL,  PWM_MAX_ACEL);
  int pwmEmbr  = calcPWM(filtEmbr,  CARGA_MAX_EMBR,  PWM_MAX_EMBR);

  // Escreve nas saídas PWM
  analogWrite(PWM_FREIO, pwmFreio);
  analogWrite(PWM_ACEL,  pwmAcel);
  analogWrite(PWM_EMBR,  pwmEmbr);

// #ifdef CALIBRACAO
//   // Imprime dados para calibração via Serial Monitor
//   Serial.print("FREIO bruto:");  Serial.print(brutoFreio);
//   Serial.print(" filt:");        Serial.print(filtFreio);
//   Serial.print(" pwm:");         Serial.print(pwmFreio);
//   Serial.print(" | ACEL bruto:"); Serial.print(brutoAcel);
//   Serial.print(" filt:");        Serial.print(filtAcel);
//   Serial.print(" pwm:");         Serial.print(pwmAcel);
//   Serial.print(" | EMBR bruto:"); Serial.print(brutoEmbr);
//   Serial.print(" filt:");        Serial.print(filtEmbr);
//   Serial.print(" pwm:");         Serial.println(pwmEmbr);
// #endif


#ifdef CALIBRACAO

  static long ultimoBrutoFreio = 0;
  static long ultimoBrutoAcel  = 0;
  static long ultimoBrutoEmbr  = 0;

if (abs(brutoFreio - ultimoBrutoFreio) > 5 ||
    abs(brutoAcel  - ultimoBrutoAcel)  > 5 ||
    abs(brutoEmbr  - ultimoBrutoEmbr)  > 5)
  {
    Serial.print("FREIO bruto:");   Serial.print(brutoFreio);
    Serial.print(" filt:");         Serial.print(filtFreio);
    Serial.print(" pwm:");          Serial.print(pwmFreio);

    Serial.print(" | ACEL bruto:"); Serial.print(brutoAcel);
    Serial.print(" filt:");         Serial.print(filtAcel);
    Serial.print(" pwm:");          Serial.print(pwmAcel);

    Serial.print(" | EMBR bruto:"); Serial.print(brutoEmbr);
    Serial.print(" filt:");         Serial.print(filtEmbr);
    Serial.print(" pwm:");          Serial.println(pwmEmbr);

    ultimoBrutoFreio = brutoFreio;
    ultimoBrutoAcel  = brutoAcel;
    ultimoBrutoEmbr  = brutoEmbr;
  }

#endif


  delay(5); // ~200Hz de atualização — mais que suficiente para pedais
}
