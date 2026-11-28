# P10 — Nota do áudio e "Aprimorar o áudio" na janela de idiomas (parte B: página)
Status: pendente
Modelo sugerido: Opus
Depende de: P09, P06

## Objetivo
Mostrar a nota da qualidade do áudio já na janela de escolha de idiomas, com uma caixa "Aprimorar o áudio" que vem marcada quando a nota é baixa e exige o download do modelo para ser usada.

## Itens do log (texto original do Heric)
- 11b (item 10 do log): "desejo que essa análise seja mostrada ainda na janela de escolha de idiomas, mostrando uma pontuação. Se a pontuação de qualidade for baixa, deixar marcada a caixa de seleção de aprimorar o áudio (se o módulo não tiver sido baixado, ser obrigado a Clicar no botão para fazer download para conseguir utilizar)."

## Onde mexer (do MAPA)
- `index.html` — `#tela-idioma` (nova linha da nota + caixa + botão de baixar)
- `js/app.js` — `perguntarIdioma`, `escolherLegendaYoutube`, `abrirVideo`
- `js/voz.js` — função de análise do P09, estado do modelo (`#voz-modelo`), início do tratamento (mesma ação do botão `#voz-tratar`), `vozAuto`
- `css/app.css`
- `sw.js` — `CACHE`

## O que fazer
1. Só no app com `APK` ≥ versão do P09 (no site, nada muda).
2. Seguir o padrão de "cartão de recurso" criado no P06: o cartão "Tratamento do áudio" entra em "Recursos extras", depois de "Tradutor com IA", com o mesmo visual (`.pm-bloco`, selo de estado, botões). Ao abrir a janela de idiomas, pedir a análise. Linha "Qualidade do áudio: analisando…" com carregando pequeno → "7/10 · boa" (rótulos: 0–4 ruim, 5–6 média, 7–10 boa). Erro: "não foi possível analisar".
3. Caixa "Aprimorar o áudio" na mesma janela:
   - nota ≤ 5: marcada sozinha;
   - nota ainda não saiu: segue o ajuste "Tratar sozinho todo vídeo que eu abrir" (`vozAuto`);
   - modelo não baixado: caixa desabilitada e botão "Baixar modelo (316 MB)" com barra de progresso; terminado o download, a caixa habilita (e marca se a nota for baixa).
4. "Começar" com a caixa marcada → inicia o tratamento deste vídeo, igual ao botão "Tratar o áudio deste vídeo". A nota não pode atrasar o botão Começar.
5. A caixa vale só para este vídeo (não muda `vozAuto`).

## Critérios de aceitação
- [ ] Na janela de idiomas aparece a nota em poucos segundos.
- [ ] Vídeo com nota ≤ 5 e modelo baixado: caixa já marcada; Começar → o áudio passa a ser tratado.
- [ ] Modelo não baixado: caixa desabilitada até tocar em "Baixar modelo" e o download terminar.
- [ ] Vídeo com nota alta: caixa desmarcada (salvo se "Tratar sozinho" estiver ligado).
- [ ] Começar funciona na hora, mesmo com a nota ainda analisando.
- [ ] No site (fora do app) a janela fica como antes.

## Decisões já tomadas e suposições (não perguntar de novo)
- Suposição: limite de nota baixa = 5 de 10; rótulos ruim/média/boa como acima.
- Suposição: a caixa vale só para o vídeo aberto.

## Não mexer / regressões a vigiar
- Escolha de idioma, pontuação por modelo e tradução automática na mesma janela (`perguntarIdioma`).
- Ids usados por `tests/e2e_test.py` em `#tela-idioma`.

## Testes
- Automático: `node --test`; `--check` de app.js e voz.js; se der, `python3 tests/e2e_test.py`.
- Roteiro manual (celular): os critérios acima, um por um.

## Ao terminar
Seguir a regra 9 do CLAUDE.md. Só página (usa o APK do P09).
