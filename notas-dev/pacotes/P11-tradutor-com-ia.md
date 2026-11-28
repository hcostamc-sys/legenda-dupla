# P11 — Tradutor da palavra com IA: todos os sentidos, em ordem, com exemplo (parte B)
Status: pendente
Modelo sugerido: Opus
Depende de: P06

## Objetivo
Com a chave do P06 ("Pronto"), o cartão do tradutor lista todos os sentidos do texto tocado, do mais comum ao menos comum, cada um com 1 frase de exemplo. Sem chave, o recurso aparece como indisponível no cartão, e a tradução simples do Google continua.

## Itens do log (texto original do Heric)
- 4a (parte do item 4): "Ao clicar numa palavra para traduzir através da janela do tradutor integrado do app, havendo mais de um significado, deverá mostrar todos os possíveis significados, em ordem do mais comum para o menos comum. ... E tanto para uma quanto para 2+ palavras, cada item traduzido deverá ser acompanhado de 1 frase exemplar"
- (A seleção de 2+ palavras na legenda é o P07; este pacote já deve aceitar um texto de várias palavras como entrada.)

## Onde mexer (do MAPA)
- `js/traducao.js` — função de chamada ao Gemini criada no P06; nova função (ex.: `significadoIA`); `significadoPalavra`, `lerSignificado` (fallback)
- `js/app.js` — `buscarSignificado`, `mostrarSignificado`, `abrirCartao`, `fecharCartao`
- `index.html` / `css/app.css` — lista de sentidos no cartão
- `tests/` — teste puro do leitor da resposta da IA e do `lerSignificado` sem limites
- `sw.js` — `CACHE`

## O que fazer
1. Pedido à IA (modelo e chamada do P06): texto tocado (1 ou mais palavras), a fala inteira como contexto, idioma de origem e de destino. Saída estruturada em JSON (schema): lista de sentidos ordenada do mais comum ao menos comum, cada um com tradução, classe gramatical (opcional), frase de exemplo curta no idioma original e a tradução dessa frase; mais o índice do sentido usado NESTA fala. Expressões de 2+ palavras: tratar como expressão (phrasal verb, idiom) quando for o caso.
2. Cartão: lista numerada na ordem recebida; o sentido desta fala ganha um destaque discreto ("nesta fala"), sem mudar a ordem; exemplo em itálico abaixo de cada sentido, com a tradução do exemplo. Rolagem se for longa. Carregando enquanto espera.
3. Sem chave (selo "Indisponível"): o cartão mostra a tradução do Google (`significadoPalavra`), agora com todos os sentidos que ele devolve (tirar o limite de 3 classes × 5 termos de `lerSignificado`; ordenar pela frequência que o Google informar, se houver), e uma linha "Tradutor com IA indisponível" com o botão "Inserir chave" (abre a janela da chave do P06).
4. Com chave, mas erro (cota do dia acabou — 429, sem internet, chave recusada): mesmo fallback do passo 3, com o motivo em português simples.
5. Cache em memória por (texto, fala, idiomas) para não gastar cota tocando de novo.
6. Teste automático do leitor da resposta (JSON válido, JSON quebrado, lista vazia) e do `lerSignificado` sem limites.

## Critérios de aceitação
- [ ] Com chave, tocar em "run" (inglês) mostra vários sentidos, do mais comum ao menos comum, cada um com 1 frase de exemplo e sua tradução, e o sentido desta fala destacado.
- [ ] Sem chave, o cartão mostra a tradução do Google com todos os sentidos que ele devolve e "Tradutor com IA indisponível" com o botão "Inserir chave".
- [ ] Modo avião com chave: mensagem de erro, sem travar.
- [ ] Tocar de novo na mesma palavra não faz novo pedido à IA.
- [ ] `node --test` passa, com os testes novos.

## Decisões já tomadas e suposições (não perguntar de novo)
- Heric escolheu: Gemini com chave grátis de cada usuário; sem chave, o recurso aparece "Indisponível". Linguee e Reverso descartados (sem API oficial; risco nas lojas). Modelo local no celular descartado (qualidade e velocidade piores).
- Suposição: sem chave, a tradução simples do Google continua aparecendo no cartão (só a parte da IA fica indisponível).
- Suposição: destacar o sentido desta fala sem mudar a ordem (o Heric pode pedir para tirar).

## Não mexer / regressões a vigiar
- Tradução automática das falas (`traduzirTodos`/`traduzirLote`): continua no Google Tradutor.
- Toque na palavra fora do cartão e o fechamento do cartão (`fecharCartao`).
- Janela da chave e selos do P06.

## Testes
- Automático: `node --test`; `--check` de traducao.js e app.js.
- Roteiro manual (celular):
  1. Sem chave: tocar numa palavra → tradução do Google com vários sentidos + "Tradutor com IA indisponível".
  2. Com chave: tocar em "get", "run", "set" → vários sentidos, cada um com exemplo; o da fala destacado.
  3. Modo avião → tocar numa palavra → mensagem de erro, sem travar.

## Ao terminar
Seguir a regra 9 do CLAUDE.md. Só página: não precisa de APK novo.
