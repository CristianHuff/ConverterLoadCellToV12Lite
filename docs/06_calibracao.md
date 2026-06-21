# Calibracao

## Botao

Ligue um botao momentaneo entre:

```text
D8 Arduino ---- botao ---- GND
```

O firmware usa `INPUT_PULLUP`, entao nao precisa resistor externo.

## Inicializacao

Ao ligar:

1. Mantenha todos os pedais soltos.
2. O firmware espera os HX711 ficarem prontos.
3. Depois faz `tare()` dos tres pedais.
4. Se houver calibracao valida na EEPROM, carrega os maximos salvos.

## Limpar Maximos Aprendidos

Com o sistema ligado, de um toque curto no botao. Isso limpa apenas os maximos aprendidos em RAM.

Nao apaga imediatamente a EEPROM.

## Salvar Calibracao

1. Toque curto no botao para limpar os maximos aprendidos.
2. Pise cada pedal ate o maximo desejado.
3. Nao precisa esmagar os pedais; use a forca/curso que voce quer considerar 100%.
4. Segure o botao por 3 segundos.
5. O firmware salva os maximos na EEPROM.

## Margem de Maximo

Os parametros `AJUSTE_MAX_*_PERCENT` alteram como o maximo aprendido vira 100%:

```cpp
const int AJUSTE_MAX_FREIO_PERCENT = 90;
const int AJUSTE_MAX_ACEL_PERCENT  = 95;
const int AJUSTE_MAX_EMBR_PERCENT  = 95;
```

Exemplo:

- se o freio aprendeu 1.000.000 e o ajuste e 90, o maximo salvo vira 900.000;
- isso faz o pedal chegar em 100% antes, sem precisar repetir exatamente a maior forca usada na calibracao.

## Valores Minimos Plausiveis

Para evitar salvar calibracao errada por toque acidental:

```cpp
const long CALIB_MIN_FREIO = 20000;
const long CALIB_MIN_ACEL  = 20000;
const long CALIB_MIN_EMBR  = 20000;
```

Se um pedal nao passou desse minimo, ele nao atualiza o maximo salvo.

## Quando Recalibrar

Recalibre quando:

- mudar a mecanica do pedal;
- trocar HX711;
- trocar load cell;
- montar a placa definitiva;
- perceber que chega em 100% cedo demais ou tarde demais.

## Sintomas e Ajustes

| Sintoma | Ajuste provavel |
|---------|-----------------|
| Chega em 100% cedo demais | Aumentar `AJUSTE_MAX_*_PERCENT` ou recalibrar com menos forca maxima |
| Nao chega em 100% | Diminuir `AJUSTE_MAX_*_PERCENT` |
| Pedal aciona sozinho em repouso | Aumentar `ZONA_MORTA_*` |
| Pedal demora a responder no inicio | Diminuir `ZONA_MORTA_*` |
| Acelerador corta por poucas leituras | Manter `PROTECAO_QUEDA_ACEL = true` |
