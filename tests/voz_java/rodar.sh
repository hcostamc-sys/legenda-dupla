#!/bin/sh
# Testes do núcleo Java da "voz mais clara" (separação em trechos, mixagem e limpeza da voz), sem Android.
# Uso, na raiz do projeto: sh tests/voz_java/rodar.sh
set -e
RAIZ=$(cd "$(dirname "$0")/../.." && pwd)
PASTA="$RAIZ/android/app/src/main/java/io/github/hcostamcsys/legendadupla/voz"
SAIDA=$(mktemp -d)
javac -encoding UTF-8 -d "$SAIDA" \
  "$PASTA/ModeloSeparacao.java" "$PASTA/SeparadorVoz.java" "$PASTA/MixadorVoz.java" "$PASTA/Reamostrador.java" \
  "$PASTA/Fft.java" "$PASTA/ModeloLimpeza.java" "$PASTA/LimpadorVoz.java" "$PASTA/Dereverberador.java" "$PASTA/LimpezaVoz.java" \
  "$RAIZ/tests/voz_java/TesteVoz.java"
java -cp "$SAIDA" TesteVoz
rm -rf "$SAIDA"
