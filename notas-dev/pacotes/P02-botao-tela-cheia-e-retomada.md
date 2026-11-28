# P02 — Botão de tela cheia no vídeo e retomada sem pulo da barra
Status: pendente
Modelo sugerido: Opus
Depende de: P01

## Objetivo
Levar o botão de tela cheia para o canto inferior esquerdo do vídeo, aparecendo só ao tocar (como no YouTube), e fazer o vídeo e a barra de progresso retomarem direto do ponto salvo, sem ir ao fim e voltar.

## Itens do log (texto original do Heric)
- 9 (item 8 do log): "O ícone para colocar o vídeo de fala [tela] cheia, tem que ser movido do cabeçalho para o canto inferior esquerdo do vídeo, conforme é feito em todos os players. O ícone tem que aparecer somente ao tocar na tela, igual como no YouTube oficial"
- 12 (item 11 do log): "Ao clicar em qualquer vídeo de histórico ou meus vídeos, ao retomar o vídeo, muito rapidamente a barra de progresso do vídeo vai para o fim do vídeo e volta ao ponto onde estava salvo no histórico. O vídeo (e barra de progresso) tem que retomar exatamente do mesmo ponto salvo."

## Onde mexer (do MAPA)
- `index.html` — `#btn-tela-cheia` (hoje em `#barra-topo`) → dentro da área do vídeo
- `css/app.css` — posição no canto inferior esquerdo, aparecer/sumir com transição
- `js/app.js` — `toqueNoVideo`, `alternarTelaCheia`, `atualizarImersivo` — mostrar o botão ao tocar e esconder sozinho
- `js/app.js` — `atualizarProgresso`, `tique`, `salvarPosicao`, `abrirVideo` — barra ao retomar
- `js/player.js` — `PlayerYouTube._ler`, `revelar`, `tempo`, `duracao` — de onde vem o tempo falso
- `sw.js` — `CACHE`

## O que fazer
### Item 9 (botão)
1. Ler `toqueNoVideo` e a camada `#camada-gestos` antes (o toque no vídeo já faz algo hoje; não mudar isso).
2. Mover `#btn-tela-cheia` para o canto inferior esquerdo do vídeo, com o mesmo id e a mesma ação.
3. Escondido por padrão. Um toque no vídeo mostra o botão; some sozinho após cerca de 3 s sem toque, ou num segundo toque. Tocar no botão enquanto visível alterna a tela cheia e reinicia a contagem.
4. Nada de botão no cabeçalho. O botão não pode ficar sob a legenda nem ser coberto por ela, em pé e deitado.
5. Antes do primeiro play a camada de gestos não captura toques (MAPA, Pontos sensíveis): o botão não pode quebrar o primeiro toque no play do YouTube.

### Item 12 (retomada)
1. Fase 1 — confirmar a causa: o MAPA diz que `tique` chama `atualizarProgresso` com tempos falsos do player antes de `revelar` (o player começa em 0 ou informa a duração como tempo ao fazer o seek). Conferir lendo `_ler`/`revelar`/`tempo` e onde `atualizarProgresso` é chamada.
2. Fase 2 — corrigir: enquanto o vídeo não foi revelado no ponto salvo, a barra mostra o ponto salvo (e a fala do ponto salvo) e ignora o tempo do player; depois de revelado, volta ao normal. Conferir também que `salvarPosicao` não grava o tempo falso nesse intervalo (senão o ponto salvo vai para o fim).
3. Se o tempo falso também move a legenda ou o laço de repetição, aplicar a mesma proteção ali.

## Critérios de aceitação
- [ ] Botão de tela cheia não existe mais no cabeçalho; aparece no canto inferior esquerdo do vídeo ao tocar no vídeo e some sozinho em ~3 s.
- [ ] O que o toque no vídeo já fazia continua igual.
- [ ] Abrir um vídeo do Histórico/Meus vídeos: a barra aparece já no ponto salvo e não vai ao fim em nenhum momento; o vídeo começa nesse ponto.
- [ ] Fechar o vídeo logo depois de abrir não muda o ponto salvo.

## Decisões já tomadas e suposições (não perguntar de novo)
- Suposição: o botão some após ~3 s, como no YouTube.
- Suposição: o toque no vídeo mantém a função atual e, além disso, mostra o botão.

## Não mexer / regressões a vigiar
- Segurar no vídeo = 2× (`acelerarSegurando`/`soltarAceleracao`).
- Arrastar no vídeo e na legenda (`ligarGestos`).
- Espera do ponto salvo (`_ler`/`revelar`, v16, PLANO.md seção 20 item 3): não remover; só impedir que a barra leia tempo falso.
- `tests/e2e_test.py` usa `#btn-tela-cheia`: ajustar se o teste procurar o botão no cabeçalho.

## Testes
- Automático: `node --test`; `--check` dos JS mexidos; se possível rodar `python3 tests/e2e_test.py`.
- Roteiro manual (celular):
  1. Abrir um vídeo → cabeçalho sem botão de tela cheia.
  2. Tocar no vídeo → botão aparece no canto inferior esquerdo; esperar 3 s → some.
  3. Tocar no vídeo e no botão → entra em tela cheia; repetir → sai.
  4. Assistir até o meio, voltar a Meus vídeos, abrir o mesmo vídeo → barra já no ponto, sem ir ao fim; vídeo começa ali.
  5. Repetir o passo 4 pelo Histórico.

## Ao terminar
Seguir a regra 9 do CLAUDE.md. Só página: não precisa de APK novo.
