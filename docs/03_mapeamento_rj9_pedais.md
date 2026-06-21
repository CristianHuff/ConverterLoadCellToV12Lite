# Mapeamento RJ9 - Pedais Sim Ruito

## Metodologia

Medicoes realizadas com multimetro em tensao DC, sistema ligado (placa Sim Ruito conectada ao PC via USB). Celula de carga de 5 kg conectada ao conector do freio para validacao.

## Matriz de Tensoes Medidas (entre pinos)

Leitura: tensao do pino da linha em relacao ao pino da coluna.

|   | P1 | P2 | P3 | P4 |
|---|----|----|----|----|
| P1 | x | -2,446 V | -2,446 V | -4,91 V |
| P2 | +2,446 V | x | 0,5 mV | -2,444 V |
| P3 | +2,446 V | -0,5 mV | x | -4,91 V |
| P4 | +4,90 V | +2,445 V | +2,444 V | x |

Com pedal apertado: diferenca entre P2 e P3 sobe de 0,5 mV para ~1,5 mV, comportamento classico de ponte Wheatstone.

## Mapeamento Final

### Visao do Conector Femea (lado do pedal)

| Pino | Funcao | Cor do fio |
|------|--------|------------|
| 1 | GND | Preto |
| 2 | S+ | Verde claro |
| 3 | S- | Verde |
| 4 | 5 V | Branco |

### Visao do Conector Macho (lado do cabo que voce abre)

| Pino | Funcao | Observacao |
|------|--------|------------|
| 1 | 5 V | Maior potencial (+4,90 V em relacao ao GND) |
| 2 | S- | Sinal negativo da ponte |
| 3 | S+ | Sinal positivo da ponte |
| 4 | GND | Referencia zero |

> Atencao: a numeracao inverte entre macho e femea. Sempre confirme visualmente antes de soldar.

## Ligacao no HX711

| Fio do pedal | Pino macho | Cor | Terminal HX711 |
|--------------|------------|-----|----------------|
| Alimentacao + | 1 | Branco | E+ |
| GND | 4 | Preto | E- |
| Sinal + | 3 | Verde claro | A+ |
| Sinal - | 2 | Verde | A- |

Os terminais B+ e B- do HX711 ficam sem conexao (canal B nao utilizado).

## Estrutura do Cabo RJ9

- Cabo de telefone fixo padrao.
- Fios com isolacao de PVC colorido (nao esmalte).
- Fio de nailon central: reforco mecanico, nao e condutor, pode ser cortado.
- Decapagem: pressionar com a unha e puxar, ou estilete com pressao minima.

## Uso em Paralelo com a Placa Original

A ideia do projeto e permitir que os pedais possam continuar existindo no ecossistema Sim Ruito/PC e tambem alimentar a caixa tradutora para PXN/PS5. Essa parte ainda exige cuidado.

Pontos ja definidos:

- fios de sinal `S+` e `S-` nao devem receber diodos em serie;
- GND deve ser comum quando houver sinais compartilhados;
- nao e recomendado deixar duas placas alimentando a mesma ponte de carga sem isolamento ou chaveamento;
- uma chave seletora fisica para alimentacao/USB/pedais pode ser mais previsivel que alimentar tudo ao mesmo tempo.

Diodos 1N4148 foram considerados para evitar backfeed, mas a solucao final de paralelo ainda deve ser validada em bancada antes de virar recomendacao de montagem.
