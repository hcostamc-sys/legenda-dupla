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
| Avançar o vídeo (até a próxima fala) | Deslizar o dedo para a **esquerda** sobre o vídeo ou sobre a legenda (como virar página) | Seta → |
| Retroceder o vídeo (até a fala anterior) | Deslizar para a **direita** | Seta ← |
| Acelerar para 2× enquanto segura (versão 14) | Segurar o dedo no vídeo: aparece o selo **2× ▶▶** no topo do vídeo; ao soltar, volta à velocidade dos Ajustes (pausado: anda em 2× e pausa de novo ao soltar) | — |
| Repetir a fala | — | R ou ↓ |
| Tocar / pausar | Toque no vídeo, ou o botão amarelo | Espaço |
| Ir a qualquer ponto | Arrastar a barra do tempo | Igual |
| Traduzir ou copiar uma palavra | Toque na palavra da linha de cima | Clique na palavra |
| Repetir a fala atual sem parar | Botão **Loop** (seta com 1); toque de novo para desligar | L |
| Repetir um trecho | Toque em **A–B**: o vídeo pausa e as falas aparecem numa lista na tela inteira, com a fala atual no meio (selo “agora”). Role e toque na fala onde o trecho começa (A) e depois na fala onde termina (B). O trecho tem no mínimo 2 falas: tocar no B a mesma fala do A, ou uma fala antes dele, mostra um aviso e deixa escolher de novo (as falas antes do A ficam apagadas). A tela volta para o vídeo, que repete o trecho; a legenda fica com borda âmbar cheia e o selo “Repetindo A–B”. **✕** ou o voltar do celular cancelam. Toque em **A–B** de novo para parar | B (abre a lista) |
| Ver a fala anterior, a atual e a próxima | Botão **Lista** (três barras, ao lado do 文A). A atual fica no meio; a anterior e a próxima, mais apagadas. Toque na anterior ou na próxima para ir até ela. Toque de novo no botão para voltar a uma fala por vez | V |
| Tradução: mostrar sempre, só quando pausar ou desativar | Botão **文A** abre um menu pequeno | T (troca de modo) |
| Velocidade | ⚙ Ajustes → Velocidade (no app Android, versão 8: abaixo de 1×, de 0,05 em 0,05: 0,95×, 0,90×… até 0,60×; mais devagar que isso a fala fica distorcida) | [ e ] |
| Tela cheia (gira para deitado) | Botão ⛶ | F |
| Liberar o toque no vídeo por 10 s (para tocar em **Pular anúncio**) | Botão 👆 no topo (toque de novo para cancelar). No app Android novo não há 👆: aparece o botão **Pular anúncio** | Igual |

Padrão de quem acabou de instalar: falas em **Lista** e tradução **Mostrar sempre**.

**Folga antes da fala (versão 20):** ao avançar, retroceder, repetir a fala ou no loop, o vídeo não volta um tempo fixo antes da fala: vai para o silêncio depois da fala anterior. Silêncio curto: logo depois do fim da fala anterior (0,08 s depois), mas nunca menos que 0,3 s antes da fala de destino na legenda automática (frases montadas) e 0,15 s na legenda feita por pessoa: na dúvida, é melhor ouvir uma ponta da fala anterior do que perder o começo da nova. Silêncio longo: só um pouco antes da fala (no máximo 0,45 s; ajustável em ⚙ Ajustes → **Folga antes da fala**: 0,3, 0,45, 0,6 ou 0,8 s). O app não tem acesso ao áudio do YouTube: o fim da fala anterior é estimado. Na legenda automática do app Android (versão 21), ele vem do início da última palavra mais a duração dela pelo ritmo da própria pessoa; o fim que a legenda traz é folgado demais e fazia o app achar que não havia silêncio (o começo de “However” era comido). Na legenda feita por pessoa, vem do fim do bloco.

Com o vídeo **pausado**, avançar ou retroceder (deslizar, setas) não faz o vídeo tocar: ele só volta a andar pelo botão de tocar. Tocando, continua tocando. Abrir **⚙ Ajustes** pausa o vídeo na hora.

Antes de o vídeo começar aparece uma explicação animada de **como avançar e retroceder o vídeo**: um vídeo de exemplo com a barra do tempo e a legenda no modo lista (3 falas em inglês). Um polegar desliza rápido (uns 0,4 s) para um lado e para o outro; a cada deslize aparece no meio do vídeo o ícone de **Retroceder** (⏪) ou de **Avançar** (⏩), o ponto da barra do tempo volta ou vai para a frente e a legenda anda junto. Ela volta a cada vídeo até você marcar **Não mostrar mais esta explicação** e tocar em **Concluir**; dá para ver de novo em ⚙ Ajustes → **Ver como avançar e retroceder o vídeo**. Ao deslizar no vídeo de verdade, o aviso rápido no meio da tela também mostra o ícone com **Retroceder** ou **Avançar**. Quando o vídeo começa, o vídeo e a legenda aparecem devagar (entrada suave, de uns 2,4 s: escuro no começo, clareando aos poucos).

No app Android, um vídeo que já está em Meus vídeos (tocado no **histórico do YouTube** ou em **Meus vídeos**) começa sozinho: a entrada suave começa no toque e o vídeo toca assim que carregar, sem precisar do botão de tocar. Se a explicação ainda não foi marcada como “não mostrar mais”, ela aparece primeiro (com o vídeo escuro por trás) e, ao tocar em **Concluir**, vem a entrada suave e o vídeo toca.

**Internet fraca ou caída:** em vez de o vídeo ficar parado sem explicação, aparece por cima dele um aviso animado (o símbolo do Wi‑Fi acendendo) com **Sem Internet. Tentando reconectar…** ou **Internet fraca. Tentando reconectar…**. Os gestos continuam funcionando. Enquanto o vídeo estiver travado, o app pede o trecho de novo ao YouTube (aos 8 s e depois a cada 10 s; na 4ª vez recria o player no mesmo ponto). Quando a internet volta, o vídeo continua sozinho de onde parou.

**Descrições de sons:** tudo o que vem entre colchetes nas legendas, como [Music], [Applause], [Música] ou [risos], some sempre, em qualquer legenda (feita por pessoa, automática ou tradução automática do YouTube); falas que eram só isso desaparecem.

No app Android, vídeos **ao vivo** e **Shorts** não abrem: aparece um aviso com o botão **Voltar ao YouTube**. O botão Shorts da barra de baixo do YouTube do app fica escondido.

Quando a tradução não está na tela (desativada, ou vídeo tocando no modo “só quando pausar”), a legenda original fica maior, ocupando o lugar das duas. No modo lista, as três falas mudam de tamanho juntas. Se uma fala não couber na caixa, as letras diminuem um pouco (até 70%) em vez de aparecer rolagem.

Em **⚙ Ajustes** (versão 15), de cima para baixo: o bloco **Controles** (**Inverter sentido de deslizamento para avançar e retroceder**, que volta ao sentido antigo: esquerda volta, direita avança; **Velocidade**; **Folga antes da fala** (versão 20, veja abaixo); **Sincronia (só deste vídeo)**, se a legenda aparecer adiantada ou atrasada), a legenda e a tradução automática (para qual idioma, ou não traduzir), o **tamanho das letras** (padrão 19 px: enquanto arrasta, a legenda já mostra o tamanho novo; ao soltar, uma janela pergunta se quer mesmo alterar, e **Cancelar** volta ao tamanho de antes) e o botão **Restaurar ajustes padrão** (pergunta antes; não apaga vídeos, legendas salvas, sincronia de cada vídeo nem pacotes de pontuação).

### Frases montadas

Legendas automáticas do YouTube vêm em pedaços de uns 2 segundos, cortados no meio da frase. O app percebe isso e junta os pedaços em frases completas (aparece “Frases montadas pelo app” embaixo da legenda). No app Android, a legenda automática vem com o tempo exato de cada palavra: cada legenda começa quando a primeira palavra é falada (antes o tempo era repartido pelo tamanho do texto, e a legenda podia adiantar ou atrasar quase 1 segundo). Com esse tempo o app também **pontua** a legenda automática, que o YouTube entrega sem pontos, vírgulas e maiúsculas: pausa longa na fala vira ponto, pausa média vira vírgula, a frase começa com maiúscula e, em inglês, “i” vira “I” e perguntas como “do you…”, “what is…” ganham “?” (aparece “Frases e pontuação montadas pelo app”). É uma aproximação pelas pausas, não entende o sentido: às vezes falta ou sobra uma vírgula. Vídeos que já estavam em Meus vídeos só ganham isso depois de ⚙ Ajustes → **Idioma do vídeo** (escolhendo outra legenda e depois a mesma de novo). Frase longa é quebrada no padrão de legenda de filme: no máximo 2 linhas de 42 caracteres (84) e 7 segundos na tela, cortando de preferência depois de ponto, vírgula, ou antes de palavras como “and”, “but”, “because”, e nunca depois de “the”, “a”, “of”. A tradução da frase é dividida nos mesmos pontos. Legendas feitas por pessoas ficam como vieram.

### Pontuação melhorada (recurso extra, baixado à parte)

A pontuação pelas pausas é uma aproximação. Para algo bem mais certo, o app oferece a **pontuação melhorada**: um modelo de IA que roda no próprio celular, lê a frase inteira e coloca pontos, vírgulas, interrogações e maiúsculas (inclusive em nomes, como “John”, “New York”, “NASA”). Os tempos de cada palavra não mudam, então a sincronia continua a mesma.

- O APK continua do mesmo tamanho: os modelos são baixados só por quem quiser, uma vez, e depois funcionam sem internet.
- Dois pacotes: **Inglês** (cerca de 225 MB no primeiro pacote, porque inclui o motor de 15 MB) e **Línguas latinas** (francês, espanhol, português, italiano, catalão e romeno, cerca de 145 MB). Use Wi‑Fi.
- Onde baixar: na janela de escolher o idioma do vídeo (antes de **Começar**), quando a legenda escolhida é automática; ou em ⚙ Ajustes → **Pontuação melhorada**, onde também dá para apagar.
- No app Android (versão 9 em diante), quem baixa é o próprio Android: dá para sair do app ou desligar a tela que o download continua, com a barra de progresso na área de notificações (e o botão **Cancelar** ali mesmo), como na Play Store. Se a internet cair, ele tenta de novo e continua de onde parou. Quando termina, o app copia os arquivos para o lugar dos pacotes (aparece “Instalando…”). O download precisa da permissão de notificações (versão 10): na primeira vez, o Android pergunta; toque em **Permitir**. Se negar, o cartão explica e o botão **Tentar de novo** pergunta outra vez. Depois de duas negativas o Android não pergunta mais: o botão vira **Abrir configurações** (ligue as notificações do Legenda Dupla e volte ao app; o download começa sozinho). Se guardar o pacote no app falhar depois do download, **Tentar de novo** guarda outra vez sem baixar de novo. Os erros aparecem explicados (o que aconteceu e o que fazer); o detalhe técnico fica só em **Copiar diagnóstico**.
- Com o pacote instalado, o vídeo novo mostra “Pontuando a legenda…” por alguns segundos antes de começar (há o botão **Usar a pontuação simples** para pular). Vídeos já salvos são pontuados ao abrir. Embaixo da legenda aparece “Pontuação melhorada (modelo no celular)”.
- Modelos: “punctuation_fullstop_truecase” (english e romance), do autor 1-800-BAD-CODE no Hugging Face, licença Apache 2.0. Motor: onnxruntime-web (Microsoft, licença MIT), em `vendor/ort/`.
- Também erra às vezes (principalmente vírgulas), mas entende o sentido da frase, o que as pausas não fazem.
- Versão 23: vale também quando a legenda automática chega **sem o tempo de cada palavra** (o player do YouTube às vezes a entrega assim). Antes, nesse caso, nenhuma pontuação era feita e aparecia só “Frases montadas pelo app”; agora o modelo pontua (o texto só precisa das palavras). Sem o pacote, essa legenda continua sem pontuação, porque a pontuação simples depende das pausas entre as palavras. O diagnóstico mostra, em “legenda capturada”, o formato e em quantas falas veio o tempo de cada palavra.

### Voz mais clara (app Android, versões 24 e 25; recurso extra, baixado à parte)

Para vídeos com música alta, efeitos, barulho, eco ou microfone ruim. Um modelo de IA no celular separa a voz do fundo; depois, a voz separada é **limpa** (versão 25): sai o ruído e o chiado (DeepFilterNet3) e parte do eco da sala (WPE). O fundo **só abaixa enquanto alguém fala**, o bastante para a voz ficar acima dele; no resto, o som fica como no original (a música não some).

- Onde: no vídeo, ⚙ Ajustes → **Voz mais clara** → **Tratar o áudio deste vídeo**. Na primeira vez, o app baixa o modelo de separação de voz (316 MB, uma vez só; use Wi‑Fi).
- O tratamento roda no celular, em segundo plano, e leva mais ou menos o tempo do vídeo (o app mede o primeiro e passa a estimar). Dá para sair do vídeo, assistir outro ou sair do app: o andamento fica nas notificações, e no fim vem o aviso “Áudio tratado pronto” (tocar nele abre o vídeo). Em Meus vídeos aparece “Tratando 45%” ou “Voz clara”.
- Pronto: o vídeo passa a tocar com o áudio tratado, no lugar do som original, junto com a imagem (também na velocidade escolhida, no loop, no A–B e ao avançar ou retroceder). Durante anúncio volta o som original.
- **Quanto abaixar o fundo quando alguém fala:** Pouco, Médio (padrão), Muito ou Máximo. Vale para todos os vídeos; num vídeo já tratado, o som muda em alguns segundos.
- **Limpeza da voz (ruído e eco):** Máxima (padrão), Suave (o ruído e o eco caem no máximo 12 dB, se a voz parecer abafada ou artificial) ou Desligada. Também muda em segundos num vídeo já tratado. Vídeo tratado na versão 24 mostra **Tratar de novo** para ganhar a limpeza.
- **Usar o áudio tratado neste vídeo** liga e desliga sem apagar. **Tratar sozinho todo vídeo que eu abrir** trata cada vídeo novo automaticamente.
- Espaço: uns 3,7 MB por minuto de vídeo tratado. **Apagar todos os áudios tratados** libera; apagar um vídeo de Meus vídeos apaga o áudio dele.
- Para isso o app baixa o áudio do vídeo do YouTube (com o NewPipe Extractor, o mesmo do app NewPipe). O YouTube não permite isso nos termos dele, e a Play Store não aceita apps que fazem isso: é um recurso para uso pessoal. Se o YouTube mudar e o download parar, o app precisa de atualização.
- Limites: a voz cantada das músicas conta como voz; o eco forte de sala só diminui (não some); fala muito mal gravada (picotada, abafada) melhora, mas não vira gravação de estúdio; vídeos ao vivo, com restrição de idade ou só para membros não são baixados.

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
- O vídeo fica em **Meus vídeos** com a legenda; ao abrir de novo, não pergunta. Para trocar: ⚙ Ajustes → **Idioma do vídeo**.
- No app não há mais arquivos de legenda (DownSub), campo de link nem busca: tudo vem do YouTube. No navegador (fora do app) o site continua com os arquivos.
- **Idiomas (versão 7):** a legenda já vem marcada pelo idioma do **áudio original** do vídeo (em vídeos com dublagem automática o app volta para o áudio original) e a tradução no **idioma do celular**; dá para trocar nas listas, que têm todos os idiomas do tradutor do Google. O app também aparece no idioma do celular (a página é traduzida na primeira abertura e guardada no aparelho).
- **Palavra:** tocar numa palavra mostra o significado dela no próprio app, com **Copiar**, **Copiar frase** e **Dicionário** (Cambridge para palavras em inglês; Wikcionário para os outros idiomas).
- **Player limpo (versão 7):** o player não mostra mais o botão compartilhar, o título, o logotipo do YouTube nem o ícone de pausa no meio; ficam só o tempo e a barra do próprio app. O **Pular anúncio** continua.
- **Versão 8:** nomes de todos os idiomas nas listas (antes alguns apareciam só como “Ps”, “Qu”, “Rw”), velocidade de 0,05 em 0,05 abaixo de 1× e legenda automática com tempo exato por palavra e pontuação aproximada.
- **Versão 10:** o vídeo assistido no app entra no **histórico do YouTube** da conta conectada (o player embutido não grava no histórico; o app avisa o YouTube como o app oficial faz, ao começar o vídeo, a cada 20 s, ao pausar e ao sair). Precisa estar conectado (**Entrar**) e com o histórico ligado na conta. Também: permissão de notificações obrigatória para o download dos pacotes, erros explicados, explicação animada dos gestos e entrada suave do vídeo.
- **Versão 11:** o histórico do YouTube fica em dia quase na hora: o app busca os endereços de registro assim que o vídeo abre (o registro sai no instante em que o vídeo começa, sem esperar baixar a página do vídeo), manda o progresso a cada 10 s, ao pausar, ao pular na barra (inclusive para trás) e ao sair, tenta de novo se o registro inicial falhar, e o YouTube da tela inicial recarrega sozinho ao voltar, mostrando o vídeo no histórico e a barrinha vermelha de progresso sem precisar puxar para atualizar. O próprio YouTube pode levar alguns segundos para processar. Também: o Android avisa a página quando a internet cai ou volta (aviso de reconexão).
- **Versão 12:** transições suaves: o YouTube da tela inicial aparece subindo levemente e some apagando ao abrir um vídeo (curvas padrão do Material Design, 0,3 s e 0,24 s), e as abas do próprio YouTube (Início, Inscrições, Você, Histórico, busca) trocam com esmaecimento (o conteúdo antigo apaga em 0,15 s e o novo aparece em 0,32 s). Na página, Meus vídeos e a tela do vídeo aparecem com esmaecimento; o painel ⚙ Ajustes sobe e desce, o menu 文A abre e fecha com zoom curto, as janelas aparecem com leve aumento e a lista do A–B sobe. Também: códigos de formatação das legendas enviadas pelo autor do vídeo (como `<i>Hello.</i>`, `<b>`, `<font>`, `{\an8}`) não aparecem mais como texto, inclusive em vídeos já salvos.
- **Versão 14:** troca de telas sem a “piscada escura” (a tela que sai fica inteira por baixo e a nova aparece por cima dela; dentro da página, Meus vídeos e o vídeo se dissolvem um no outro); o aviso “Tentando reconectar” não aparece mais à toa ao sair do app e voltar; segurar o dedo no vídeo acelera para 2× até soltar; o resumo **Histórico** da aba Você não mostra mais Shorts (o app não abre Shorts e o **Ver tudo** já não mostrava, por isso as duas listas não batiam).
- **Versão 15:** Ajustes com o bloco **Controles**, confirmação ao mudar o tamanho das letras e botão **Restaurar ajustes padrão**. Troca de abas do YouTube sem animação do app (a animação antiga piscava: o YouTube já trocava o conteúdo e só depois a tela apagava e acendia). Troca entre telas (YouTube, Meus vídeos e o vídeo) deslizando a tela nova inteira por cima da antiga, sem a tela do vídeo aparecer meio transparente (o botão ▶ “fantasma”). Vídeo aberto no ponto salvo: a barra do tempo e a legenda não vão mais a 0:00 por um instante antes de voltar ao ponto.
- **Versão 16:** troca de abas do YouTube (Início, Inscrições, Você) **igual à do app oficial**, medida quadro a quadro numa gravação de tela dele: a página nova aparece na hora e sobe 41 dp até o lugar em 0,375 s, desacelerando (curva padrão do Android), a partir do toque na aba; nunca pisca. O **YouTube do app no idioma do celular** (tela inicial e player): antes ele ficava no idioma da primeira vez que foi aberto; agora acompanha o idioma do Android a cada abertura do app. **Vídeo salvo abre direto no ponto salvo**: o player já nasce tocando e a imagem só aparece com o vídeo andando no ponto certo (antes aparecia a capa do vídeo, o tempo ia a 0:00 por um instante e só então o vídeo surgia no ponto salvo); durante anúncio a imagem aparece na hora.
- **Versão 17:** troca de abas do YouTube **corrigida**: na 16 a animação começava no toque, antes de o YouTube trocar a página, então a página antiga descia e subia (com uma piscada preta) e a nova entrava com a subida pela metade. Agora a página antiga fica parada até a nova aparecer, e a nova entra 41 dp abaixo e sobe em 0,375 s, como no app oficial.
- **Versão 18:** na troca de abas do YouTube, nada mais surge no meio da subida (engrenagem, foto do perfil, miniaturas cinza): a página nova espera invisível, no máximo 120 ms, até estar completa, e só então sobe, como no app oficial.
- **Versão 19:** na aba **Início**, a fileira de chips (bússola, Tudo, Podcasts, Notícias…) sobe junto com o resto da página; antes ela pulava fora de sincronia na troca de aba. Agora sobe tudo o que está na tela, menos a barra de abas de baixo, e as animações próprias do YouTube ficam desligadas durante a troca.
- **Versão 24:** **Voz mais clara** (veja acima): o app trata o áudio do vídeo no celular, em segundo plano, e abaixa a música e o barulho só quando eles encobrem a fala. O APK passou de ~1,3 MB para ~17 MB (o motor do modelo e o leitor do YouTube ficam dentro dele; o modelo, 316 MB, é baixado à parte).
- **Versão 25:** **limpeza da voz** na voz mais clara: depois da separação, a voz passa por um redutor de eco (WPE) e por um redutor de ruído com IA (DeepFilterNet3, 8,6 MB, dentro do APK). Ajuste **Limpeza da voz** (Máxima, Suave, Desligada). O tratamento fica ~40% mais demorado e o APK, ~8 MB maior.
- Limitações: o app depende de funções não documentadas do player do YouTube e pode quebrar se o YouTube mudar. O registro no histórico usa o mesmo caminho não documentado (o mesmo do yt-dlp `--mark-watched`).
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
python3 tests/youtube_aba_test.py         # troca de aba do YouTube (curva do app oficial)
python3 tests/youtube_aba_inicio_test.py  # aba Início: chips sobem junto com a página
sh tests/voz_java/rodar.sh                # voz mais clara: separação em trechos, ganhos do fundo, reamostrador, FFT, limpeza (Java)
```

O teste de interface salva capturas de tela em `tests/capturas/` (não vão para o repositório).

A pontuação melhorada usa modelos do Hugging Face, que o ambiente do Claude não acessa. Por isso o teste com os modelos de verdade roda no GitHub Actions (`.github/workflows/pontuacao.yml`): baixa os modelos pelos mesmos endereços do app, compara o resultado do código do app com a biblioteca oficial (`punctuators`) e publica o relatório na release `ci-pontuacao`. Os testes locais usam um modelo falso com as mesmas entradas e saídas (`tests/fixtures/modelo/`). Os arquivos de legenda em `tests/fixtures/` são sintéticos (texto inventado); `tests/fixtures/gerar.py` recria todos.

A voz mais clara também usa um modelo do Hugging Face e o YouTube: o teste com o modelo de verdade roda no GitHub Actions (`.github/workflows/voz-ci.yml`, nas branches `voz-*`): gera uma fala sintetizada (espeak-ng) com música mais alta por cima, separa, limpa e mixa com o mesmo código Java do app (`android/voz-ci/`) e confere a melhora; e limpa uma fala com eco de sala e ruído, conferindo quanto o ruído e o eco caem. O download do áudio do YouTube não dá para testar lá (o YouTube recusa servidores de nuvem): só no celular.
