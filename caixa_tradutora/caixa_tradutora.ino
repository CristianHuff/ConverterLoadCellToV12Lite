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
const int AJUSTE_MAX_FREIO_PERCENT = 90;
const int AJUSTE_MAX_ACEL_PERCENT  = 95;
const int AJUSTE_MAX_EMBR_PERCENT  = 95;

// ── PWM alvo (calculado dos valores medidos na bancada) ──────
const int PWM_REPOUSO   = 3;
const int PWM_MAX_FREIO = 204;
const int PWM_MAX_ACEL  = 194;
const int PWM_MAX_EMBR  = 193;

// Curva de resposta por pedal:
// 0 = linear.
// Positivo = mais resposta no inicio/meio do curso.
// Negativo = resposta mais suave no inicio/meio do curso.
const int CURVA_FREIO_PERCENT = 0;
const int CURVA_ACEL_PERCENT  = 0;
const int CURVA_EMBR_PERCENT  = 0;

// Zona morta em contagens brutas do HX711.
// Valores pequenos perto de zero sao ruido normal, principalmente com entrada desconectada.
const long ZONA_MORTA_FREIO = 40000;
const long ZONA_MORTA_ACEL  = 100;
const long ZONA_MORTA_EMBR  = 500;

// Minimos plausiveis para aceitar uma calibracao salva.
// Evita gravar/usar maximo pequeno por toque acidental.
const long CALIB_MIN_FREIO = 20000;
const long CALIB_MIN_ACEL  = 20000;
const long CALIB_MIN_EMBR  = 20000;

// ── Filtro de média móvel ────────────────────────────────────
const int AMOSTRAS = 2;
const bool FILTRO_FREIO = true;
const bool FILTRO_ACEL  = false;
const bool FILTRO_EMBR  = true;
long bufFreio[AMOSTRAS], bufAcel[AMOSTRAS], bufEmbr[AMOSTRAS];
int idxFreio = 0, idxAcel = 0, idxEmbr = 0;

// Protecao contra dropout eletrico/mecanico no acelerador.
// Ignora poucas leituras impossiveis; aceita a soltada se a queda persistir.
const bool PROTECAO_QUEDA_ACEL = true;
const byte CONFIRMACOES_QUEDA_ACEL = 3;
const int QUEDA_BRUSCA_ACEL_PERCENT = 35;
const int ACEL_MIN_PROTECAO_PERCENT = 20;

// ── Modo de calibração ───────────────────────────────────────
// Deixe ativo para ver os valores brutos e calibrar CARGA_MAX
// Retire o define quando estiver calibrado
#define CALIBRACAO

// ── Flags do log serial ──────────────────────────────────────
// Ligue/desligue conforme o que quiser enxergar no Serial Monitor.
const bool LOG_BRUTO = false;
const bool LOG_FILT  = false;
const bool LOG_UTIL  = true;
const bool LOG_PCT   = true;
const bool LOG_OUT   = true;
const bool LOG_PWM   = true;
const bool LOG_PROT_ACEL = true;

// Teste eletrico da saida para a base.
// Deixe true para ignorar o HX711 do acelerador e gerar uma rampa no PWM_ACEL.
const bool TESTE_SAIDA_ACEL = false;
const unsigned long TESTE_SAIDA_PERIODO_MS = 10000;
const int PWM_MAX_ACEL_TESTE = 180;
const bool TESTE_SAIDA_ACEL_DEGRAUS = true;
const unsigned long TESTE_SAIDA_DEGRAU_MS = 2500;

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

bool acelProtecaoAtiva = false;
long acelUtilAntesProtecao = 0;

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
      dados.maxFreio > CALIB_MIN_FREIO &&
      dados.maxAcel  > CALIB_MIN_ACEL &&
      dados.maxEmbr  > CALIB_MIN_EMBR)
  {
    CARGA_MAX_FREIO = dados.maxFreio;
    CARGA_MAX_ACEL  = dados.maxAcel;
    CARGA_MAX_EMBR  = dados.maxEmbr;
    Serial.print("Calibracao carregada da EEPROM. Maximos: FREIO ");
    Serial.print(CARGA_MAX_FREIO);
    Serial.print(" | ACEL ");
    Serial.print(CARGA_MAX_ACEL);
    Serial.print(" | EMBR ");
    Serial.println(CARGA_MAX_EMBR);
  } else {
    Serial.println("Sem calibracao valida na EEPROM. Usando valores padrao.");
  }
}

// ============================================================
void salvarCalibracao() {
  bool atualizou = false;

  if (maxAprendidoFreio > CALIB_MIN_FREIO) {
    CARGA_MAX_FREIO = ajustaMaximo(maxAprendidoFreio, AJUSTE_MAX_FREIO_PERCENT);
    atualizou = true;
  }
  if (maxAprendidoAcel > CALIB_MIN_ACEL) {
    CARGA_MAX_ACEL = ajustaMaximo(maxAprendidoAcel, AJUSTE_MAX_ACEL_PERCENT);
    atualizou = true;
  }
  if (maxAprendidoEmbr > CALIB_MIN_EMBR) {
    CARGA_MAX_EMBR = ajustaMaximo(maxAprendidoEmbr, AJUSTE_MAX_EMBR_PERCENT);
    atualizou = true;
  }

  if (!atualizou) {
    Serial.println("Nada para salvar: nenhum pedal passou do minimo plausivel de calibracao.");
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

  // A base pode verificar os pedais logo ao ligar. Coloca repouso na saida
  // antes de esperar HX711/tare, para ela nao enxergar linha morta.
  analogWrite(PWM_FREIO, PWM_REPOUSO);
  analogWrite(PWM_ACEL,  PWM_REPOUSO);
  analogWrite(PWM_EMBR,  PWM_REPOUSO);

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

  Serial.println("Sistema pronto.");

#ifdef CALIBRACAO
  Serial.println("== MODO CALIBRACAO ==");
  Serial.println("Use as flags LOG_BRUTO, LOG_FILT, LOG_UTIL, LOG_PCT, LOG_OUT e LOG_PWM para escolher o log.");
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
int aplicaCurvaPct(int pct, int curvaPercent) {
  if (pct < 0) pct = 0;
  if (pct > 100) pct = 100;

  long ajuste = ((long)pct * (100 - pct) * abs(curvaPercent)) / 10000;
  if (curvaPercent > 0) pct += ajuste;
  if (curvaPercent < 0) pct -= ajuste;

  if (pct < 0) pct = 0;
  if (pct > 100) pct = 100;
  return pct;
}

// ============================================================
int calcPWMDePct(int pct, int pwmMax) {
  if (pct < 0) pct = 0;
  if (pct > 100) pct = 100;
  return map(pct, 0, 100, PWM_REPOUSO, pwmMax);
}

// ============================================================
int pctTesteTriangular(unsigned long periodoMs) {
  unsigned long fase = millis() % periodoMs;
  unsigned long metade = periodoMs / 2;

  if (fase < metade) return map(fase, 0, metade, 0, 100);
  return map(fase - metade, 0, metade, 100, 0);
}

// ============================================================
int pctTesteDegraus(unsigned long tempoDegrauMs) {
  const int degraus[] = {0, 25, 50, 75, 100, 75, 50, 25};
  const byte totalDegraus = sizeof(degraus) / sizeof(degraus[0]);
  byte indice = (millis() / tempoDegrauMs) % totalDegraus;
  return degraus[indice];
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
long protegeQuedaAcel(long utilAcel) {
  static long ultimoAcelAceito = 0;
  static byte leiturasQueda = 0;

  acelProtecaoAtiva = false;
  acelUtilAntesProtecao = utilAcel;

  if (!PROTECAO_QUEDA_ACEL) return utilAcel;

  long quedaMinima = (CARGA_MAX_ACEL * QUEDA_BRUSCA_ACEL_PERCENT) / 100;
  long minimoProtegido = (CARGA_MAX_ACEL * ACEL_MIN_PROTECAO_PERCENT) / 100;
  bool quedaBrusca = ultimoAcelAceito > minimoProtegido &&
                     utilAcel + quedaMinima < ultimoAcelAceito;

  if (quedaBrusca) {
    leiturasQueda++;
    if (leiturasQueda < CONFIRMACOES_QUEDA_ACEL) {
      acelProtecaoAtiva = true;
      return ultimoAcelAceito;
    }
  } else {
    leiturasQueda = 0;
  }

  ultimoAcelAceito = utilAcel;
  return utilAcel;
}

// ============================================================
void aprendeMaximos(long utilFreio, long utilAcel, long utilEmbr) {
  if (utilFreio > maxAprendidoFreio) maxAprendidoFreio = utilFreio;
  if (utilAcel  > maxAprendidoAcel)  maxAprendidoAcel  = utilAcel;
  if (utilEmbr  > maxAprendidoEmbr)  maxAprendidoEmbr  = utilEmbr;
}

// ============================================================
void limpaMaximosAprendidos() {
  maxAprendidoFreio = 0;
  maxAprendidoAcel  = 0;
  maxAprendidoEmbr  = 0;
  Serial.println("Maximos aprendidos limpos. Pise os pedais e segure 3s para salvar.");
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
      Serial.println("Toque curto limpa maximos. Segure 3s para salvar.");
    } else if (!salvouNesteAperto) {
      limpaMaximosAprendidos();
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
    filtFreio = FILTRO_FREIO ? mediaMovel(bufFreio, &idxFreio, brutoFreio) : brutoFreio;
  }
  if (scAcel.is_ready()) {
    brutoAcel = scAcel.read_average(1) - scAcel.get_offset();
    filtAcel = FILTRO_ACEL ? mediaMovel(bufAcel, &idxAcel, brutoAcel) : brutoAcel;
  }
  if (scEmbr.is_ready()) {
    brutoEmbr = scEmbr.read_average(1) - scEmbr.get_offset();
    filtEmbr = FILTRO_EMBR ? mediaMovel(bufEmbr, &idxEmbr, brutoEmbr) : brutoEmbr;
  }

  long utilFreio = aplicaZonaMorta(filtFreio, ZONA_MORTA_FREIO);
  long utilAcel  = aplicaZonaMorta(filtAcel,  ZONA_MORTA_ACEL);
  long utilEmbr  = aplicaZonaMorta(filtEmbr,  ZONA_MORTA_EMBR);
  utilAcel = protegeQuedaAcel(utilAcel);
  aprendeMaximos(utilFreio, utilAcel, utilEmbr);

  int pctFreio = calcPct(utilFreio, CARGA_MAX_FREIO);
  int pctAcel  = calcPct(utilAcel,  CARGA_MAX_ACEL);
  int pctEmbr  = calcPct(utilEmbr,  CARGA_MAX_EMBR);
  int pctFreioCurva = aplicaCurvaPct(pctFreio, CURVA_FREIO_PERCENT);
  int pctAcelCurva  = aplicaCurvaPct(pctAcel,  CURVA_ACEL_PERCENT);
  int pctEmbrCurva  = aplicaCurvaPct(pctEmbr,  CURVA_EMBR_PERCENT);

  // PWM proporcional com curva opcional por pedal.
  int pwmFreio = calcPWMDePct(pctFreioCurva, PWM_MAX_FREIO);
  int pwmAcel  = calcPWMDePct(pctAcelCurva,  PWM_MAX_ACEL);
  int pwmEmbr  = calcPWMDePct(pctEmbrCurva,  PWM_MAX_EMBR);

  if (TESTE_SAIDA_ACEL) {
    if (TESTE_SAIDA_ACEL_DEGRAUS) {
      pctAcel = pctTesteDegraus(TESTE_SAIDA_DEGRAU_MS);
    } else {
      pctAcel = pctTesteTriangular(TESTE_SAIDA_PERIODO_MS);
    }
    pctAcelCurva = pctAcel;
    pwmAcel = calcPWMDePct(pctAcelCurva, PWM_MAX_ACEL_TESTE);
  }

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
  static int ultOutFreio = 0, ultOutAcel = 0, ultOutEmbr = 0;
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
  if (LOG_OUT) {
    houveMudanca |= pctFreioCurva != ultOutFreio;
    houveMudanca |= pctAcelCurva  != ultOutAcel;
    houveMudanca |= pctEmbrCurva  != ultOutEmbr;
  }
  if (LOG_PWM) {
    houveMudanca |= pwmFreio != ultPwmFreio;
    houveMudanca |= pwmAcel  != ultPwmAcel;
    houveMudanca |= pwmEmbr  != ultPwmEmbr;
  }
  if (LOG_PROT_ACEL) {
    houveMudanca |= acelProtecaoAtiva;
  }

  if (houveMudanca) {
    Serial.print("FREIO");
    if (LOG_BRUTO) { Serial.print(" bruto:"); Serial.print(brutoFreio); }
    if (LOG_FILT)  { Serial.print(" filt:");  Serial.print(filtFreio); }
    if (LOG_UTIL)  { Serial.print(" util:");  Serial.print(utilFreio); }
    if (LOG_PCT)   { Serial.print(" pct:");   Serial.print(pctFreio); }
    if (LOG_OUT)   { Serial.print(" out:");   Serial.print(pctFreioCurva); }
    if (LOG_PWM)   { Serial.print(" pwm:");   Serial.print(pwmFreio); }

    Serial.print(" | ACEL");
    if (LOG_BRUTO) { Serial.print(" bruto:"); Serial.print(brutoAcel); }
    if (LOG_FILT)  { Serial.print(" filt:");  Serial.print(filtAcel); }
    if (LOG_UTIL)  { Serial.print(" util:");  Serial.print(utilAcel); }
    if (LOG_PCT)   { Serial.print(" pct:");   Serial.print(pctAcel); }
    if (LOG_OUT)   { Serial.print(" out:");   Serial.print(pctAcelCurva); }
    if (LOG_PWM)   { Serial.print(" pwm:");   Serial.print(pwmAcel); }
    if (LOG_PROT_ACEL && acelProtecaoAtiva) {
      Serial.print(" raw:");
      Serial.print(acelUtilAntesProtecao);
      Serial.print(" prot:1");
    }

    Serial.print(" | EMBR");
    if (LOG_BRUTO) { Serial.print(" bruto:"); Serial.print(brutoEmbr); }
    if (LOG_FILT)  { Serial.print(" filt:");  Serial.print(filtEmbr); }
    if (LOG_UTIL)  { Serial.print(" util:");  Serial.print(utilEmbr); }
    if (LOG_PCT)   { Serial.print(" pct:");   Serial.print(pctEmbr); }
    if (LOG_OUT)   { Serial.print(" out:");   Serial.print(pctEmbrCurva); }
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
    ultOutFreio = pctFreioCurva;
    ultOutAcel  = pctAcelCurva;
    ultOutEmbr  = pctEmbrCurva;
    ultPwmFreio = pwmFreio;
    ultPwmAcel  = pwmAcel;
    ultPwmEmbr  = pwmEmbr;
  }
#endif

  delay(0);
}
