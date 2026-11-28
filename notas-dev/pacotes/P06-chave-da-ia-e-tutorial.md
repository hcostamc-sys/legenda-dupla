# P06 — Chave do Tradutor com IA: campo, tutorial e estado (parte A)
Status: pendente
Modelo sugerido: Sonnet
Depende de: P01

## Objetivo
Criar o lugar para inserir e guardar a chave grátis do Gemini, com o mesmo visual na janela de idiomas e nos Ajustes, um tutorial bem didático de como conseguir a chave e o estado do recurso ("Pronto" ou "Indisponível"). O uso da IA no cartão da palavra é o P11 (parte B).

## Itens do log (texto original do Heric)
- 4a (parte do item 4): sentidos em ordem + 1 exemplo cada → decisão: Gemini com chave grátis de cada usuário.
- Pedido do Heric (28/11/2026): "insira um campo (aí temos que organizar certinho onde vai ficar esse campo para ficar organizado e coerente tanto na janela idioma quanto no menu configurações) para inserir a chave api (e também um botão com uma janela de tutorial como conseguir a chave da maneira mais didática possível). A chave fica salva após inserção. E se sem a chave, o recurso fica mostrando indisponível."

## Onde mexer (do MAPA)
- `index.html` — `#tela-idioma` (hoje: 2 seletores + `#cartao-pontuacao`), grupo "Legenda e tradução" de `#painel-ajustes`, duas janelas novas (chave e tutorial)
- `css/app.css` — reusar `.pm-bloco` (`.pm-topo`, `.pm-estado`, `.pm-texto`, `.pm-botoes`); só o mínimo novo
- `js/app.js` — `perguntarIdioma`, `sincronizarPainel`, `ligarEventos`, `dialogo`, `toast`
- `js/armazenamento.js` — guardar a chave fora de `ld.ajustes`
- `js/traducao.js` — função básica de chamada ao Gemini (reusada no P11) e o teste da chave
- `sw.js` — `CACHE`

## Organização da tela (decidida; seguir)
Um único padrão de "cartão de recurso" (o `.pm-bloco` que já existe), igual nos dois lugares:
- **Janela de idiomas:** abaixo dos dois seletores, um subtítulo pequeno "Recursos extras" e os cartões nesta ordem fixa: Pontuação melhorada (já existe; continua aparecendo só quando se aplica) → Tradutor com IA (sempre) → Tratamento do áudio (entra no P10, só no app). Cada cartão compacto: título + selo de estado à direita + 1 linha de texto + botões.
- **Ajustes:** no grupo "Legenda e tradução", o mesmo cartão "Tradutor com IA (Gemini)", com o mesmo selo e os mesmos botões.
- **Selo de estado:** "Pronto" (chave salva e testada) ou "Indisponível" (sem chave ou chave recusada). Mesmas palavras e cores nos dois lugares.
- **Botões do cartão:**
  - sem chave: "Inserir chave" (principal) e "Como conseguir a chave";
  - com chave: "Trocar chave" e "Como conseguir a chave" (o botão de apagar fica dentro da janela da chave).
- **Janela da chave** (uma só, aberta pelos dois lugares): campo tipo senha com botão de mostrar/ocultar, botão "Colar" (lê a área de transferência; se o WebView não deixar, some e fica o colar normal), "Salvar e testar", "Apagar chave" (só se já houver chave, com confirmação), "Cancelar" e o link "Como conseguir a chave". Resultado do teste na própria janela: "Chave funcionando" ou o motivo em português simples (chave errada, sem internet, cota do dia acabou).
- **Janela do tutorial** (uma só): passos numerados, um por tela ou em lista curta, com texto grande e simples.

## O que fazer
1. Antes de escrever o tutorial, conferir na documentação oficial (ai.google.dev, página de chaves da Gemini API) o endereço atual para criar a chave e os nomes dos botões do Google AI Studio, porque mudam com o tempo. Escrever o tutorial com os nomes como aparecem na tela (em inglês, se a tela for em inglês, com a tradução entre parênteses). Base:
   1. Tocar em "Abrir o Google AI Studio" (botão do tutorial que abre o endereço oficial no navegador; no app, conferir em `MainActivity` como links externos são abertos).
   2. Entrar com a sua conta Google.
   3. Na primeira vez, aceitar os termos.
   4. Tocar no botão de criar a chave e confirmar o projeto sugerido.
   5. Copiar a chave (um texto longo que começa com "AIza").
   6. Voltar ao app → "Inserir chave" → "Colar" → "Salvar e testar".
   Avisos curtos no fim: é grátis e não pede cartão (se aparecer pedido de pagamento, não precisa aceitar); cada pessoa cria a sua chave, não compartilhe; existe uma cota grátis por dia; na cota grátis o Google pode usar os textos enviados (só trechos de legenda) para melhorar os produtos dele.
2. Guardar a chave numa chave própria do localStorage (ex.: `ld.chaveGemini`) e o resultado do último teste (para o selo não depender de internet ao abrir a janela). Fora de `ld.ajustes`: "Restaurar ajustes padrão" não apaga. Nunca no repositório, nunca em log, nunca no endereço da requisição (usar o cabeçalho `x-goog-api-key`).
3. Em `js/traducao.js`, uma função de chamada ao Gemini (modelo numa constante: o Flash-Lite mais recente com cota grátis, conferido na documentação) e o teste da chave (um pedido mínimo). Tratar os erros: 400/403 = chave inválida; 429 = cota do dia acabou; falha de rede.
4. O selo e os botões dos dois cartões se atualizam juntos quando a chave muda.
5. Os textos escritos em português (o `js/i18n.js` traduz sozinho).

## Critérios de aceitação
- [ ] Sem chave: os dois cartões mostram "Indisponível", com "Inserir chave" e "Como conseguir a chave".
- [ ] Inserir uma chave válida → "Chave funcionando" → os dois cartões mostram "Pronto".
- [ ] Fechar e abrir o app: a chave continua salva e o selo continua "Pronto".
- [ ] Chave errada → mensagem "chave errada" e selo "Indisponível".
- [ ] "Apagar chave" (com confirmação) → "Indisponível" nos dois lugares.
- [ ] "Restaurar ajustes padrão" não apaga a chave.
- [ ] O tutorial abre dos dois lugares; o botão dele abre o Google AI Studio no navegador.
- [ ] A chave não aparece em endereço de requisição, em log nem no repositório.

## Decisões já tomadas e suposições (não perguntar de novo)
- Heric: Gemini com chave de cada usuário (compartilhar uma chave fere os termos do Google e divide a cota).
- Heric: campo nos dois lugares, coerente; tutorial didático; chave salva; sem chave = "Indisponível".
- Suposição: o cartão fica sempre visível na janela de idiomas (não só quando falta a chave), compacto quando "Pronto".

## Não mexer / regressões a vigiar
- `#cartao-pontuacao` e `atualizarCartaoPontuacao`/`desenharPacote`: só mover para dentro de "Recursos extras", sem mudar o comportamento.
- Botões "Agora não" e "Começar" da janela de idiomas.
- Ids usados por `tests/e2e_test.py` em `#tela-idioma`.

## Testes
- Automático: `node --test`; `--check` de app.js, traducao.js, armazenamento.js; teste puro da leitura dos erros do Gemini (400, 403, 429, rede); se der, `python3 tests/e2e_test.py`.
- Roteiro manual (celular): os critérios acima, um por um, começando pelo tutorial (criar a chave de verdade seguindo só as instruções do app).

## Ao terminar
Seguir a regra 9 do CLAUDE.md. Só página: não precisa de APK novo.
