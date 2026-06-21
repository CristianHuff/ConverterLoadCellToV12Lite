# ConverterLoadCellToV12Lite

Conversor experimental para usar pedais Sim Ruito com celulas de carga em uma base PXN, expondo para a base sinais analogicos parecidos com os pedais originais. A base PXN faz a ponte USB para o PS5.

O projeto ainda esta em fase de prototipo em protoboard. A leitura dos pedais e a saida analogica ja foram validadas em testes, mas a montagem final em placa soldada ainda precisa ser feita e revalidada.

## Visao Geral

```text
Pedais Sim Ruito
   | RJ9 / celulas de carga
   v
HX711 x3 -> Arduino Nano -> PWM em alta frequencia -> filtro RC -> divisor -> RJ45 PXN
                                                                       |
                                                                       v
                                                                  Base PXN -> PS5
```

## Status Atual

- Leitura dos 3 pedais via HX711 funcionando.
- Saidas analogicas aceitas pela base PXN.
- Pino 2 do RJ45 confirmado como GND/retorno na base testada.
- Calibracao automatica com botao e persistencia na EEPROM.
- Margem de maximo por pedal para nao precisar esmagar os pedais.
- Protecao curta contra dropout no acelerador.
- Modo de teste de saida do acelerador por rampa/degraus para diagnostico.
- Testado em protoboard; a placa final ainda precisa melhorar GND, filtros e desacoplamento.

## Hardware Principal

| Item | Uso |
|------|-----|
| Arduino Nano | Processa leituras e gera PWM |
| 3x HX711 | Leitura das celulas de carga |
| 3x filtro RC | Converte PWM em tensao analogica aproximada |
| 3x divisor de tensao | Reduz faixa de 5 V para faixa segura da PXN |
| RJ9 | Entrada dos pedais Sim Ruito |
| RJ45 | Saida analogica para a base PXN |
| Botao momentaneo | Limpa/salva calibracao |

## Mapeamento Rapido

### Arduino

| Funcao | Pinos |
|--------|-------|
| HX711 freio | D2 DATA, D3 SCK |
| HX711 acelerador | D4 DATA, D5 SCK |
| HX711 embreagem | D6 DATA, D7 SCK |
| PWM freio | D9 |
| PWM acelerador | D10 |
| PWM embreagem | D11 |
| Botao calibracao | D8 para GND |
| LED status | D12 via resistor para GND |

### RJ45 PXN

| Pino | Funcao |
|------|--------|
| 1 | Embreagem |
| 2 | GND/retorno |
| 3 | GND |
| 4 | Freio |
| 5 | GND |
| 6 | Acelerador |
| 7 | VREF 3,3 V, nao usar como VCC |
| 8 | VREF 3,3 V, nao usar como VCC |

## Calibracao

O firmware zera os pedais ao ligar, entao ligue com todos soltos. O botao de calibracao fica entre D8 e GND:

- toque curto: limpa maximos aprendidos em RAM;
- segurar por 3 segundos: salva na EEPROM os maximos aprendidos.

LED de status opcional no D12:

- 1 piscada: maximos aprendidos limpos;
- 3 piscadas: calibracao salva na EEPROM.

Depois de limpar, pise cada pedal ate o maximo desejado e segure o botao por 3 segundos para salvar. Os ajustes `AJUSTE_MAX_*_PERCENT` permitem aplicar margem no maximo salvo.

## Diagnostico

O firmware tem flags de log (`LOG_UTIL`, `LOG_PCT`, `LOG_PWM`, etc.) e um modo de teste eletrico:

```cpp
const bool TESTE_SAIDA_ACEL = false;
```

Quando ligado, ele ignora o HX711 do acelerador e gera degraus/rampa no PWM do acelerador. Isso ajuda a separar problema de leitura do pedal de problema na saida analogica para a base.

## Documentacao

| Arquivo | Conteudo |
|---------|----------|
| [docs/01_visao_geral.md](docs/01_visao_geral.md) | Arquitetura e estado do projeto |
| [docs/02_mapeamento_rj45_pxn.md](docs/02_mapeamento_rj45_pxn.md) | Engenharia reversa da base PXN |
| [docs/03_mapeamento_rj9_pedais.md](docs/03_mapeamento_rj9_pedais.md) | Mapeamento dos pedais Sim Ruito |
| [docs/04_esquema_eletrico.md](docs/04_esquema_eletrico.md) | Circuito por canal |
| [docs/05_codigo_arduino.md](docs/05_codigo_arduino.md) | Firmware e flags |
| [docs/06_calibracao.md](docs/06_calibracao.md) | Procedimento de calibracao |
| [docs/07_lista_componentes.md](docs/07_lista_componentes.md) | Lista de componentes |
| [docs/08_testes_diagnostico.md](docs/08_testes_diagnostico.md) | Testes feitos e como repetir |

## Avisos

- Nao injete 5 V diretamente nos sinais da PXN.
- Pinos 7 e 8 do RJ45 sao referencia de 3,3 V da base, nao alimentacao.
- Protoboard pode gerar mau contato, ripple e problemas de GND. A placa final deve usar trilhas curtas, GND bem distribuido e capacitores proximos dos HX711/filtros.
- Este projeto e experimental. Valide tensoes com multimetro antes de ligar na base.
