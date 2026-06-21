# Lista de Componentes

## Componentes Principais

| Qtd | Componente | Observacao |
|-----|------------|------------|
| 1 | Arduino Nano | ATmega328P |
| 3 | Modulo HX711 | Um por pedal |
| 3 | Celula de carga dos pedais | Ja existentes nos Sim Ruito |
| 1 | Botao momentaneo | Calibracao |
| 1 | LED | Status de calibracao |
| 1 | Resistor 220 ohm a 1 k | Serie do LED |

## Filtro e Saida Analogica

| Qtd | Componente | Valor | Uso |
|-----|------------|-------|-----|
| 3 | Resistor | 1 k | Serie do filtro RC |
| 3 | Capacitor | 470 nF | Filtro RC |
| 6 | Resistor | 10 k | Divisor de tensao, dois por canal |

Valores testados em protoboard:

- PWM repouso: `3`
- PWM max freio: `204`
- PWM max acelerador: `194`
- PWM max embreagem: `193`
- acelerador medido no RJ45: maximo proximo de `1,9 V`

## Desacoplamento Recomendado

| Qtd | Componente | Uso |
|-----|------------|-----|
| 3 | 100 nF | Um perto de cada HX711, entre VCC e GND |
| 1 | 10 uF a 100 uF | Barramento 5 V/GND |
| opcional | 47 nF a 100 nF | Paralelo extra em canais ruidosos |

## Conectores

| Qtd | Componente | Uso |
|-----|------------|-----|
| 3 | RJ9 femea | Entrada dos pedais |
| 1 | RJ45 | Saida para base PXN |
| 1 | USB para Arduino | Alimentacao/log |

## Montagem Final

Recomendado:

- placa soldada ou PCB;
- GND robusto;
- fios curtos para sinais analogicos;
- pares da celula de carga torcidos (`A+` com `A-`, `E+` com `E-`);
- filtros RC perto do conector RJ45;
- capacitores de desacoplamento perto dos HX711.

## Paralelo com a Placa Original

Se for manter a placa Sim Ruito original e a caixa tradutora no mesmo conjunto de pedais:

- nao alimentar a mesma ponte por duas placas sem isolamento;
- manter GND comum quando sinais forem compartilhados;
- considerar chave seletora fisica para USB/alimentacao/pedais;
- validar com multimetro antes de ligar tudo junto.
