# Mapeamento RJ45 - Base PXN

## Metodologia

Engenharia reversa realizada com multimetro em bancada, sistema ligado, pedais originais PXN conectados. Medicoes de tensao DC entre todos os pinos.

## Tabela de Pinos

| Pino RJ45 | Funcao | Tensao Repouso | Tensao Fundo | Observacao |
|-----------|--------|----------------|--------------|------------|
| 1 | Sinal Embreagem | ~23 mV | ~1,99 V | Analogico puro |
| 2 | GND | ~0 V | ~0 V | Par de GND/retorno; ligar ao GND comum |
| 3 | GND | 0 V | 0 V | |
| 4 | Sinal Freio | ~23 mV | ~1,74 V | Analogico puro |
| 5 | GND | 0 V | 0 V | |
| 6 | Sinal Acelerador | ~23 mV | ~1,89 V | Analogico puro |
| 7 | VREF 3,3 V | 3,314 V | 3,314 V | Passivo: nao usar como VCC |
| 8 | VREF 3,3 V | 3,314 V | 3,314 V | Passivo: nao usar como VCC |

## Descobertas Criticas

- Sinal analogico puro: sem protocolo serial, sem multiplexacao.
- Tensao maxima ~2 V: injetar 5 V queimaria a placa PXN.
- Pino 2 tambem se comporta como GND/retorno na base testada. Validar continuidade com pinos 3 e 5 antes de soldar em outra revisao de placa.
- Pinos 7/8 sao VREF passivo: nao fornecem corrente de potencia.
- Alimentacao dos pedais vem pelo conector RJ9 do proprio pedal, nao pelo RJ45.
- Linearidade confirmada: tensao cresce proporcionalmente com a forca aplicada.

## Conexao ao Projeto

Os pinos de sinal (1, 4, 6) recebem a saida do divisor de tensao da caixa tradutora.
Os pinos GND (2, 3, 5) conectam ao GND comum do circuito.
Pinos 7 e 8 ficam desconectados.

## Validacoes no Prototipo

- Acelerador no RJ45 pino 6 foi medido com maximo proximo de 1,9 V, compativel com o pedal original.
- O modo de teste do firmware gerou rampa/degraus no pino 6 e a base PXN reconheceu a variacao.
- Em protoboard, a estabilidade depende muito de GND comum e contato firme no RJ45/barramento.
