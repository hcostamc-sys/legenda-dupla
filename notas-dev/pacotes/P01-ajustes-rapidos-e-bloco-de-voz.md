# P01 — Ajustes rápidos: folga, texto da sincronia e bloco de voz
Status: pendente
Modelo sugerido: Sonnet
Depende de: nada

## Objetivo
Trocar as opções da folga, encurtar um texto da sincronia e reorganizar o bloco "Voz mais clara" em duas funções com nomes claros (o recurso baixável deixa de se chamar "separação de voz").

## Itens do log (texto original do Heric)
- 1: "Folga antes da fala terá novas opções: 0,18; 0,3 e 0,45 (somente esses, e o 0,3 será o valor padrão)"
- 3: "Em configurações, o texto 'Legenda estudada:' do bloco sincronia deve ser apenas 'Legenda:'"
- 2a (parte do item 2): "o recurso 'Modelo de separação de voz' ... não será apenas mais separação de voz, mas ... fará tratamento total do áudio contra ruídos, má qualidade de voz, remoção de eco" → decisão do Heric: SÓ RENOMEAR (a v25 já separa, limpa ruído e remove eco).
- 10 (item 9 do log): "Organizar e renomear o bloco de 'Voz mais clara', pois existem duas funções distintas: uma de controlar volume do fundo e voz, e a outra é limpeza de ruído e eco"

## Onde mexer (do MAPA)
- `js/legendas.js` — `FOLGAS_MAX`, `FOLGA_MAX_PADRAO` — novas opções 0.18, 0.3, 0.45; padrão 0.3
- `js/armazenamento.js` — `OPCOES` (folgaFala), `AJUSTES_PADRAO`, `misturarAjustes`, `VERSAO_AJUSTES` — mesma lista e padrão; migração
- `js/app.js` — `montarFolgas` — conferir que monta os chips a partir da lista (rótulos "0,18 s", "0,3 s", "0,45 s" com vírgula)
- `tests/folga.test.mjs` — ajustar aos novos valores
- `index.html` — `#grupo-sincronia`: "Legenda estudada:" → "Legenda:"
- `index.html` — `#grupo-voz`, `#voz-modelo` (título "Modelo de separação de voz"), `#linha-voz-margem`, `#linha-voz-limpeza` — reorganizar
- `js/voz.js` — `descreverVideo` e demais textos montados por código que digam "separação de voz"/"Voz mais clara"
- `css/app.css` — só se a nova divisão precisar de estilo (reusar `.pm-bloco`, `.subtitulo`)
- `sw.js` — `CACHE` → próximo número

## O que fazer
1. Folga: lista final exatamente [0.18, 0.3, 0.45], padrão 0.3, nos dois lugares (`FOLGAS_MAX` e `OPCOES`). Rodar `node --test`.
2. Migração: valor salvo 0.6 ou 0.8 cai fora de `OPCOES` e volta ao padrão sozinho. Quem tem 0.45 salvo (era o padrão antigo, quase ninguém escolheu de propósito) deve passar para 0.3 UMA vez: usar `VERSAO_AJUSTES` (3 → 4) ou o mecanismo que o arquivo já usa para migrar versões; ler o código antes.
3. Texto: "Legenda estudada:" → "Legenda:" (só esse; não mexer no rótulo da tradução).
4. Bloco de voz: dividir `#grupo-voz` em duas partes com título próprio, mantendo todos os ids (os testes e `js/voz.js` dependem deles):
   - "Volume da voz e do fundo" — chips `#linha-voz-margem` + a dica atual dele;
   - "Limpeza da voz (ruído e eco)" — chips `#linha-voz-limpeza` + a dica atual dele.
   O que vale para as duas (este vídeo `#voz-video`, "Tratar sozinho…" `#voz-auto`, o modelo `#voz-modelo`, espaço e "Apagar todos") fica numa parte comum no topo ou no fim; escolher a ordem que leia melhor.
5. Renomear: título do grupo "Voz mais clara" → "Tratamento do áudio"; "Modelo de separação de voz" → "Modelo de tratamento do áudio". Ajustar a dica do topo para descrever as duas funções em 1 a 2 frases. Procurar outros textos da página com `grep -rn "separação de voz\|Voz mais clara" index.html js/` e trocar. NÃO mexer em `android/` aqui (os textos nativos ficam para o P05, que já gera APK).
6. Trocar `CACHE` em `sw.js`.

## Critérios de aceitação
- [ ] Ajustes → Folga mostra só 3 chips: 0,18 s; 0,3 s; 0,45 s.
- [ ] Instalação nova (ou "Restaurar ajustes padrão") marca 0,3 s.
- [ ] Quem tinha 0,45, 0,6 ou 0,8 salvo abre o app com 0,3 s marcado; depois disso, escolher 0,45 fica salvo.
- [ ] `node --test` passa.
- [ ] Bloco de sincronia mostra "Legenda:" e não "Legenda estudada:".
- [ ] O grupo se chama "Tratamento do áudio", com as partes "Volume da voz e do fundo" e "Limpeza da voz (ruído e eco)"; o cartão do download se chama "Modelo de tratamento do áudio".
- [ ] Nenhum texto da página diz "separação de voz" ou "Voz mais clara" (`grep` vazio em index.html e js/).

## Decisões já tomadas e suposições (não perguntar de novo)
- Heric: o recurso só muda de nome; nenhuma função de áudio nova.
- Suposição: quem tinha 0,45 salvo também passa para 0,3 uma vez.
- Suposição: nomes "Tratamento do áudio", "Volume da voz e do fundo", "Limpeza da voz (ruído e eco)", "Modelo de tratamento do áudio".

## Não mexer / regressões a vigiar
- `tempoDestinoFolga` (usa o valor da folga) e o loop da fala.
- Ids de `#grupo-voz` (usados por `js/voz.js` e `tests/e2e_test.py`).
- `MARGENS`/`LIMPEZAS` e `margemValida`/`limpezaValida` não mudam.

## Testes
- Automático: `node --test`; `node --input-type=module --check < js/legendas.js` (e armazenamento.js, voz.js, app.js se mexidos).
- Roteiro manual (celular):
  1. Fechar e abrir o app → Ajustes → Folga antes da fala → 3 opções, 0,3 s marcado.
  2. Escolher 0,45 s, fechar e abrir o app → continua 0,45 s.
  3. Ajustes → Sincronia → aparece "Legenda:".
  4. Ajustes → "Tratamento do áudio" → duas partes com os títulos acima; mexer nos chips de cada uma → funcionam como antes.

## Ao terminar
Seguir a regra 9 do CLAUDE.md. Só página: não precisa de APK novo.
