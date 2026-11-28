# P09 — Análise da qualidade do áudio (parte A: app nativo)
Status: pendente
Modelo sugerido: Opus
Depende de: P05

## Objetivo
O app passa a calcular, em poucos segundos, uma nota da qualidade do áudio de um vídeo, pronta para a página pedir (a tela que mostra a nota é o P10).

## Itens do log (texto original do Heric)
- 11a (item 10 do log): "Na função de melhoria de voz, o algoritmo faz uma análise prévia da qualidade do áudio para saber se vai aplicar ou não as funções de melhoria (...)? Se sim, desejo que essa análise seja mostrada ainda na janela de escolha de idiomas, mostrando uma pontuação."
- Decisão do Heric: se a análise não existir, criar.

## Onde mexer (do MAPA)
- `.../ServicoVoz.java` — `pedido`, `responder`, fila (`lacoSeparacao`) — nova ação "analisar"
- `.../voz/ObterAudio.java`, `DecodificadorAudio.java`, `LimpadorVoz.java`/`ModeloDfn3.java`, `Dereverberador.java` (só usar)
- `MainActivity.java` — `aoMensagem` (encaminhar a ação), `VERSAO_APK`
- `js/voz.js` — função para pedir a análise ao app e receber a nota (sem tela ainda)
- `android/app/build.gradle` — versionCode/versionName

## O que fazer
1. Primeira etapa — verificar no código se já existe análise prévia (procurar em `ServicoVoz.java`, `LimpezaVoz.java`, `MixadorVoz.java`, `js/voz.js` decisões do tipo "aplicar ou não" por nível de ruído, SNR, música etc.).
   - Se existe: expor o resultado como nota de 0 a 10 por uma ação "analisar" (reusar o cálculo) e seguir para o passo 3.
   - Se não existe: criar (passo 2).
2. Análise nova: baixar só um trecho do áudio (ex.: 30–60 s a partir de ~20% do vídeo, onde quase sempre há fala), decodificar e medir em poucos segundos, SEM o modelo grande de 316 MB (ele pode nem estar baixado): ruído de fundo (comparar com a saída do DeepFilterNet3, que está no APK), eco (estimativa de reverberação) e nível de fundo sob a voz (medidas de energia/espectro). Combinar numa nota de 0 a 10 (10 = áudio limpo) e devolver também os três componentes. Medir o tempo no celular; meta: nota em menos de ~10 s com internet boa.
3. Mensagem página↔app: `mandarAoApp({acao:'analisar', ...})` → resposta com nota, componentes e erro, sem bloquear a fila de tratamento. Guardar a nota por vídeo para não recalcular.
4. Na página, só a função em `js/voz.js` que pede e recebe a nota (a tela é o P10). Para testar sem tela: mostrar a nota no cartão `#voz-video` ("Qualidade do áudio: 7/10").
5. Subir versionCode, versionName e VERSAO_APK (a página vai conferir `APK` antes de pedir a análise).

## Critérios de aceitação
- [ ] Em Ajustes → Tratamento do áudio → Este vídeo aparece "Qualidade do áudio: N/10" poucos segundos depois de abrir um vídeo.
- [ ] Vídeo de estúdio com voz limpa tem nota alta; vídeo com música alta ou eco tem nota baixa (o Heric confere com 2 vídeos de cada tipo).
- [ ] A análise funciona sem o modelo de 316 MB baixado.
- [ ] Sem internet: erro tratado, sem travar o app.
- [ ] Build do Actions verde; versão incrementada.

## Decisões já tomadas e suposições (não perguntar de novo)
- Heric: criar a análise se não existir; a nota pode demorar alguns segundos.
- Suposição: nota de 0 a 10 a partir de um trecho do áudio, sem o modelo grande.

## Não mexer / regressões a vigiar
- Fila de tratamento e mixagem da voz.
- Download do modelo (corrigido no P05).

## Testes
- Automático: `sh tests/voz_java/rodar.sh` (acrescentar teste da nota com áudio sintético: voz limpa × voz + ruído, se a estrutura permitir); build no Actions.
- Roteiro manual (celular): instalar o APK; abrir 2 vídeos limpos e 2 ruins; anotar a nota e o tempo de cada um.

## Ao terminar
Seguir a regra 9 do CLAUDE.md. Gera APK novo.
