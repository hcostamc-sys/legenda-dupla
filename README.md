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

De cima para baixo: o vídeo, a barra do tempo, os botões (**Loop**, **A–B**, **文A** da tradução e **Lista** à esquerda; **tocar/pausar** na ponta direita, perto do polegar) e a caixa da legenda. A navegação entre falas é por gestos:

| Ação | Celular | Notebook |
|---|---|---|
| Avançar uma fala | Arrastar o dedo para a **esquerda** sobre o vídeo ou sobre a legenda (como virar página) | Seta → |
| Voltar uma fala | Arrastar para a **direita** | Seta ← |
| Repetir a fala | Segurar o dedo no vídeo | R ou ↓ |
| Tocar / pausar | Toque no vídeo, ou o botão amarelo | Espaço |
| Ir a qualquer ponto | Arrastar a barra do tempo | Igual |
| Traduzir ou copiar uma palavra | Toque na palavra da linha de cima | Clique na palavra |
| Repetir a fala atual sem parar | Botão **Loop** (seta com 1); toque de novo para desligar | L |
| Repetir um trecho | Toque em **A–B**: o vídeo pausa e as falas aparecem numa lista na tela inteira, com a fala atual no meio (selo “agora”). Role e toque na fala onde o trecho começa (A) e depois na fala onde termina (B; pode ser a mesma). A tela volta para o vídeo, que repete o trecho; a legenda fica com borda âmbar cheia e o selo “Repetindo A–B”. **✕** ou o voltar do celular cancelam. Toque em **A–B** de novo para parar | B (abre a lista) |
| Ver a fala anterior, a atual e a próxima | Botão **Lista** (três barras, ao lado do 文A). A atual fica no meio; a anterior e a próxima, mais apagadas. Toque na anterior ou na próxima para ir até ela. Toque de novo no botão para voltar a uma fala por vez | V |
| Tradução: mostrar sempre, só quando pausar ou desativar | Botão **文A** abre um menu pequeno | T (troca de modo) |
| Velocidade | ⚙ Ajustes → Velocidade | [ e ] |
| Tela cheia (gira para deitado) | Botão ⛶ | F |
| Liberar o toque no vídeo por 10 s (para tocar em **Pular anúncio**) | Botão 👆 no topo (toque de novo para cancelar) | Igual |

Quando a tradução não está na tela (desativada, ou vídeo tocando no modo “só quando pausar”), a legenda original fica maior, ocupando o lugar das duas. No modo lista, as três falas mudam de tamanho juntas. Se uma fala não couber na caixa, as letras diminuem um pouco (até 70%) em vez de aparecer rolagem.

Em **⚙ Ajustes** ficam só: velocidade, sincronia de cada legenda (se ela aparecer adiantada ou atrasada), tradução automática (para qual idioma, ou não traduzir), tamanho das letras e inverter a direção do arraste (volta ao sentido antigo: esquerda volta, direita avança).

### Frases montadas

Legendas automáticas do YouTube vêm em pedaços de uns 2 segundos, cortados no meio da frase. O app percebe isso e junta os pedaços em frases completas (aparece “Frases montadas pelo app” embaixo da legenda). Frase longa é quebrada no padrão de legenda de filme: no máximo 2 linhas de 42 caracteres (84) e 7 segundos na tela, cortando de preferência depois de ponto, vírgula, ou antes de palavras como “and”, “but”, “because”, e nunca depois de “the”, “a”, “of”. A tradução da frase é dividida nos mesmos pontos. Legendas feitas por pessoas ficam como vieram.

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
- Uso: no app do YouTube, **Compartilhar → Legenda Dupla**. O vídeo abre e aparece a escolha do idioma da legenda (já vem marcado o idioma falado) e da tradução. A tradução é a do app, fala por fala, no tempo de cada fala. Também funciona colando o link e tocando em **Abrir vídeo**, sem arquivo.
- **Buscar no YouTube** (no topo da biblioteca): digite e toque em **Buscar**. O YouTube abre dentro do app, com os resultados; os **Filtros** (data de envio, duração, ordem e “só com legenda feita por pessoa”) ficam guardados. Tocar num vídeo fecha o YouTube e abre o vídeo no Legenda Dupla, já com a escolha do idioma. **← Legenda Dupla** no topo (ou o voltar do celular) fecha sem escolher. O campo de link continua logo abaixo.
- O vídeo fica na biblioteca com a legenda; ao abrir de novo, não pergunta. Para trocar: ⚙ Ajustes → **Trocar o idioma da legenda deste vídeo**.
- Arquivos do DownSub continuam funcionando (para vídeos sem legenda no YouTube).
- Limitações: o app não entra na sua conta do YouTube, então pode ter anúncios; áudio em outro idioma não dá para escolher (o player embutido não oferece); depende de funções não documentadas do player do YouTube e pode quebrar se o YouTube mudar.
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

O teste de interface salva capturas de tela em `tests/capturas/` (não vão para o repositório). Os arquivos de legenda em `tests/fixtures/` são sintéticos (texto inventado); `tests/fixtures/gerar.py` recria todos.
