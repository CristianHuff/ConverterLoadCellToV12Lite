# Firmware Arduino

Arquivo principal: `caixa_tradutora/caixa_tradutora.ino`.

## Responsabilidades

O firmware faz quatro coisas principais:

1. Le os tres HX711 em valores brutos.
2. Aplica tare, zona morta, filtro opcional e calibracao.
3. Converte cada pedal para percentual e PWM.
4. Gera PWM em alta frequencia para o filtro RC/divisor enviar tensao analogica para a PXN.

## Pinos

| Funcao | Pino Arduino |
|--------|--------------|
| HX711 freio DATA/SCK | D2 / D3 |
| HX711 acelerador DATA/SCK | D4 / D5 |
| HX711 embreagem DATA/SCK | D6 / D7 |
| Botao calibracao | D8 para GND |
| PWM freio | D9 |
| PWM acelerador | D10 |
| PWM embreagem | D11 |
| LED status | D12 via resistor para GND |

## PWM

O PWM padrao do Arduino e lento para esta aplicacao. O firmware altera os timers:

| Pino | Timer | Frequencia aproximada |
|------|-------|-----------------------|
| D9 / D10 | Timer1 | ~62 kHz |
| D11 | Timer2 | ~31 kHz |

Isso reduz ripple audivel/visivel depois do filtro RC.

## Calibracao em EEPROM

A estrutura `DadosCalibracao` salva os maximos dos tres pedais na EEPROM com assinatura e versao:

- `EEPROM_ASSINATURA`
- `EEPROM_VERSAO`
- `maxFreio`
- `maxAcel`
- `maxEmbr`

Na inicializacao, se os dados forem validos e acima dos minimos plausiveis, o firmware usa esses valores. Caso contrario, usa os valores padrao no codigo.

## LED de Status

O LED de status fica no D12 e usa piscadas nao bloqueantes:

| Evento | Padrao |
|--------|--------|
| Limpar maximos aprendidos | 1 piscada |
| Salvar calibracao na EEPROM | 3 piscadas |

Ligacao recomendada:

```text
D12 -> resistor 220 ohm a 1 k -> anodo LED
catodo LED -> GND
```

## Ajuste de Maximo

Os parametros abaixo aplicam margem ao maximo aprendido:

```cpp
const int AJUSTE_MAX_FREIO_PERCENT = 90;
const int AJUSTE_MAX_ACEL_PERCENT  = 95;
const int AJUSTE_MAX_EMBR_PERCENT  = 95;
```

Interpretacao:

- `100`: usa o maximo aprendido como 100%.
- menor que `100`: chega em 100% antes.
- maior que `100`: exige mais curso/forca para chegar em 100%.

## Zona Morta

As zonas mortas atuais:

```cpp
const long ZONA_MORTA_FREIO = 40000;
const long ZONA_MORTA_ACEL  = 100;
const long ZONA_MORTA_EMBR  = 500;
```

O freio usa zona maior para permitir descanso do pe sem acionar freio no jogo.

## Filtro Digital

O firmware permite ativar/desativar media movel por pedal:

```cpp
const int AMOSTRAS = 2;
const bool FILTRO_FREIO = true;
const bool FILTRO_ACEL  = false;
const bool FILTRO_EMBR  = true;
```

O acelerador esta sem filtro digital para manter resposta rapida.

## Protecao de Queda do Acelerador

Ha uma protecao contra dropout curto no acelerador:

```cpp
const bool PROTECAO_QUEDA_ACEL = true;
const byte CONFIRMACOES_QUEDA_ACEL = 3;
```

Ela segura poucas leituras impossiveis quando o acelerador estava alto e cai subitamente. Se a queda persistir, o firmware aceita a queda para nao deixar o acelerador "preso".

Quando `LOG_PROT_ACEL` esta ativo, o log mostra `raw:<valor> prot:1` quando a protecao atuou.

## Logs

Flags principais:

```cpp
const bool LOG_BRUTO = false;
const bool LOG_FILT  = false;
const bool LOG_UTIL  = true;
const bool LOG_PCT   = true;
const bool LOG_OUT   = true;
const bool LOG_PWM   = true;
const bool LOG_PROT_ACEL = true;
```

Campos:

| Campo | Significado |
|-------|-------------|
| `bruto` | Leitura crua/tarada do HX711 |
| `filt` | Valor apos filtro digital |
| `util` | Valor apos zona morta/protecao |
| `pct` | Percentual antes da curva |
| `out` | Percentual depois da curva |
| `pwm` | Valor enviado ao `analogWrite` |
| `raw/prot` | Queda do acelerador segurada pela protecao |

## Modo de Teste da Saida

O firmware inclui um teste para separar problema de leitura de problema de saida analogica:

```cpp
const bool TESTE_SAIDA_ACEL = false;
const bool TESTE_SAIDA_ACEL_DEGRAUS = true;
```

Quando `TESTE_SAIDA_ACEL` e `true`, o acelerador ignora o HX711 e gera degraus/rampa direto no PWM D10.

Use este modo para verificar se a PXN enxerga o sinal sem depender da celula de carga.
