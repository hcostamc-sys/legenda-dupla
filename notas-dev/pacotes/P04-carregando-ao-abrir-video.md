# P04 — Ícone de carregando e aviso de rede desde a abertura do vídeo
Status: pendente
Modelo sugerido: Opus
Depende de: P03

## Objetivo
Enquanto o vídeo não consegue carregar (na abertura ou depois de um pulo), mostrar sobre o vídeo um ícone de carregando circular e moderno, com o comportamento do YouTube; se for falta de internet, o aviso de reconexão aparece também na abertura, não só depois.

## Itens do log (texto original do Heric)
- 7 (item 6 do log): "Houve momentos que abri um vídeo, ficou vídeo não reproduzia (tela preta) devido má conexão, e não apareceu símbolo de tentando reconectar, depois de assistir uns minutos, ao tentar retroceder, ainda com conexão ruim, aí sim apareceu o ícone de tentando reconectar. Se um vídeo não estiver conseguindo carregar, já deve aparecer ícone de carregando (igual do YouTube, circular, porém mais bonito e moderno), e com comportamento funcional igual do youtube oficial e 100% funcional"

## Onde mexer (do MAPA)
- `js/player.js` — `PlayerYouTube.carregar`, `_ler`, `revelar` (a tela preta proposital enquanto espera o ponto salvo), estados de buffer
- `js/app.js` — `abrirVideo`, `mostrarPreparandoVideo`, `aoMudarEstado`, `conferirRede`, `atualizarAvisoRede`, `recuperarRede`
- `index.html` — novo elemento do carregando sobre o vídeo (não confundir com `#tela-carregando`/`#carregando-roda`, que são da legenda)
- `css/app.css` — animação (reusar ou criar ao lado de `.roda`)
- `sw.js` — `CACHE`

## O que fazer
1. Ler como o vídeo fica escondido até `revelar` e onde o estado de buffer do player chega à página.
2. Carregando sobre o vídeo: aparece sempre que o vídeo deveria estar tocando e não está (abertura, espera do ponto salvo, buffer após pulo ou após queda), com um atraso curto (~300 ms) para não piscar em buffers instantâneos; some assim que o vídeo anda. Não aparece com o vídeo pausado pelo usuário.
3. Visual: anel circular fino com animação suave, centralizado no vídeo, sobre fundo levemente escurecido; não cobrir a legenda.
4. Abertura com internet ruim: se o player não começar a andar dentro de um limite (ex.: ~8–10 s), ou o app nativo disser que não há internet, mostrar o aviso de reconexão já na abertura e tentar de novo sozinho, como faz durante o vídeo (`recuperarRede`). Ao voltar a internet, o vídeo começa no ponto salvo.
5. Não reintroduzir o falso alarme corrigido no P03: buffer curto após pulo mostra só o carregando, não o aviso de rede.

## Critérios de aceitação
- [ ] Abrir vídeo com internet boa: o carregando aparece no máximo por instantes e some quando o vídeo começa.
- [ ] Abrir vídeo com internet ruim/sem internet: aparece o carregando e, se não carregar no limite, também o aviso de reconexão; nunca só tela preta sem nada.
- [ ] Religar a internet: o vídeo começa sozinho no ponto salvo e os ícones somem.
- [ ] Pular falas com internet boa: nenhum aviso de rede (só carregando breve, se houver).
- [ ] Vídeo pausado pelo usuário: nenhum carregando.

## Decisões já tomadas e suposições (não perguntar de novo)
- Suposição: atraso de ~300 ms antes de mostrar o carregando e limite de ~8–10 s para acusar rede na abertura (ajustar se o código já tiver limites próprios).

## Não mexer / regressões a vigiar
- Espera do ponto salvo (`_ler`/`revelar`) e a correção da barra do P02.
- Correção do falso alarme do P03.
- Botão Pular anúncio e anúncios no player (`gancho.js`): o carregando não pode cobrir o botão de pular.

## Testes
- Automático: `node --test`; `--check` dos JS mexidos; se der, `python3 tests/e2e_test.py` (player falso `?mock=1`).
- Roteiro manual (celular):
  1. Modo avião → abrir um vídeo de Meus vídeos → carregando aparece; em ~10 s aparece o aviso de reconexão.
  2. Desligar o modo avião → vídeo começa sozinho no ponto salvo; ícones somem.
  3. Com Wi-Fi bom, abrir um vídeo → carregando some quando o vídeo anda.
  4. Pausar o vídeo → nenhum carregando.
  5. Passar 20 falas rápido → nenhum aviso de rede.

## Ao terminar
Seguir a regra 9 do CLAUDE.md. Só página, salvo se precisar de mudança no app nativo.
