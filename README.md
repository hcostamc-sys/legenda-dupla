# Legenda Dupla

Página instalável (PWA) para assistir vídeos do YouTube com **duas legendas ao mesmo tempo**: o idioma que você estuda em cima e a tradução em português embaixo.

Uso pessoal, sem servidor, sem contas e sem custo. As legendas e a biblioteca ficam guardadas só no navegador do seu aparelho.

## Como usar

1. No app do YouTube, copie o link do vídeo e baixe a legenda no DownSub (veja abaixo).
2. Abra o Legenda Dupla e escolha as legendas de um destes jeitos:
   - **Só a legenda do idioma que você estuda**: toque em **Legenda do idioma que estou estudando**. O app traduz sozinho cada fala para o português (ajustável em ⚙). Cada fala recebe a tradução dela, no mesmo tempo, por isso a tradução nunca sai de sincronia. A tradução fica guardada: na próxima vez, abre na hora.
   - **Dois arquivos** (idioma estudado + português): escolha os dois de uma vez, ou um em cada botão, em qualquer ordem. O app lê o texto de cada arquivo, reconhece o idioma (inglês, português, espanhol, francês, italiano ou alemão) e põe sozinho a tradução embaixo. Embaixo de cada botão aparece o idioma reconhecido. Se os dois estiverem no mesmo idioma, o app avisa.
   - **Um arquivo com os dois idiomas juntos** (legenda bilíngue, um idioma em cima e outro embaixo em cada fala): toque em **Legenda dupla**. O app separa os dois idiomas e reconhece qual é o português.
3. O link entra sozinho no campo: se o vídeo já está na biblioteca, o app reconhece pelo título; se não, usa o link que você copiou no passo 1. Na primeira vez, o Chrome pergunta se o site pode ver o que foi copiado: toque em **Permitir**. Se o campo ficar vazio, toque em **Colar**.
4. Toque em **Abrir vídeo** e depois em **▶ Tocar**.

### Tela do vídeo

De cima para baixo: o vídeo, a barra do tempo, a caixa da legenda e, embaixo dela, perto do polegar, os botões (**Loop**, **A–B**, **文A** da tradução e **Lista** à esquerda; **tocar/pausar** na ponta direita). A navegação entre falas é por gestos:

| Ação | Celular | Notebook |
|---|---|---|
| Avançar uma fala | Arrastar o dedo para a **esquerda** sobre o vídeo ou sobre a legenda (como virar página) | Seta → |
| Voltar uma fala | Arrastar para a **direita** | Seta ← |
| Repetir a fala | Segurar o dedo no vídeo | R ou ↓ |
| Tocar / pausar | Toque no vídeo, ou o botão amarelo | Espaço |
| Ir a qualquer ponto | Arrastar a barra do tempo | Igual |
| Traduzir ou copiar uma palavra | Toque na palavra da linha de cima | Clique na palavra |
| Repetir a fala atual sem parar | Botão **Loop** (seta com 1); toque de novo para desligar | L |
| Repetir um trecho | Toque em **A–B**: o vídeo pausa e as falas aparecem numa lista na tela inteira, com a fala atual no meio (selo “agora”). Role e toque na fala onde o trecho começa (A) e depois na fala onde termina (B). O trecho tem no mínimo 2 falas: tocar no B a mesma fala do A, ou uma fala antes dele, mostra um aviso e deixa escolher de novo (as falas antes do A ficam apagadas). A tela volta para o vídeo, que repete o trecho; a legenda fica com borda âmbar cheia e o selo “Repetindo A–B”. **✕** ou o voltar do celular cancelam. Toque em **A–B** de novo para parar | B (abre a lista) |
| Ver a fala anterior, a atual e a próxima | Botão **Lista** (três barras, ao lado do 文A). A atual fica no meio; a anterior e a próxima, mais apagadas. Toque na anterior ou na próxima para ir até ela. Toque de novo no botão para voltar a uma fala por vez | V |
| Tradução: mostrar sempre, só quando pausar ou desativar | Botão **文A** abre um menu pequeno | T (troca de modo) |
| Velocidade | ⚙ Ajustes → Velocidade (no app Android, versão 8: abaixo de 1×, de 0,05 em 0,05: 0,95×, 0,90×… até 0,25×) | [ e ] |
| Tela cheia (gira para deitado) | Botão ⛶ | F |
| Liberar o toque no vídeo por 10 s (para tocar em **Pular anúncio**) | Botão 👆 no topo (toque de novo para cancelar). No app Android novo não há 👆: aparece o botão **Pular anúncio** | Igual |

Padrão de quem acabou de instalar: falas em **Lista** e tradução **Mostrar sempre**.

No app Android, vídeos **ao vivo** e **Shorts** não abrem: aparece um aviso com o botão **Voltar ao YouTube**. O botão Shorts da barra de baixo do YouTube do app fica escondido.

Quando a tradução não está na tela (desativada, ou vídeo tocando no modo “só quando pausar”), a legenda original fica maior, ocupando o lugar das duas. No modo lista, as três falas mudam de tamanho juntas. Se uma fala não couber na caixa, as letras diminuem um pouco (até 70%) em vez de aparecer rolagem.

Em **⚙ Ajustes** ficam só: velocidade, sincronia de cada legenda (se ela aparecer adiantada ou atrasada), tradução automática (para qual idioma, ou não traduzir), tamanho das letras e inverter a direção do arraste (volta ao sentido antigo: esquerda volta, direita avança).

### Frases montadas

Legendas automáticas do YouTube vêm em pedaços de uns 2 segundos, cortados no meio da frase. O app percebe isso e junta os pedaços em frases completas (aparece “Frases montadas pelo app” embaixo da legenda). No app Android, a legenda automática vem com o tempo exato de cada palavra: cada legenda começa quando a primeira palavra é falada (antes o tempo era repartido pelo tamanho do texto, e a legenda podia adiantar ou atrasar quase 1 segundo). Com esse tempo o app também **pontua** a legenda automática, que o YouTube entrega sem pontos, vírgulas e maiúsculas: pausa longa na fala vira ponto, pausa média vira vírgula, a frase começa com maiúscula e, em inglês, “i” vira “I” e perguntas como “do you…”, “what is…” ganham “?” (aparece “Frases e pontuação montadas pelo app”). É uma aproximação pelas pausas, não entende o sentido: às vezes falta ou sobra uma vírgula. Vídeos que já estavam em Meus vídeos só ganham isso depois de ⚙ Ajustes → **Idioma do vídeo** (escolhendo outra legenda e depois a mesma de novo). Frase longa é quebrada no padrão de legenda de filme: no máximo 2 linhas de 42 caracteres (84) e 7 segundos na tela, cortando de preferência depois de ponto, vírgula, ou antes de palavras como “and”, “but”, “because”, e nunca depois de “the”, “a”, “of”. A tradução da frase é dividida nos mesmos pontos. Legendas feitas por pessoas ficam como vieram.

### Pontuação melhorada (recurso extra, baixado à parte)

A pontuação pelas pausas é uma aproximação. Para algo bem mais certo, o app oferece a **pontuação melhorada**: um modelo de IA que roda no próprio celular, lê a frase inteira e coloca pontos, vírgulas, interrogações e maiúsculas (inclusive em nomes, como “John”, “New York”, “NASA”). Os tempos de cada palavra não mudam, então a sincronia continua a mesma.

- O APK continua do mesmo tamanho: os modelos são baixados só por quem quiser, uma vez, e depois funcionam sem internet.
- Dois pacotes: **Inglês** (cerca de 225 MB no primeiro pacote, porque inclui o motor de 15 MB) e **Línguas latinas** (francês, espanhol, português, italiano, catalão e romeno, cerca de 145 MB). Use Wi‑Fi.
- Onde baixar: na janela de escolher o idioma do vídeo (antes de **Começar**), quando a legenda escolhida é automática; ou em ⚙ Ajustes → **Pontuação melhorada**, onde também dá para apagar.
- Com o pacote instalado, o vídeo novo mostra “Pontuando a legenda…” por alguns segundos antes de começar (há o botão **Usar a pontuação simples** para pular). Vídeos já salvos são pontuados ao abrir. Embaixo da legenda aparece “Pontuação melhorada (modelo no celular)”.
- Modelos: “punctuation_fullstop_truecase” (english e romance), do autor 1-800-BAD-CODE no Hugging Face, licença Apache 2.0. Motor: onnxruntime-web (Microsoft, licença MIT), em `vendor/ort/`.
- Também erra às vezes (principalmente vírgulas), mas entende o sentido da frase, o que as pausas não fazem.

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
- O YouTube mostra vídeos relacionados ao pausar ou no fim, e pode mostrar anúncios. Durante um anúncio, use o botão 👆 para conseguir tocar em **Pular anúncio**. Quem tem YouTube Premium e está conectado ao youtube.com no Chrome (não só no app do YouTube) normalmente não vê anúncios.
- Pular de fala pode começar um pouquinho antes do ponto certo quando o trecho ainda não carregou.
- A legenda do próprio YouTube pode aparecer junto. Se acontecer, desligue as legendas uma vez no app do YouTube.
- O som para com a tela desligada ou com o app em segundo plano.
- O app depende de partes não documentadas do player do YouTube; se o YouTube mudar, pode precisar de ajuste.
- A tradução automática usa o tradutor público do Google (o mesmo do Chrome), sem chave e sem custo, mas ele não é documentado oficialmente: se o Google mudar ou limitar, aparece “Não consegui traduzir” com o botão **Tentar de novo**. Nesse caso, baixe também a legenda em português no DownSub. O texto da legenda é enviado ao Google para ser traduzido.

## App Android (pega a legenda do YouTube sozinho)

No app Android, a legenda vem do próprio vídeo: o player do YouTube baixa a legenda (com o que o YouTube exige) e o app guarda uma cópia. Num site isso não é possível, por isso o celular Android usa o app.

- Baixar e instalar (o mesmo link sempre traz a versão mais nova, que instala por cima): https://github.com/hcostamc-sys/legenda-dupla/releases/download/android-prototipo/legenda-dupla-android.apk
- **Tela inicial = YouTube.** O app abre direto no YouTube. No topo: **Meus vídeos** (os vídeos que você já estudou) e **Entrar** (aparece só quando você não está conectado ao YouTube; conectado, quem tem Premium não vê anúncios). O Google às vezes recusa login dentro de apps; se recusar, o app funciona sem conta.
- **Estudar um vídeo:** toque nele no YouTube (ou, no app do YouTube, **Compartilhar → Legenda Dupla**). Aparece a janela **Carregando a legenda…**: o vídeo toca sem som por trás até o YouTube entregar a legenda. Depois vem a escolha do idioma da legenda (já vem marcado o idioma falado) e da tradução. Com a legenda pronta, o vídeo começa do início, com som.
- **Anúncios:** aparece o selo **Anúncio** no vídeo e, quando o YouTube deixa pular, o botão amarelo **Pular anúncio** (também dentro da janela de carregamento).
- Vídeo sem legenda nenhuma no YouTube (nem automática): o app avisa e oferece **Voltar ao YouTube** ou **Assistir sem legenda**.
- **Voltar** (botão do topo ou do celular) sai do vídeo e volta para o YouTube; se o vídeo foi aberto em **Meus vídeos**, volta para a lista.
- O vídeo fica em **Meus vídeos** com a legenda; ao abrir de novo, não pergunta. Para trocar: ⚙ Ajustes → **Trocar o idioma da legenda deste vídeo**.
- No app não há mais arquivos de legenda (DownSub), campo de link nem busca: tudo vem do YouTube. No navegador (fora do app) o site continua com os arquivos.
- **Idiomas (versão 7):** a legenda já vem marcada pelo idioma do **áudio original** do vídeo (em vídeos com dublagem automática o app volta para o áudio original) e a tradução no **idioma do celular**; dá para trocar nas listas, que têm todos os idiomas do tradutor do Google. O app também aparece no idioma do celular (a página é traduzida na primeira abertura e guardada no aparelho).
- **Palavra:** tocar numa palavra mostra o significado dela no próprio app, com **Copiar**, **Copiar frase** e **Dicionário** (Cambridge para palavras em inglês; Wikcionário para os outros idiomas).
- **Player limpo (versão 7):** o player não mostra mais o botão compartilhar, o título, o logotipo do YouTube nem o ícone de pausa no meio; ficam só o tempo e a barra do próprio app. O **Pular anúncio** continua.
- **Versão 8:** nomes de todos os idiomas nas listas (antes alguns apareciam só como “Ps”, “Qu”, “Rw”), velocidade de 0,05 em 0,05 abaixo de 1× e legenda automática com tempo exato por palavra e pontuação aproximada.
- Limitações: o app depende de funções não documentadas do player do YouTube e pode quebrar se o YouTube mudar.
- Código: pasta `android/` (Java, WebView) e `gancho.js`. O GitHub Actions compila e publica o APK a cada mudança na pasta `android/`. A página `prototipo.html` é o teste de diagnóstico (mostra o que o gancho captura e gera relatório).

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
node --test                      # lógica das legendas, legenda dupla e tradução (tests/*.test.mjs)
python3 tests/e2e_test.py        # interface com Playwright e o player de teste
```

O teste de interface salva capturas de tela em `tests/capturas/` (não vão para o repositório).

A pontuação melhorada usa modelos do Hugging Face, que o ambiente do Claude não acessa. Por isso o teste com os modelos de verdade roda no GitHub Actions (`.github/workflows/pontuacao.yml`): baixa os modelos pelos mesmos endereços do app, compara o resultado do código do app com a biblioteca oficial (`punctuators`) e publica o relatório na release `ci-pontuacao`. Os testes locais usam um modelo falso com as mesmas entradas e saídas (`tests/fixtures/modelo/`). Os arquivos de legenda em `tests/fixtures/` são sintéticos (texto inventado); `tests/fixtures/gerar.py` recria todos.
