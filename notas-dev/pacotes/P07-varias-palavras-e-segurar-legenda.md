# P07 — Traduzir várias palavras juntas e segurar a legenda para voltar ao início da fala
Status: pendente
Modelo sugerido: Opus
Depende de: P06

## Objetivo
Permitir escolher um trecho de quantas palavras quiser na legenda para traduzir junto, e fazer o "segurar 1,5 s" na legenda voltar ao início da fala atual (com a folga), sem ligar o loop.

## Itens do log (texto original do Heric)
- 4b (parte do item 4): "ao clicar em mais de uma palavra das legendas, a janela do tradutor (integrado no app) deverá traduzir as palavras juntas, pois as palavras juntas (frase 2+ palavras) podem ter outros significados, e aqui também deverá ser listado todos os possíveis significados em ordem do mais comum para menos comum"
- 6 (item 5 do log): "Ao segurar na área do vídeo, permanece a função de avançar o vídeo em velocidade 2x, mas se eu segurar em qualquer área das legendas por 1,5s, a atual fala deverá voltar ao início (respeitando a função 'Folga antes da fala') sem ativar loop"

## Onde mexer (do MAPA)
- `js/gestos.js` — `ligarGestos`, `TEMPO_SEGURAR` (500 ms) — permitir tempo de segurar por chamada
- `js/app.js` — `ligarEventos` (onde `ligarGestos` é ligado em `#caixa-legenda`), `toqueNaCaixa`, `abrirCartao`, `buscarSignificado`, `fecharCartao`, `navegarAcao`, `irParaIndice`, `logicaRepeticao`
- `js/legendas.js` — `tempoDestinoFolga` (só usar)
- `css/app.css` — destaque das palavras escolhidas
- `sw.js` — `CACHE`

## O que fazer
### Item 4b (várias palavras)
1. Tocar uma palavra abre o cartão (como hoje). Com o cartão aberto, tocar outra palavra da mesma fala escolhe o trecho entre as duas (qualquer direção, qualquer quantidade de palavras). Cada novo toque numa palavra da mesma fala move o fim do trecho até ela. O trecho fica destacado na legenda.
2. O cartão traduz o trecho inteiro pelo caminho do P06 (IA com a fala como contexto; fallback Google).
3. Tocar numa palavra de outra fala começa uma escolha nova. Fechar o cartão limpa a escolha.

### Item 6 (segurar a legenda)
1. Ligar `segurar` em `#caixa-legenda` com 1,5 s (o vídeo continua com o tempo atual e o 2×).
2. Ao completar 1,5 s: voltar ao início da fala atual usando `tempoDestinoFolga` (mesmo destino do gesto de voltar à fala), sem ligar o loop e sem mudar o estado do loop se ele já estiver ligado. Mantém tocando se estava tocando.
3. Segurar não pode abrir o cartão nem escolher palavra; arrastar antes de 1,5 s cancela o segurar e vale o arraste.

## Critérios de aceitação
- [ ] Tocar "give" e depois "up" na mesma fala: as duas ficam destacadas e o cartão traduz "give up" como expressão.
- [ ] Trecho de 5 palavras funciona igual; tocar uma palavra de outra fala recomeça.
- [ ] Segurar a legenda por 1,5 s no meio de uma fala: o vídeo volta ao início dessa fala, respeitando a folga; o loop não liga.
- [ ] Segurar por menos de 1,5 s não faz nada; segurar não abre o cartão.
- [ ] Segurar no vídeo continua acelerando para 2×.
- [ ] Arrastar na legenda continua trocando de fala.

## Decisões já tomadas e suposições (não perguntar de novo)
- Heric escolheu: tocar a primeira e a última palavra, sem limite de palavras.
- Suposição: só palavras da mesma fala formam um trecho.

## Não mexer / regressões a vigiar
- `acelerarSegurando`/`soltarAceleracao` no vídeo.
- Loop da fala e loop A–B (`logicaRepeticao`, `alternarLoop`, `abrirTelaAB`).
- Toque simples na legenda fora de palavra (`toqueNaCaixa`).

## Testes
- Automático: `node --test`; `--check` de gestos.js e app.js.
- Roteiro manual (celular): os critérios acima, um por um.

## Ao terminar
Seguir a regra 9 do CLAUDE.md. Só página: não precisa de APK novo.
