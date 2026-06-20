# Lista de Componentes — Caixa Tradutora Sim Ruito → PS5

## 🧠 Eletrônica Central

| Qtd | Componente | Especificação | Observação |
|-----|------------|---------------|------------|
| 1x | Arduino Nano | ATmega328P, pinos já soldados | Com soquete fêmea na placa |
| 3x | Módulo HX711 | Breakout padrão vermelho | Com soquete fêmea na placa |

---

## 🎛️ Filtro RC (3 canais)

| Qtd | Componente | Valor | Função |
|-----|------------|-------|--------|
| 3x | Resistor | 1kΩ 1/4W | Resistor do filtro RC |
| 3x | Capacitor cerâmico | 470nF (474) | Capacitor do filtro RC |

> Frequência de corte: **fc ≈ 338 Hz** — limpa o PWM de 62kHz sem atrasar o sinal do pedal.

---

## ⚖️ Divisor de Tensão (3 canais)

| Qtd | Componente | Valor | Função |
|-----|------------|-------|--------|
| 6x | Resistor | 10kΩ 1/4W | R1 e R2 do divisor (2 por canal) |

> Resultado: 5V Arduino → **2,5V máximo** na saída — dentro da janela medida da PXN (máximo ~1,99V).

---

## 🔌 Conectores e Carcaça

| Qtd | Componente | Especificação | Observação |
|-----|------------|---------------|------------|
| 3x | Conector fêmea RJ9 de painel | 4 vias | Entrada dos pedais Sim Ruito |
| 1x | Breakout Board RJ45 | Com bornes verdes | Saída para base PXN |
| 1x | Conector USB tipo B fêmea de painel | Padrão | Entrada alimentação do Arduino |
| 1x | Caixa Patola | Mínimo 10x6x4 cm | Para abrigar todo o circuito |

---

## 🛠️ Substrato e Fixação

| Qtd | Componente | Especificação | Observação |
|-----|------------|---------------|------------|
| 1x | Placa perfurada fibra de vidro | 9x15 cm | Imune a vibração do FFB |
| 2x | Barra de pinos fêmea 15 vias | Passo 2,54mm | Soquete do Arduino Nano |
| 6x | Barra de pinos fêmea 4 vias | Passo 2,54mm | Soquetes dos HX711 (2 por módulo) |
| 1x | Rolo fio de estanho | 60/40, 0,8mm | Para soldas na placa |

---

## ❌ Componentes Removidos da Lista Original

| Componente | Motivo da remoção |
|------------|------------------|
| 6x Diodos 1N4148 | Alimentação não passa pelo RJ45 — proteção desnecessária |
| 3x Resistores 4,7kΩ | Substituídos por 1kΩ (melhor resposta com 470nF) |
| 3x Capacitores 100nF | Substituídos por 470nF (corte mais limpo para o sinal) |

---

## 💡 Dicas de Compra

- Resistores e capacitores: pedir **mínimo 10 unidades de cada** para ter margem de erro na calibração
- HX711: preferir módulos com **ganho selecionável** (jumper RATE) — permite ajuste de velocidade de leitura
- Arduino Nano: evitar clones com chip CH340 antigo — preferir versão com **CH340G** ou **FT232**

---

## 📐 Parâmetros Elétricos Confirmados em Bancada

| Parâmetro | Valor medido |
|-----------|-------------|
| Tensão sinal — repouso | ~23mV |
| Tensão sinal — freio fundo | ~1,74V |
| Tensão sinal — acelerador fundo | ~1,89V |
| Tensão sinal — embreagem fundo | ~1,99V |
| VREF pinos 7 e 8 | 3,314V (não usar para alimentação) |
| GND | Pinos 3 e 5 |
| Alimentação pedais | Via conector RJ9 — não passa pelo RJ45 |
