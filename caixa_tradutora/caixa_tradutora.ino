// ============================================================
//  CAIXA TRADUTORA — Sim Ruito (Célula de Carga) → PXN → PS5
//  Hardware: Arduino Nano + 3x HX711
//  Saída: PWM → Filtro RC → Divisor de tensão → RJ45 PXN
// ============================================================

#include "HX711.h"
#include <EEPROM.h>

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

// Botao entre o pino 8 e GND. Usa pull-up interno do Arduino.
#define PINO_BOTAO_CALIB 8

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

long maxAprendidoFreio = 0;
long maxAprendidoAcel  = 0;
long maxAprendidoEmbr  = 0;

// Ajuste do maximo salvo por pedal:
// 100 = maximo aprendido vira 100%.
// Maior que 100 = demora mais para chegar em 100%.
// Menor que 100 = chega em 100% antes, sem esmagar tanto.
const int AJUSTE_MAX_FREIO_PERCENT = 100;
const int AJUSTE_MAX_ACEL_PERCENT  = 100;
const int AJUSTE_MAX_EMBR_PERCENT  = 100;

// ── PWM alvo (calculado dos valores medidos na bancada) ──────
const int PWM_REPOUSO   = 3;
const int PWM_MAX_FREIO = 204;
const int PWM_MAX_ACEL  = 194;
const int PWM_MAX_EMBR  = 193;

// Zona morta em contagens brutas do HX711.
// Valores pequenos perto de zero sao ruido normal, principalmente com entrada desconectada.
const long ZONA_MORTA_FREIO = 2000;
const long ZONA_MORTA_ACEL  = 2000;
const long ZONA_MORTA_EMBR  = 2000;

// ── Filtro de média móvel ────────────────────────────────────
const int AMOSTRAS = 4;
long bufFreio[AMOSTRAS], bufAcel[AMOSTRAS], bufEmbr[AMOSTRAS];
int idxFreio = 0, idxAcel = 0, idxEmbr = 0;

// ── Modo de calibração ───────────────────────────────────────
// Deixe ativo para ver os valores brutos e calibrar CARGA_MAX
// Retire o define quando estiver calibrado
#define CALIBRACAO

// ── Flags do log serial ──────────────────────────────────────
// Ligue/desligue conforme o que quiser enxergar no Serial Monitor.
const bool LOG_BRUTO = false;
const bool LOG_FILT  = false;
const bool LOG_UTIL  = false;
const bool LOG_PCT   = true;
const bool LOG_PWM   = true;

// Tolerancia para considerar que valores HX711 mudaram de verdade.
const long LOG_DELTA_HX711 = 100;

const unsigned long TEMPO_SEGURAR_SALVAR_MS = 3000;
const unsigned long DEBOUNCE_BOTAO_MS = 40;

const unsigned long EEPROM_ASSINATURA = 0xC4112026;
const int EEPROM_VERSAO = 1;

struct DadosCalibracao {
  unsigned long assinatura;
  int versao;
  long maxFreio;
  long maxAcel;
  long maxEmbr;
};

// ============================================================
long ajustaMaximo(long valor, int ajustePercent) {
  long ajustado = (valor * ajustePercent) / 100;
  if (ajustado < 1) ajustado = 1;
  return ajustado;
}

// ============================================================
void carregarCalibracao() {
  DadosCalibracao dados;
  EEPROM.get(0, dados);

  if (dados.assinatura == EEPROM_ASSINATURA &&
      dados.versao == EEPROM_VERSAO &&
      dados.maxFreio > ZONA_MORTA_FREIO &&
      dados.maxAcel  > ZONA_MORTA_ACEL &&
      dados.maxEmbr  > ZONA_MORTA_EMBR)
  {
    CARGA_MAX_FREIO = dados.maxFreio;
    CARGA_MAX_ACEL  = dados.maxAcel;
    CARGA_MAX_EMBR  = dados.maxEmbr;
    Serial.println("Calibracao carregada da EEPROM.");
  } else {
    Serial.println("Sem calibracao valida na EEPROM. Usando valores padrao.");
  }
}

// ============================================================
void salvarCalibracao() {
  bool atualizou = false;

  if (maxAprendidoFreio > ZONA_MORTA_FREIO) {
    CARGA_MAX_FREIO = ajustaMaximo(maxAprendidoFreio, AJUSTE_MAX_FREIO_PERCENT);
    atualizou = true;
  }
  if (maxAprendidoAcel > ZONA_MORTA_ACEL) {
    CARGA_MAX_ACEL = ajustaMaximo(maxAprendidoAcel, AJUSTE_MAX_ACEL_PERCENT);
    atualizou = true;
  }
  if (maxAprendidoEmbr > ZONA_MORTA_EMBR) {
    CARGA_MAX_EMBR = ajustaMaximo(maxAprendidoEmbr, AJUSTE_MAX_EMBR_PERCENT);
    atualizou = true;
  }

  if (!atualizou) {
    Serial.println("Nada para salvar: nenhum pedal passou da zona morta.");
    return;
  }

  DadosCalibracao dados = {
    EEPROM_ASSINATURA,
    EEPROM_VERSAO,
    CARGA_MAX_FREIO,
    CARGA_MAX_ACEL,
    CARGA_MAX_EMBR
  };

  EEPROM.put(0, dados);
  Serial.print("Calibracao salva. Maximos: FREIO ");
  Serial.print(CARGA_MAX_FREIO);
  Serial.print(" | ACEL ");
  Serial.print(CARGA_MAX_ACEL);
  Serial.print(" | EMBR ");
  Serial.println(CARGA_MAX_EMBR);
}

// ============================================================
void setup() {
  Serial.begin(115200);
  pinMode(PINO_BOTAO_CALIB, INPUT_PULLUP);
  carregarCalibracao();

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
  Serial.println("Use as flags LOG_BRUTO, LOG_FILT, LOG_UTIL, LOG_PCT e LOG_PWM para escolher o log.");
  if (LOG_BRUTO) {
    Serial.println("Aperte cada pedal ao fundo e anote o maior valor BRUTO.");
    Serial.println("Cole esses valores em CARGA_MAX_xxx e retire o #define CALIBRACAO.");
  }
#endif
}

// ============================================================
long mediaMovel(long* buf, int* idx, long novoValor) {
  buf[*idx] = novoValor;
  *idx = (*idx + 1) % AMOSTRAS;

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
int calcPct(long leitura, long cargaMax) {
  if (leitura < 0) leitura = 0;
  if (leitura > cargaMax) leitura = cargaMax;
  return map(leitura, 0, cargaMax, 0, 100);
}

// ============================================================
long aplicaZonaMorta(long leitura, long zonaMorta) {
  if (abs(leitura) <= zonaMorta) return 0;
  if (leitura < 0) return 0;
  return leitura;
}

// ============================================================
bool mudouLong(long atual, long anterior, long deltaMinimo) {
  return abs(atual - anterior) >= deltaMinimo;
}

// ============================================================
void aprendeMaximos(long utilFreio, long utilAcel, long utilEmbr) {
  if (utilFreio > maxAprendidoFreio) maxAprendidoFreio = utilFreio;
  if (utilAcel  > maxAprendidoAcel)  maxAprendidoAcel  = utilAcel;
  if (utilEmbr  > maxAprendidoEmbr)  maxAprendidoEmbr  = utilEmbr;
}

// ============================================================
void trataBotaoCalibracao() {
  static bool leituraAnterior = false;
  static bool botaoPressionado = false;
  static bool salvouNesteAperto = false;
  static unsigned long ultimaMudanca = 0;
  static unsigned long inicioPressionado = 0;

  unsigned long agora = millis();
  bool leituraAtual = digitalRead(PINO_BOTAO_CALIB) == LOW;

  if (leituraAtual != leituraAnterior) {
    leituraAnterior = leituraAtual;
    ultimaMudanca = agora;
  }

  if ((agora - ultimaMudanca) < DEBOUNCE_BOTAO_MS) return;

  if (leituraAtual != botaoPressionado) {
    botaoPressionado = leituraAtual;
    if (botaoPressionado) {
      inicioPressionado = agora;
      salvouNesteAperto = false;
      Serial.println("Segure o botao por 3s para salvar a calibracao.");
    }
  }

  if (botaoPressionado &&
      !salvouNesteAperto &&
      (agora - inicioPressionado) >= TEMPO_SEGURAR_SALVAR_MS)
  {
    salvarCalibracao();
    salvouNesteAperto = true;
  }
}

// ============================================================
void loop() {
  static long brutoFreio = 0, brutoAcel = 0, brutoEmbr = 0;
  static long filtFreio = 0, filtAcel = 0, filtEmbr = 0;

  // Cada HX711 atualiza em seu proprio ritmo. Quando nao ha amostra nova,
  // mantemos a ultima leitura e nao repetimos valor dentro do filtro.
  if (scFreio.is_ready()) {
    brutoFreio = scFreio.read_average(1) - scFreio.get_offset();
    filtFreio = mediaMovel(bufFreio, &idxFreio, brutoFreio);
  }
  if (scAcel.is_ready()) {
    brutoAcel = scAcel.read_average(1) - scAcel.get_offset();
    filtAcel = mediaMovel(bufAcel, &idxAcel, brutoAcel);
  }
  if (scEmbr.is_ready()) {
    brutoEmbr = scEmbr.read_average(1) - scEmbr.get_offset();
    filtEmbr = mediaMovel(bufEmbr, &idxEmbr, brutoEmbr);
  }

  long utilFreio = aplicaZonaMorta(filtFreio, ZONA_MORTA_FREIO);
  long utilAcel  = aplicaZonaMorta(filtAcel,  ZONA_MORTA_ACEL);
  long utilEmbr  = aplicaZonaMorta(filtEmbr,  ZONA_MORTA_EMBR);
  aprendeMaximos(utilFreio, utilAcel, utilEmbr);

  // PWM proporcional
  int pwmFreio = calcPWM(utilFreio, CARGA_MAX_FREIO, PWM_MAX_FREIO);
  int pwmAcel  = calcPWM(utilAcel,  CARGA_MAX_ACEL,  PWM_MAX_ACEL);
  int pwmEmbr  = calcPWM(utilEmbr,  CARGA_MAX_EMBR,  PWM_MAX_EMBR);
  int pctFreio = calcPct(utilFreio, CARGA_MAX_FREIO);
  int pctAcel  = calcPct(utilAcel,  CARGA_MAX_ACEL);
  int pctEmbr  = calcPct(utilEmbr,  CARGA_MAX_EMBR);

  analogWrite(PWM_FREIO, pwmFreio);
  analogWrite(PWM_ACEL,  pwmAcel);
  analogWrite(PWM_EMBR,  pwmEmbr);
  trataBotaoCalibracao();

#ifdef CALIBRACAO
  static bool primeiroLog = true;
  static long ultBrutoFreio = 0, ultBrutoAcel = 0, ultBrutoEmbr = 0;
  static long ultFiltFreio = 0, ultFiltAcel = 0, ultFiltEmbr = 0;
  static long ultUtilFreio = 0, ultUtilAcel = 0, ultUtilEmbr = 0;
  static int ultPctFreio = 0, ultPctAcel = 0, ultPctEmbr = 0;
  static int ultPwmFreio = 0, ultPwmAcel = 0, ultPwmEmbr = 0;

  bool houveMudanca = primeiroLog;
  if (LOG_BRUTO) {
    houveMudanca |= mudouLong(brutoFreio, ultBrutoFreio, LOG_DELTA_HX711);
    houveMudanca |= mudouLong(brutoAcel,  ultBrutoAcel,  LOG_DELTA_HX711);
    houveMudanca |= mudouLong(brutoEmbr,  ultBrutoEmbr,  LOG_DELTA_HX711);
  }
  if (LOG_FILT) {
    houveMudanca |= mudouLong(filtFreio, ultFiltFreio, LOG_DELTA_HX711);
    houveMudanca |= mudouLong(filtAcel,  ultFiltAcel,  LOG_DELTA_HX711);
    houveMudanca |= mudouLong(filtEmbr,  ultFiltEmbr,  LOG_DELTA_HX711);
  }
  if (LOG_UTIL) {
    houveMudanca |= mudouLong(utilFreio, ultUtilFreio, LOG_DELTA_HX711);
    houveMudanca |= mudouLong(utilAcel,  ultUtilAcel,  LOG_DELTA_HX711);
    houveMudanca |= mudouLong(utilEmbr,  ultUtilEmbr,  LOG_DELTA_HX711);
  }
  if (LOG_PCT) {
    houveMudanca |= pctFreio != ultPctFreio;
    houveMudanca |= pctAcel  != ultPctAcel;
    houveMudanca |= pctEmbr  != ultPctEmbr;
  }
  if (LOG_PWM) {
    houveMudanca |= pwmFreio != ultPwmFreio;
    houveMudanca |= pwmAcel  != ultPwmAcel;
    houveMudanca |= pwmEmbr  != ultPwmEmbr;
  }

  if (houveMudanca) {
    Serial.print("FREIO");
    if (LOG_BRUTO) { Serial.print(" bruto:"); Serial.print(brutoFreio); }
    if (LOG_FILT)  { Serial.print(" filt:");  Serial.print(filtFreio); }
    if (LOG_UTIL)  { Serial.print(" util:");  Serial.print(utilFreio); }
    if (LOG_PCT)   { Serial.print(" pct:");   Serial.print(pctFreio); }
    if (LOG_PWM)   { Serial.print(" pwm:");   Serial.print(pwmFreio); }

    Serial.print(" | ACEL");
    if (LOG_BRUTO) { Serial.print(" bruto:"); Serial.print(brutoAcel); }
    if (LOG_FILT)  { Serial.print(" filt:");  Serial.print(filtAcel); }
    if (LOG_UTIL)  { Serial.print(" util:");  Serial.print(utilAcel); }
    if (LOG_PCT)   { Serial.print(" pct:");   Serial.print(pctAcel); }
    if (LOG_PWM)   { Serial.print(" pwm:");   Serial.print(pwmAcel); }

    Serial.print(" | EMBR");
    if (LOG_BRUTO) { Serial.print(" bruto:"); Serial.print(brutoEmbr); }
    if (LOG_FILT)  { Serial.print(" filt:");  Serial.print(filtEmbr); }
    if (LOG_UTIL)  { Serial.print(" util:");  Serial.print(utilEmbr); }
    if (LOG_PCT)   { Serial.print(" pct:");   Serial.print(pctEmbr); }
    if (LOG_PWM)   { Serial.print(" pwm:");   Serial.print(pwmEmbr); }
    Serial.println();

    primeiroLog = false;
    ultBrutoFreio = brutoFreio;
    ultBrutoAcel  = brutoAcel;
    ultBrutoEmbr  = brutoEmbr;
    ultFiltFreio = filtFreio;
    ultFiltAcel  = filtAcel;
    ultFiltEmbr  = filtEmbr;
    ultUtilFreio = utilFreio;
    ultUtilAcel  = utilAcel;
    ultUtilEmbr  = utilEmbr;
    ultPctFreio = pctFreio;
    ultPctAcel  = pctAcel;
    ultPctEmbr  = pctEmbr;
    ultPwmFreio = pwmFreio;
    ultPwmAcel  = pwmAcel;
    ultPwmEmbr  = pwmEmbr;
  }
#endif

  delay(5);
}
