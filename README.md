# Legenda Dupla

Página instalável (PWA) para assistir vídeos do YouTube com **duas legendas ao mesmo tempo**: o idioma que você estuda em cima e a tradução em português embaixo.

Uso pessoal, sem servidor, sem contas e sem custo. As legendas e a biblioteca ficam guardadas só no navegador do seu aparelho.

## Como usar

1. Baixe as legendas do vídeo no DownSub (veja abaixo).
2. Abra o Legenda Dupla, cole o link do vídeo do YouTube (botão **Colar**).
3. Toque em **Legenda do idioma que estou estudando** e escolha o arquivo `.srt` em inglês (ou outro idioma).
4. Toque em **Tradução (opcional)** e escolha o arquivo em português. Você também pode escolher os dois de uma vez: o app tenta descobrir qual é o português. Se ficaram trocados, toque em **⇅ Trocar**.
5. Toque em **Abrir vídeo** e depois em **▶ Tocar**.

### Gestos e botões

| Ação | Celular | Notebook |
|---|---|---|
| Voltar uma fala | Arrastar o dedo para a **esquerda** sobre o vídeo ou sobre a legenda, ou botão ⏮ | Seta ← |
| Avançar uma fala | Arrastar para a **direita**, ou botão ⏭ | Seta → |
| Repetir a fala | Segurar o dedo no vídeo, ou botão ↻ | R ou ↓ |
| Tocar / pausar | Toque no vídeo, ou botão ▶ | Espaço |
| Pular 5 s | Botões − 5 s e + 5 s | Shift + ← / → |
| Pausa automática no fim de cada fala | Botão **Pausa automática** | P |
| Repetir a fala em loop | Botão **Loop da fala** | L |
| Borrar ou esconder linha 1 / linha 2 | Botões **Linha 1** e **Linha 2** | 1 / 2 |
| Velocidade | Botão **1×** | [ e ] |
| Tela cheia (gira para deitado) | Botão ⛶ | F |
| Traduzir ou copiar uma palavra | Toque na palavra da linha de cima | Clique na palavra |
| Repetir um trecho | Na lista de falas: vá à primeira fala e toque **A**, vá à última e toque **B** | Igual |

A direção do arraste pode ser invertida em **⚙ Ajustes**. Lá também ficam a sincronia de cada legenda (se ela aparecer adiantada ou atrasada), o modo frases, o tamanho das letras e as outras opções.

### Modo frases

Legendas automáticas do YouTube vêm em pedaços de uns 2 segundos, cortados no meio da frase. No modo **Automático** (padrão), o app percebe isso e junta os pedaços em frases completas. Aparece o aviso “Legenda automática: frases montadas pelo app”. Legendas feitas por pessoas ficam como vieram.

### Passar a biblioteca para outro aparelho

No rodapé da biblioteca: **Exportar biblioteca** gera um arquivo `.json` em Downloads. No outro aparelho, **Importar biblioteca** e escolha esse arquivo.

## Como baixar legendas no DownSub

A mesma ajuda existe dentro do app (link no rodapé da biblioteca). Pode mudar se o site mudar.

1. No app do YouTube, toque em **Compartilhar** → **Copiar link**.
2. No Chrome, abra **downsub.com**, cole o link no campo do topo e toque no **botão verde com a seta para baixo**. Se aparecer “Verifique se você é humano”, marque a caixa.
3. Aparece a lista das legendas do vídeo. Cada linha tem os botões **SRT**, **VTT**, **TXT**, **RAW**.
4. Na linha do idioma falado no vídeo (por exemplo **English** ou **English (auto-generated)**), toque em **SRT**.
5. Para o português: se houver **Portuguese**, **Portuguese (Brazil)** ou **Portuguese (Portugal)** na lista, toque em **SRT** nela. Se não houver, desça até **Auto-translate from**, deixe **Default** e toque em **SRT** na linha **Portuguese**.
6. Não use **Download Full Video With Subtitle**, **Translate with AI** (pago), **Bilingual (Dual subtitles)** nem os anúncios.
7. Os arquivos ficam em **Downloads**, com nomes como `[English] Título do vídeo [DownSub.com].srt`.

## Limitações que o app não consegue resolver

- Alguns vídeos não tocam fora do YouTube (o dono proibiu: erros 101 e 150). O app mostra o botão **Abrir no YouTube**.
- O YouTube mostra vídeos relacionados ao pausar ou no fim, e pode mostrar anúncios.
- Pular de fala pode começar um pouquinho antes do ponto certo quando o trecho ainda não carregou.
- A legenda do próprio YouTube pode aparecer junto. Se acontecer, desligue as legendas uma vez no app do YouTube.
- O som para com a tela desligada ou com o app em segundo plano.
- O app depende de partes não documentadas do player do YouTube; se o YouTube mudar, pode precisar de ajuste.

## Como atualizar o site

O site é publicado pelo GitHub Pages a partir da branch `main`. Cada envio (push) para a `main` atualiza o site em 1 a 2 minutos.

Ao mudar qualquer arquivo, troque o nome do cache em `sw.js` (`ld-v1` → `ld-v2` → `ld-v3`...). Assim o celular recebe a versão nova. Se o app instalado não atualizar, feche-o e abra de novo.

## Para quem for mexer no código

- `PLANO.md` é a especificação completa. Leia antes de mudar qualquer coisa.
- Tudo é HTML, CSS e JavaScript puros (módulos ES), sem dependências e sem etapa de build.
- Todos os caminhos são relativos (`./js/app.js`), porque o site fica na subpasta `/legenda-dupla/`.
- Abrir o `index.html` direto do disco **não funciona** (o YouTube recusa com o erro 153 e os módulos não carregam). Para testar no computador: `python3 -m http.server 8000` na raiz e abra `http://localhost:8000/?mock=1` (o `?mock=1` usa um player de teste, sem internet).

### Testes

```bash
node --test                      # lógica das legendas (tests/legendas.test.mjs)
python3 tests/e2e_test.py        # interface com Playwright e o player de teste
```

O teste de interface salva capturas de tela em `tests/capturas/` (não vão para o repositório). Os arquivos de legenda em `tests/fixtures/` são sintéticos (texto inventado); `tests/fixtures/gerar.py` recria todos.
