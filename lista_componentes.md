# Lista de Componentes

Esta lista foi mantida na raiz por compatibilidade. A versao organizada da BOM fica em [docs/07_lista_componentes.md](docs/07_lista_componentes.md).

## Eletronica

| Qtd | Componente | Observacao |
|-----|------------|------------|
| 1 | Arduino Nano | ATmega328P |
| 3 | Modulo HX711 | Um por pedal |
| 1 | Botao momentaneo | Calibracao, entre D8 e GND |
| 3 | Resistor 1 k | Filtro RC, um por canal |
| 3 | Capacitor 470 nF | Filtro RC, um por canal |
| 6 | Resistor 10 k | Divisor de tensao, dois por canal |
| 3+ | Capacitor 100 nF | Desacoplamento perto dos HX711 |
| 1+ | Capacitor 10 uF a 100 uF | Barramento 5 V/GND |

## Conectores

| Qtd | Componente | Observacao |
|-----|------------|------------|
| 3 | RJ9 femea | Entrada dos pedais Sim Ruito |
| 1 | RJ45 femea/breakout | Saida para base PXN |
| 1 | USB para Arduino | Alimentacao e log serial |

## Observacoes

- Para montagem final, preferir placa soldada a protoboard.
- Se o projeto for usado em paralelo com a placa original Sim Ruito, planejar isolamento/selecionamento de alimentacao com cuidado. Um seletor fisico e mais previsivel que deixar duas controladoras alimentando a mesma ponte ao mesmo tempo.
