# Testes e Diagnostico

Este arquivo registra os testes feitos durante o prototipo e como repetir a investigacao.

## Problemas Encontrados

### GND da PXN

Sintoma:

- base reconhecia a caixa em um hub USB, mas falhava em outro.

Descoberta:

- o pino 2 do RJ45 tambem funciona como GND/retorno na base testada.

Correcao:

- ligar RJ45 pinos 2, 3 e 5 ao GND comum.

### Ruido com Pedal Desconectado

Sintoma:

- HX711 gerava leituras mesmo com pedal/freio desconectado.

Interpretacao:

- entrada de HX711 flutuante gera ruido.

Correcao:

- usar zona morta;
- evitar deixar entradas soltas;
- melhorar cabeamento e GND.

### Acelerador Cortando

Foram testadas duas hipoteses:

1. queda real na leitura HX711;
2. problema na saida analogica para a PXN.

Ferramentas usadas:

- log serial com `util`, `pct`, `out`, `pwm`;
- protecao `PROTECAO_QUEDA_ACEL`;
- modo `TESTE_SAIDA_ACEL`;
- multimetro em max/min no RJ45 pino 6.

Conclusoes temporarias:

- a saida do acelerador foi vista pela base em rampa/degraus;
- tensao maxima no RJ45 pino 6 ficou proxima de `1,9 V`;
- o corte ficou intermitente e nao foi reproduzido de forma confiavel;
- a montagem em protoboard continua sendo suspeita forte.

## Modo de Teste da Saida

No firmware:

```cpp
const bool TESTE_SAIDA_ACEL = true;
```

Com `TESTE_SAIDA_ACEL_DEGRAUS = true`, o Arduino gera:

```text
0% -> 25% -> 50% -> 75% -> 100% -> 75% -> 50% -> 25%
```

Esse teste ignora o HX711 do acelerador. Se a base nao acompanha esses degraus, o problema esta na saida analogica, RJ45, GND ou entrada da PXN.

Depois do teste, volte:

```cpp
const bool TESTE_SAIDA_ACEL = false;
```

## Teste com Multimetro

Medir no RJ45:

```text
Ponta positiva: pino 6 (acelerador)
Ponta negativa: GND da base (pino 2, 3 ou 5)
```

Valores esperados:

| Condicao | Tensao aproximada |
|----------|-------------------|
| Repouso | perto de 0 V |
| Acelerador fundo | ate ~1,9 V |

Se o jogo cortar:

- se `pwm` no log continua alto e a tensao cai, problema esta no circuito de saida;
- se `pwm` cai e a tensao cai, problema vem da leitura/calibracao/firmware;
- se `pwm` e tensao continuam altos, suspeitar da base PXN/jogo/referencia.

## Bass Shakers e Fonte

Bass shakers, modulos de som automotivo e fonte chaveada podem introduzir ruido pelo USB, GND ou ambiente eletrico.

Recomendacoes:

- separar cabos de potencia dos cabos das celulas de carga;
- evitar passar sinais `A+`/`A-` perto de fios de alto consumo;
- usar GND comum bem definido;
- adicionar capacitores de desacoplamento nos HX711 e barramento.

## Sem Osciloscopio

O multimetro nao mostra bem picos rapidos ou ripple de PWM. Sem osciloscopio, os melhores testes sao:

- modo de degraus;
- medir max/min no RJ45;
- trocar HX711 entre pedais;
- testar apenas um pedal conectado;
- mexer levemente na protoboard/fios para detectar mau contato.

## Revalidacao da Placa Final

Depois de soldar:

1. Conferir continuidade dos GND.
2. Conferir RJ45 pinos 1, 4, 6, 2, 3 e 5.
3. Medir tensao maxima de cada saida antes de ligar na PXN.
4. Rodar modo de teste de saida.
5. Calibrar pedais.
6. Testar em jogo com log ligado.
