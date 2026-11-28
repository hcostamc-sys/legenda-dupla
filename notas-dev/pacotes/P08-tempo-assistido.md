# P08 — "Tempo assistido" (horímetro) em Meus vídeos
Status: pendente
Modelo sugerido: Sonnet
Depende de: P02

## Objetivo
Botão em Meus vídeos que abre uma janela com o tempo total de vídeo assistido: total, hoje, esta semana, este mês e este ano.

## Itens do log (texto original do Heric)
- 8 (item 7 do log): "Adicionar um botão de 'Horímetro (ou um nome mais apropriado para o caso), dentro do menu 'Meus vídeos' para abrir uma janela para saber quanto tempo de reprodução total de vídeo já foram por períodos (total, dia (atual), semana (atual), mês (atual) e ano (atual))"

## Onde mexer (do MAPA)
- `index.html` — `#tela-biblioteca` (botão) + nova janela
- `js/app.js` — `renderBiblioteca`/`mostrarBiblioteca` (botão), `tique` ou `aoMudarEstado` (contagem), `fecharVideo`
- `js/armazenamento.js` — guardar os totais
- `css/app.css` — janela
- `tests/` — teste puro da soma por período
- `sw.js` — `CACHE`

## O que fazer
1. Contar o tempo de relógio em que o vídeo está de fato tocando (não conta pausado, carregando, anúncio nem tela de idioma). A 2× conta o tempo real.
2. Guardar por dia (ex.: `{ 'AAAA-MM-DD': segundos }`) numa chave própria do localStorage, fora de `ld.ajustes` (assim "Restaurar ajustes padrão" não zera). Gravar a cada ~10 s tocando e ao pausar/fechar o vídeo/sair do app, para não perder tempo.
3. Função pura que soma os períodos a partir dos dias guardados: total, hoje, semana atual (de segunda a domingo), mês atual, ano atual. Teste automático com datas fixas (virada de mês, de ano, semana que cruza meses).
4. Botão "Tempo assistido" em Meus vídeos, com ícone de relógio. Janela com as 5 linhas no formato "2 h 15 min" (menos de 1 min: "0 min"), botão Fechar.

## Critérios de aceitação
- [ ] Meus vídeos tem o botão "Tempo assistido"; abre a janela com Total, Hoje, Esta semana, Este mês, Este ano.
- [ ] Assistir 5 min → Hoje, semana, mês, ano e total aumentam ~5 min.
- [ ] Pausar 5 min → nada aumenta.
- [ ] Fechar e abrir o app → valores mantidos.
- [ ] Teste da soma por período passa.

## Decisões já tomadas e suposições (não perguntar de novo)
- Suposição: nome "Tempo assistido".
- Suposição: a contagem começa do zero nesta versão (o app não guardava esse dado antes).
- Suposição: semana de segunda a domingo; conta tempo real tocando (a 2×, 1 min real = 1 min).

## Não mexer / regressões a vigiar
- `salvarPosicao` e o desempenho do `tique` (nada pesado a cada quadro: só somar na memória e gravar de tempos em tempos).

## Testes
- Automático: `node --test` com o teste novo; `--check` dos JS mexidos.
- Roteiro manual (celular): os quatro primeiros critérios.

## Ao terminar
Seguir a regra 9 do CLAUDE.md. Só página: não precisa de APK novo.
