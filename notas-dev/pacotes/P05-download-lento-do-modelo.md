# P05 — Download lento do modelo de tratamento do áudio
Status: pendente
Modelo sugerido: Opus
Depende de: P01

## Objetivo
O download do modelo (316 MB) deve usar a velocidade real do Wi-Fi. Aproveitar o APK novo para renomear os textos nativos de "separação de voz" para "tratamento do áudio".

## Itens do log (texto original do Heric)
- 2b (parte do item 2): "O download do recurso 'Modelo de separação de voz' está com download extremamente lento (wifi rápido e ok)"

## Onde mexer (do MAPA)
- `android/app/src/main/java/io/github/hcostamcsys/legendadupla/ServicoVoz.java` — `URL_MODELO`, `baixarModelo`, `baixarArquivo`, `progressoModelo`, `responder`
- `.../voz/BaixadorHttp.java`
- `android/app/src/main/res/values*/strings.xml` e strings no Java — textos "separação de voz" das notificações
- `js/voz.js` — onde a página mostra o progresso do `#voz-modelo` (só para mostrar velocidade/diagnóstico)
- `android/app/build.gradle` (versionCode/versionName) e `MainActivity.java` (`VERSAO_APK`)

## O que fazer
Fase 1 — diagnóstico (log na tela, regra 6 do CLAUDE.md):
- Mostrar no cartão do modelo, durante o download: MB/s médio dos últimos segundos, bytes baixados, endereço final depois dos redirecionamentos (só o domínio), tamanho do bloco de leitura, se há retomada. Botão "Copiar diagnóstico" (o cartão `#voz-video` já tem um; reusar o padrão).
- Hipóteses em ordem de probabilidade, cada uma confirmada lendo o código e pelo log:
  1. Leitura/escrita com buffer pequeno, sem `BufferedOutputStream`, ou SHA-256 calculado de forma cara a cada bloco → ver em `baixarArquivo`/`BaixadorHttp`.
  2. Aviso de progresso para a página a cada bloco (`progressoModelo`/`responder` → WebView) travando o laço → ver frequência.
  3. Android limitando a rede: sem serviço em primeiro plano, sem WifiLock/WakeLock, tela apagada → ver o tipo de serviço e os locks.
  4. Hugging Face entregando por um caminho lento (redirecionamento para outro CDN) numa conexão única → ver o domínio final no log; se for isso, testar download em partes paralelas (Range) para o mesmo arquivo.
- Roteiro para o Heric: instalar o APK de diagnóstico, iniciar o download com tela ligada por 1 minuto, copiar o diagnóstico e colar na conversa; depois repetir com a tela apagada.
- Commit + HANDOFF ao fim da Fase 1.

Fase 2 — corrigir a causa confirmada, mantendo: retomada após queda, conferência do SHA-256 e revisão fixa da `URL_MODELO`. Trocar os textos nativos "separação de voz" → "tratamento do áudio" (todas as línguas de `values*/strings.xml`, sem traduzir outros textos). Remover o log temporário (a velocidade em MB/s pode ficar no cartão, se ajudar).

## Critérios de aceitação
- [ ] Em Wi-Fi bom, o download dos 316 MB termina em poucos minutos (velocidade comparável a baixar um arquivo grande no navegador do celular).
- [ ] Desligar o Wi-Fi no meio e religar: o download continua de onde parou.
- [ ] Arquivo conferido pelo SHA-256 no fim; a função de tratar o áudio funciona depois.
- [ ] Notificações não dizem mais "separação de voz".
- [ ] versionCode, versionName e VERSAO_APK incrementados; build do Actions verde.

## Decisões já tomadas e suposições (não perguntar de novo)
- Heric: o recurso só muda de nome (sem função nova). Os textos da página já foram trocados no P01.

## Não mexer / regressões a vigiar
- Download dos pacotes de pontuação (`ServicoModelos.java`) usa código parecido: não alterar sem necessidade.
- Fila e processamento da voz (`lacoSeparacao`, `tratar`): fora do escopo.

## Testes
- Automático: `sh tests/voz_java/rodar.sh` se cobrir o que mudou; build no Actions.
- Roteiro manual (celular): instalar o APK; Ajustes → Tratamento do áudio → Baixar → medir o tempo; repetir o teste de queda do Wi-Fi; tratar um vídeo depois de baixar.

## Ao terminar
Seguir a regra 9 do CLAUDE.md. Gera APK novo (mexe em `android/`).
