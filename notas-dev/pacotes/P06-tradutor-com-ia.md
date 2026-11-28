# P06 — Tradutor da palavra com IA (Gemini): todos os sentidos, em ordem, com exemplo
Status: pendente
Modelo sugerido: Opus
Depende de: P01

## Objetivo
O cartão do tradutor passa a listar todos os sentidos do texto tocado, do mais comum ao menos comum, cada um com 1 frase de exemplo, usando o Gemini com a chave grátis do próprio usuário. Sem chave (ou sem cota), continua com o Google Tradutor, agora mostrando todos os sentidos que ele devolve.

## Itens do log (texto original do Heric)
- 4a (parte do item 4): "Ao clicar numa palavra para traduzir através da janela do tradutor integrado do app, havendo mais de um significado, deverá mostrar todos os possíveis significados, em ordem do mais comum para o menos comum. ... E tanto para uma quanto para 2+ palavras, cada item traduzido deverá ser acompanhado de 1 frase exemplar"
- (A seleção de 2+ palavras na legenda é o P07; este pacote já deve aceitar um texto de várias palavras como entrada.)

## Onde mexer (do MAPA)
- `js/traducao.js` — `significadoPalavra`, `lerSignificado` — nova função para a IA (ex.: `significadoIA`) + fallback
- `js/app.js` — `buscarSignificado`, `mostrarSignificado`, `abrirCartao`, `fecharCartao` — nova lista no cartão
- `index.html` — cartão da palavra; Ajustes: campo da chave
- `css/app.css` — lista de sentidos no cartão
- `js/armazenamento.js` — onde guardar a chave (fora de `ld.ajustes`)
- `tests/` — teste puro do leitor da resposta da IA e do `lerSignificado` sem limites
- `sw.js` — `CACHE`

## O que fazer
1. Antes de escrever, conferir na documentação oficial do Gemini API (ai.google.dev) qual modelo tem cota grátis hoje: usar o Flash-Lite mais recente (em nov/2026 o Flash tinha só ~20 pedidos/dia na cota grátis; o Flash-Lite, centenas) e o formato de saída estruturada (JSON com schema). Guardar o nome do modelo numa constante.
2. Ajustes → novo bloco "Tradutor com IA (Gemini)": campo da chave (tipo senha, com botão de mostrar), botão "Testar chave" (resposta: "Chave funcionando" ou o motivo), botão "Apagar chave" e um texto curto de como criar a chave grátis no Google AI Studio (aistudio.google.com → Get API key). A chave fica só no celular, numa chave própria do localStorage (ex.: `ld.chaveGemini`), fora de `ld.ajustes`; "Restaurar ajustes padrão" não a apaga. Nunca colocar a chave no endereço (usar o cabeçalho `x-goog-api-key`), nunca no repositório, nunca em log.
3. Pedido à IA: texto tocado (1 ou mais palavras), a fala inteira como contexto, idioma de origem e de destino. Resposta em JSON: lista de sentidos ordenada do mais comum ao menos comum, cada um com: tradução, classe gramatical (opcional), frase de exemplo curta no idioma original e a tradução dessa frase; mais o índice do sentido usado NESTA fala. Expressões de 2+ palavras: tratar como expressão (phrasal verb, idiom) quando for o caso.
4. Cartão: lista numerada na ordem recebida; o sentido desta fala ganha um destaque discreto ("nesta fala"), sem mudar a ordem; exemplo em itálico abaixo de cada sentido, com a tradução do exemplo. Rolagem se for longa. Carregando enquanto espera.
5. Fallback (sem chave, erro, sem internet da IA ou cota esgotada — erro 429): usar `significadoPalavra` e mostrar todos os sentidos (tirar o limite de 3 classes × 5 termos de `lerSignificado`, ordenando pela frequência que o Google informa, se houver); aviso curto no cartão: "sem chave da IA" ou "cota grátis da IA acabou hoje". Sem exemplo nesse caso.
6. Cache em memória por (texto, fala, idiomas) para não gastar cota tocando de novo.
7. Teste automático do leitor da resposta (JSON válido, JSON quebrado, lista vazia) e do `lerSignificado` sem limites.

## Critérios de aceitação
- [ ] Com chave válida, tocar em "run" (inglês) mostra vários sentidos, do mais comum ao menos comum, cada um com 1 frase de exemplo e sua tradução, e o sentido desta fala destacado.
- [ ] Sem chave, o cartão mostra a tradução do Google com todos os sentidos que ele devolve e o aviso "sem chave da IA".
- [ ] Chave inválida: "Testar chave" mostra o erro; o cartão cai no Google sem travar.
- [ ] A chave não aparece no endereço das requisições nem em nenhum arquivo do repositório.
- [ ] `node --test` passa, com os testes novos.

## Decisões já tomadas e suposições (não perguntar de novo)
- Heric escolheu: Gemini com chave grátis do próprio usuário; sem chave, Google Tradutor. Linguee e Reverso descartados (sem API oficial; risco nas lojas).
- Suposição: destacar o sentido desta fala sem mudar a ordem (o Heric pode pedir para tirar).
- Suposição: a chave sobrevive a "Restaurar ajustes padrão".
- Aviso para o Heric: na cota grátis o Google pode usar os textos enviados para melhorar os produtos dele (são só trechos de legenda).

## Não mexer / regressões a vigiar
- Tradução automática das falas (`traduzirTodos`/`traduzirLote`): continua no Google Tradutor.
- Toque na palavra fora do cartão e o fechamento do cartão (`fecharCartao`).
- `js/i18n.js` traduz os textos novos sozinho: escrever em português.

## Testes
- Automático: `node --test`; `--check` de traducao.js, app.js, armazenamento.js.
- Roteiro manual (celular):
  1. Sem chave: tocar numa palavra → cartão com sentidos do Google e aviso "sem chave da IA".
  2. Criar a chave no AI Studio, colar em Ajustes → Testar chave → "Chave funcionando".
  3. Tocar em "get", "run", "set" → vários sentidos, cada um com exemplo; o da fala destacado.
  4. Modo avião → tocar numa palavra → mensagem de erro, sem travar.

## Ao terminar
Seguir a regra 9 do CLAUDE.md. Só página: não precisa de APK novo.
