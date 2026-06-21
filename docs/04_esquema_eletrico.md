# Esquema Eletrico

## Visao Geral por Canal

Cada pedal segue o mesmo caminho de sinal:

```text
Celula de carga
     |
  HX711
     | (dado digital)
  Arduino Nano
     | (PWM ~62kHz)
  Filtro RC
     | (tensao analogica suavizada)
  Divisor de tensao
     | (escala 5V -> max ~2,5V teorico)
  Pino RJ45 PXN
```

## Circuito por Canal (detalhado)

```text
Arduino PWM (D9 / D10 / D11)
        |
       1k
        |
      No A ---- 10k ---- No B ---- RJ45 sinal
        |                  |
      470nF              10k
        |                  |
       GND                GND
```

No A e o ponto filtrado do PWM. No B e a saida ja dividida para a PXN.

## Componentes do Filtro RC

| Componente | Valor | Funcao |
|-----------|-------|--------|
| R serie | 1 k | Limita corrente + parte do filtro RC |
| C | 470 nF (codigo 474) | Suaviza o PWM em tensao DC |
| Frequencia de corte | ~338 Hz | fc = 1/(2pi x 1k x 470nF) |

## Componentes do Divisor de Tensao

| Componente | Valor | Funcao |
|-----------|-------|--------|
| R1 | 10 k | Resistor superior do divisor |
| R2 | 10 k | Resistor inferior do divisor |
| Razao | /2 | Saida = Entrada x R2/(R1+R2) = 0,5 |
| Tensao max saida | ~2,5 V teorico | Com PWM = 255 e 5V de alimentacao |

## Por que dividir por 2?

O PXN original medido trabalha perto de 0 V a 2 V nos pinos de sinal. O Arduino PWM vai ate 5 V. O divisor 1:1 reduz a saida para metade. No firmware, os valores maximos de PWM ficam abaixo de 255, entao a saida real medida fica perto da faixa original da PXN.

## Pinos Arduino Nano

| Pino | Funcao |
|------|--------|
| D2 | HX711 Freio - DATA |
| D3 | HX711 Freio - CLOCK |
| D4 | HX711 Acelerador - DATA |
| D5 | HX711 Acelerador - CLOCK |
| D6 | HX711 Embreagem - DATA |
| D7 | HX711 Embreagem - CLOCK |
| D9 | PWM Freio (Timer1, ~62kHz) |
| D10 | PWM Acelerador (Timer1, ~62kHz) |
| D11 | PWM Embreagem (Timer2, ~31kHz) |
| D8 | Botao de calibracao para GND |
| 5V | Alimentacao HX711 (VCC) |
| GND | GND comum |

## Configuracao de Timer (alta frequencia)

PWM padrao do Arduino (~490 Hz) deixa ripple residual audivel no filtro RC. A configuracao abaixo eleva para ~62kHz, eliminando o problema:

```cpp
// Timer1 -> pinos 9 e 10 -> ~62kHz
TCCR1A = _BV(COM1A1) | _BV(COM1B1) | _BV(WGM10);
TCCR1B = _BV(CS10);  // sem prescaler

// Timer2 -> pino 11 -> ~31kHz
TCCR2B = (TCCR2B & 0b11111000) | 0x01;
```

## Conexao RJ45 -> PXN

| Sinal | Pino RJ45 |
|-------|-----------|
| Sinal Freio | 4 |
| Sinal Acelerador | 6 |
| Sinal Embreagem | 1 |
| GND | 2, 3 e 5 |

## Alimentacao e GND

O Arduino Nano e alimentado via USB. Nos testes, todos os GND relevantes foram conectados em comum, incluindo GND do Arduino, E- dos HX711 e GND/retorno da PXN (RJ45 pinos 2, 3 e 5).

Em protoboard, problemas de referencia podem aparecer quando Arduino e base estao em hubs/fontes diferentes. A conexao do pino 2 do RJ45 ao GND comum corrigiu um problema de reconhecimento da base no prototipo.

## Recomendacoes para a placa final

- Colocar 100 nF perto de cada HX711 entre VCC e GND.
- Colocar 10 uF a 100 uF no barramento 5 V/GND.
- Manter os filtros RC perto da saida para o RJ45.
- Manter GND do capacitor do filtro curto e ligado ao mesmo retorno usado pela PXN.
- Evitar passar trilhas PWM paralelas aos sinais analogicos para a PXN.
- Para maior robustez, considerar dois estagios RC ou um DAC externo em vez de PWM filtrado.

## Diagrama de Modularidade

```text
                    +-------------+
    USB Hub PC -----| Arduino Nano|----- USB -> PC (SimHub)
                    |             |
    HX711 Freio --->| D2/D3   D9  |--> Filtro RC -> Divisor -> RJ45 pino 4
    HX711 Acel  --->| D4/D5   D10 |--> Filtro RC -> Divisor -> RJ45 pino 6
    HX711 Embr  --->| D6/D7   D11 |--> Filtro RC -> Divisor -> RJ45 pino 1
                    +-------------+
                                              RJ45 -> Base PXN -> USB -> PS5
```
