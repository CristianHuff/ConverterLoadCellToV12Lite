# Projeto: Caixa Tradutora Sim Ruito -> PS5 via PXN

## Visao Geral

Converter os pedais Sim Ruito (celulas de carga) para funcionar no PS5, usando a placa controladora de um volante PXN como ponte. O prototipo atual usa Arduino Nano para ler as celulas via HX711 e gerar sinais analogicos compativeis com a entrada RJ45 da PXN.

```text
[Pedais Sim Ruito] --RJ9--> [Caixa Tradutora] --USB--> PC (log/alimentacao)
                                     |
                                   RJ45
                                     |
                              [Base PXN Volante] --USB--> PS5
```

## Componentes do Sistema

| Componente | Funcao |
|-----------|--------|
| Pedais Sim Ruito (3x) | Celulas de carga: freio, acelerador, embreagem |
| Arduino Nano | Processamento central |
| 3x Modulo HX711 | Leitura das celulas de carga |
| 3x Filtro RC (1k + 470nF) | Suaviza o PWM em tensao analogica |
| 3x Divisor de tensao (2x 10k) | Escala 5V -> 2,5V maximo (compativel com PXN) |
| Base/volante PXN | Ponte USB para PS5 |

## Estado Atual

- A base PXN reconhece os sinais analogicos gerados.
- O acelerador foi testado com rampa/degraus gerados pelo Arduino, confirmando que a saida chega na base.
- A faixa do acelerador medida no RJ45 ficou em torno de 0 V a 1,9 V, similar ao pedal original.
- Pino 2 do RJ45 foi confirmado como GND/retorno na base testada.
- A montagem ainda esta em protoboard, entao mau contato, ripple e GND ruim ainda sao riscos reais.
- A montagem final deve ser revalidada em placa soldada.

## Paralelo com a placa Sim Ruito original

A ideia de manter a placa STM32 original e o Arduino ligados ao mesmo conjunto de pedais ainda precisa de validacao de hardware. Para evitar backfeed e leituras instaveis:

- mantenha GND comum entre as placas quando houver sinais compartilhados;
- nao deixe duas placas alimentarem a mesma ponte sem isolamento/selecionamento;
- um seletor fisico de USB/alimentacao ou de pedais pode ser mais previsivel que tentar deixar tudo energizado ao mesmo tempo;
- fios S+ e S- da celula nao devem receber diodos em serie.

## Arquivos desta documentacao

| Arquivo | Conteudo |
|---------|----------|
| `01_visao_geral.md` | Este arquivo: arquitetura e componentes |
| `02_mapeamento_rj45_pxn.md` | Engenharia reversa do conector da base PXN |
| `03_mapeamento_rj9_pedais.md` | Engenharia reversa dos pedais Sim Ruito |
| `04_esquema_eletrico.md` | Circuito completo por canal + protecao |
| `05_codigo_arduino.md` | Documentacao do firmware |
| `06_calibracao.md` | Procedimento de calibracao fisica |
| `07_lista_componentes.md` | BOM completa com especificacoes |
| `08_testes_diagnostico.md` | Testes de bancada e diagnostico |
