# Plano — Legenda Dupla (YouTube)

Nov 21, 2026 · @Heric Costa da Conceicao

## 1. Visão geral e decisões já fechadas

Construir uma página web instalável (PWA) chamada **Legenda Dupla**, que toca vídeos do YouTube com duas legendas sincronizadas: o idioma estudado em cima e a tradução em português embaixo. É para uso pessoal, sem servidor, sem contas e sem custo.

Decisões fechadas com o usuário. A nova sessão **não deve reabrir nenhuma delas**:

| Decisão              | Valor fechado                                                                                                                                                                                                  |
|----------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Origem das legendas  | O usuário baixa manualmente os arquivos .srt no DownSub (ou outro site) e carrega na página. Nada de baixar legenda automaticamente: foi testado e não há caminho grátis, ilimitado e confiável (ver seção 2). |
| Escopo               | Só assistir vídeos do YouTube com legenda dupla, mais os controles de estudo dessas legendas. Sem vocabulário, flashcards, IA, contas ou sincronização.                                                        |
| Aparelhos            | Principal: celular Android Galaxy S23 Ultra com Chrome. Secundário: notebook Windows com Chrome.                                                                                                               |
| Hospedagem           | GitHub Pages, em repositório público. **Não** usar artifact do claude.ai (ver seção 2).                                                                                                                        |
| Tecnologia           | HTML, CSS e JavaScript puros, com módulos ES. Sem framework, sem etapa de build, sem dependências em produção.                                                                                                 |
| Idioma da interface  | Português do Brasil, **sempre com acentos e cedilha** (ç, ã, é etc.). Texto sem acento é erro grave para o usuário.                                                                                            |
| Idiomas das legendas | Qualquer idioma. Na prática: inglês e francês para estudar, português na tradução.                                                                                                                             |
| Gesto principal      | Arrastar o dedo na horizontal sobre o vídeo ou sobre a caixa de legenda: **para a esquerda volta uma fala; para a direita avança uma fala** (como o usuário pediu). Há uma opção para inverter.                |

Perfil do usuário: eletricista industrial, não é programador. Toda instrução para ele deve ser didática, passo a passo e sem pular etapas.

## 2. Restrições técnicas verificadas (21/11/2026)

Estes fatos foram testados ou conferidos em fonte oficial nesta data. O projeto inteiro depende deles.

| \#  | Fato                                                                                                                                                                                                                                                                                                                                                  | Consequência obrigatória                                                                                                                                                                                       |
|-----|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| R1  | Artifacts do claude.ai rodam em quadro isolado: bloqueiam iframes de outros sites e scripts de hosts fora de uma lista (o youtube.com não está nela). Conferido no guia do servidor de artifacts.                                                                                                                                                     | O player do YouTube **não funciona** como artifact. Hospedar no GitHub Pages.                                                                                                                                  |
| R2  | O YouTube recusa o player embutido sem cabeçalho Referer: é o erro 153 ([referência oficial da IFrame API](https://developers.google.com/youtube/iframe_api_reference)). A política same-origin ou no-referrer provoca esse erro; strict-origin-when-cross-origin resolve ([Simon Willison](https://til.simonwillison.net/youtube/fixing-153-embed)). | Servir por https. Usar \<meta name="referrer" content="strict-origin-when-cross-origin"\> e o mesmo valor no atributo referrerpolicy do iframe. Abrir o index.html direto do disco (file://) **não funciona**. |
| R3  | Baixar legendas automaticamente falhou em todos os caminhos grátis: o YouTube exige um token (PoToken) e bloqueia IPs de nuvem; DownSub e similares pedem verificação humana; servidores Invidious listaram as faixas mas não entregaram o texto.                                                                                                     | Entrada de legendas é **somente por arquivo** escolhido pelo usuário.                                                                                                                                          |
| R4  | Vídeos relacionados não podem ser desligados; rel=0 só os limita ao mesmo canal. modestbranding está descontinuado e não faz efeito ([parâmetros oficiais](https://developers.google.com/youtube/player_parameters)).                                                                                                                                 | Não prometer player “limpo”. Usar rel=0 e não usar modestbranding.                                                                                                                                             |
| R5  | cc_load_policy=1 força legendas do YouTube a aparecer; sem ele, vale a preferência do usuário. Não existe parâmetro oficial para forçar desligado.                                                                                                                                                                                                    | Tentar player.unloadModule('captions') depois de pronto (não documentado; envolver em try/catch). Se a legenda do YouTube aparecer mesmo assim, o usuário desliga uma vez no app do YouTube.                   |
| R6  | seekTo vai para o quadro-chave anterior mais próximo quando o trecho ainda não foi baixado. Se o player estava pausado, continua pausado.                                                                                                                                                                                                             | Pular de fala pode começar um pouco antes do ponto pedido quando o trecho não está em buffer. Tratar “tocar ao navegar” explicitamente (seção 7).                                                              |
| R7  | setPlaybackRate é só uma sugestão; valores não suportados arredondam. Carregar outro vídeo volta a velocidade para 1.                                                                                                                                                                                                                                 | Ler as velocidades de getAvailablePlaybackRates(). Confirmar pelo evento onPlaybackRateChange. Reaplicar a velocidade ao trocar de vídeo.                                                                      |
| R8  | O navegador pode bloquear início automático com som; existe o evento onAutoplayBlocked.                                                                                                                                                                                                                                                               | O primeiro play deve vir de um toque do usuário, com plano B (seção 7).                                                                                                                                        |
| R9  | Alguns donos de vídeo proíbem o player embutido: erros 101 e 150.                                                                                                                                                                                                                                                                                     | Mostrar mensagem clara e link para abrir no YouTube.                                                                                                                                                           |
| R10 | O player precisa de área mínima de 200 × 200 px.                                                                                                                                                                                                                                                                                                      | Nunca reduzir o vídeo abaixo disso, nem no celular em pé.                                                                                                                                                      |
| R11 | GitHub Pages é grátis em repositório público no plano Free; em repositório privado exige plano pago ([documentação do GitHub](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)).                                                                                                                              | Repositório **público**. O código fica público; as legendas e o histórico do usuário ficam só no navegador dele.                                                                                               |
| R12 | O ambiente de trabalho do Claude Code não acessa o YouTube (rede com lista de permissão).                                                                                                                                                                                                                                                             | Testes automatizados usam um player falso (seção 4). O teste com vídeo real é feito pelo usuário no celular (seção 12).                                                                                        |

## 3. Hospedagem no GitHub Pages

O site fica em https://SEU-USUARIO.github.io/legenda-dupla/. Cada envio (push) para a branch main atualiza o site em 1 a 2 minutos.

**Passos do usuário, uma vez só, antes da nova sessão:**

1.  Entrar em github.com. Se não tiver conta, criar uma grátis.

2.  Criar o repositório: botão **New** (ou “+” → New repository) → nome legenda-dupla → marcar **Public** → marcar **Add a README file** (para o repositório não nascer vazio) → **Create repository**.

3.  No Claude Code, tocar em **Adicionar repositório**. Se o repositório não aparecer, seguir o pedido de instalar o app do Claude no GitHub e dar acesso ao legenda-dupla. \[Nomes exatos dos botões não confirmados; podem variar.\]

4.  Abrir uma **nova sessão** com esse repositório selecionado e colar o texto inicial da seção 14.

**Passos do usuário depois que a LLM enviar o código:**

1.  No repositório: **Settings** → **Pages** → em “Build and deployment”, **Source: Deploy from a branch** → **Branch: main** e pasta **/ (root)** → **Save**.

2.  Esperar 1 a 2 minutos e abrir o endereço que aparece no topo da página Pages.

3.  No celular, abrir esse endereço no Chrome → menu ⋮ → **Instalar app** ou **Adicionar à tela inicial**.

**Regras para a LLM:**

- Antes de pedir o passo de Settings ao usuário, tentar ligar o Pages pela API: gh api -X POST repos/DONO/legenda-dupla/pages -f "source\[branch\]=main" -f "source\[path\]=/". Se der erro de permissão, pedir ao usuário com os passos acima, sem insistir.

- Criar o arquivo vazio .nojekyll na raiz, para o GitHub publicar os arquivos como estão, sem passar pelo Jekyll.

- Todos os caminhos dentro do site são **relativos** (./js/app.js, ./sw.js), porque o site fica numa subpasta (/legenda-dupla/) e não na raiz do domínio.

- Fazer commit e push para main só quando os testes automáticos passarem (seção 12).

## 4. Arquitetura e arquivos

Toda a lógica de legendas fica em um módulo puro, sem DOM, testável no Node. O player fica atrás de um adaptador com duas implementações: a real (YouTube) e uma falsa (para testes sem internet).

legenda-dupla/  
├── index.html estrutura da página, meta referrer, manifest, carrega ./js/app.js  
├── .nojekyll vazio  
├── manifest.webmanifest  
├── sw.js service worker (instalação e funcionamento offline da interface)  
├── css/app.css  
├── js/app.js estado, telas, eventos, liga tudo  
├── js/legendas.js PURO: ler SRT/VTT, limpar, frases, parear, buscar fala, ler link  
├── js/player.js adaptador: PlayerYouTube e PlayerFalso, mesma interface  
├── js/gestos.js toque, arrastar e pressionar  
├── js/armazenamento.js IndexedDB e localStorage, sempre com try/catch  
├── icons/icon-192.png, icon-512.png, icon-maskable-512.png  
├── tests/legendas.test.mjs (node:test)  
├── tests/e2e_test.py (Playwright para Python, com ?mock=1)  
├── tests/fixtures/ arquivos .srt e .vtt de teste  
└── README.md em português: o que é, como usar, como atualizar

**Interface do adaptador de player** (as duas implementações expõem exatamente isto):

| Método ou evento                                            | O que faz                                                          |
|-------------------------------------------------------------|--------------------------------------------------------------------|
| carregar(videoId, inicioSeg)                                | Cria o player e devolve uma Promise resolvida no evento de pronto. |
| tocar(), pausar()                                           | Tocar e pausar.                                                    |
| irPara(seg)                                                 | seekTo(seg, true) no real.                                         |
| tempo()                                                     | Tempo atual interpolado (seção 7).                                 |
| duracao(), estado(), titulo()                               | Duração em segundos, estado (−1, 0, 1, 2, 3, 5) e título do vídeo. |
| velocidades(), definirVelocidade(v)                         | Lista e troca de velocidade.                                       |
| destruir()                                                  | Remove o player.                                                   |
| eventos pronto, estado, velocidade, erro, autoplayBloqueado | Assinados com on(nome, fn).                                        |

**Player falso:** ativado por ?mock=1 no endereço. Simula um vídeo de 600 s com relógio baseado em performance.now() e velocidade. Desenha um retângulo cinza 16:9 com o tempo atual escrito. Serve para todos os testes automáticos e nunca aparece sem ?mock=1.

**Service worker (sw.js):** estratégia “rede primeiro, cache como reserva” só para arquivos do próprio site, para o usuário sempre receber a versão nova. Nunca guardar em cache nada do youtube.com, ytimg.com ou googlevideo.com. Nome do cache com versão (ld-v1); no activate, apagar caches antigos e chamar clients.claim().

**Manifest (manifest.webmanifest):**

| Campo                          | Valor                                                |
|--------------------------------|------------------------------------------------------|
| name e short_name              | Legenda Dupla                                        |
| start_url e scope              | ./                                                   |
| display                        | standalone                                           |
| orientation                    | any                                                  |
| background_color e theme_color | \#111111                                             |
| icons                          | Os três ícones; o maskable com "purpose": "maskable" |
| share_target                   | Ver seção 5.1                                        |

**Ícones:** gerar com Python e Pillow na sessão. Fundo \#111111, um triângulo de play branco e duas barras horizontais (branca e âmbar \#FFD54F) representando as duas legendas. No maskable, manter o desenho dentro dos 80% centrais.

**Servidor local para testes:** python3 -m http.server 8000 na raiz. Módulos ES não funcionam por file://.

## 5. Entrada: link do vídeo e arquivos de legenda

O usuário cola o link, escolhe um ou dois arquivos e toca em **Abrir vídeo**. A legenda do idioma estudado é obrigatória; a tradução é opcional.

### 5.1 Link do YouTube

Função lerLink(texto) em legendas.js. Devolve {videoId, inicioSeg} ou null.

- Aceitar, com ou sem https://, www. ou m.: youtube.com/watch?v=ID (com outros parâmetros, como &list= e &t=), youtu.be/ID, youtube.com/shorts/ID, youtube.com/live/ID, youtube.com/embed/ID, youtube-nocookie.com/embed/ID, music.youtube.com/watch?v=ID, e o ID puro.

- O ID tem exatamente 11 caracteres do conjunto \[A-Za-z0-9\_-\].

- Procurar o link dentro de qualquer texto (o app do YouTube compartilha frases como “Assista … https://youtu.be/…”).

- Parâmetro de tempo t ou start: aceitar 90, 90s, 1m30s, 1h2m3s e converter para segundos.

- Link inválido: mensagem “Não reconheci esse link do YouTube.”

**Compartilhar direto do app do YouTube (Android):** o manifest declara o trecho abaixo. Ao abrir, a página procura um link do YouTube nos parâmetros url, text e title do endereço. Se achar, preenche o campo do link e pede os arquivos. Só funciona com o app instalado (PWA).

"share_target": {  
"action": "./",  
"method": "GET",  
"params": { "title": "title", "text": "text", "url": "url" }  
}

### 5.2 Escolha dos arquivos

- Dois botões: **Legenda do idioma que estou estudando** e **Tradução (opcional)**. Mostrar o nome do arquivo escolhido e quantas falas foram lidas em cada um.

- Botão **⇅ Trocar** inverte os dois papéis.

- Também aceitar arrastar e soltar arquivos (notebook) e escolher os dois de uma vez (multiple). Com dois arquivos de uma vez: o arquivo cujo rótulo entre os primeiros colchetes começa com “Portuguese” ou “Português” (ou cujo nome contém “pt-BR”) vira a tradução, e o outro vira a legenda estudada. Se nenhum for português, o primeiro vira a legenda estudada. O usuário confere e usa ⇅ se precisar.

- **Não** restringir o atributo accept do \<input type="file"\>. No Android, um accept=".srt" pode deixar arquivos .srt cinza no seletor. Validar pelo conteúdo depois de ler.

- **Não** depender só do nome dos arquivos. O DownSub usa o padrão \[Idioma\] Título \[DownSub.com\].srt (confirmado), mas o nome serve apenas para sugerir o papel de cada arquivo; o usuário confere e usa ⇅.

- Limite de 5 MB por arquivo.

### 5.3 Leitura do texto

1.  Ler como ArrayBuffer. Tentar new TextDecoder('utf-8', {fatal: true}); se falhar, usar new TextDecoder('windows-1252') (legendas antigas em português).

2.  Remover o BOM (caractere U+FEFF no início) e trocar \r\n e \r por \n.

3.  Se o texto começar com WEBVTT, usar o leitor VTT; senão, o leitor SRT. Formato desconhecido ou zero falas: “Esse arquivo não tem legendas que eu consiga ler.”

**Leitor SRT.** Achar cada linha de tempo com a expressão (\d{1,2}:)?\d{1,2}:\d{2}\[,.\]\d{1,3}\s\*--\>\s\*(\d{1,2}:)?\d{1,2}:\d{2}\[,.\]\d{1,3} e ignorar o que vier depois dela na mesma linha. O texto da fala são as linhas seguintes até uma linha vazia ou a próxima linha de tempo. O número da fala é opcional. Milissegundos com 1 ou 2 dígitos completam com zeros à direita (,5 = 500 ms).

**Leitor VTT.** Pular o cabeçalho e os blocos NOTE, STYLE e REGION. Identificador de fala opcional. Tempos MM:SS.mmm ou HH:MM:SS.mmm. Ignorar configurações depois do tempo (align:start position:0%).

**Limpeza de cada fala**, nesta ordem:

1.  Remover marcas: tags HTML (\<i\>, \<b\>, \<u\>, \<font …\>, \<c.cor\>, \<v Nome\>), marcas de tempo internas (\<00:00:01.234\>) e códigos ASS ({\an8}).

2.  Decodificar entidades: &amp;, &lt;, &gt;, &quot;, &#39;, &nbsp; e numéricas (&#233;).

3.  Juntar as linhas com um espaço, reduzir espaços repetidos, aparar as pontas.

4.  Descartar falas vazias.

5.  Marcações de som como \[Music\], \[Música\], \[Applause\] ficam, mas há uma opção para escondê-las (padrão: mostrar). Com a opção ligada: esconder as falas que são inteiras uma marcação entre parênteses ou colchetes, como (Laughter), e remover do meio do texto marcações de até 3 palavras minúsculas entre colchetes, como \[clears throat\]. Texto de tela entre colchetes com maiúscula, como \[Nope!\], fica.

**Correções da sequência**, depois da limpeza:

1.  Ordenar por início.

2.  Legendas automáticas do YouTube repetem texto em falas seguidas (efeito “rolagem”). Se o texto da fala B começa com o texto inteiro da fala A, B fica só com o restante. Se o restante ficar vazio, descartar B.

3.  Se uma fala termina depois do início da seguinte, cortar o fim dela no início da seguinte.

4.  Se o fim for menor ou igual ao início, usar o menor entre o início da próxima fala e o início mais 2 s.

Resultado de cada arquivo: uma lista de falas {s, e, t} (início e fim em segundos com 3 casas, texto).

### 5.4 Formato real dos arquivos do DownSub (conferido em 21/11/2026)

Analisados dois arquivos SRT reais enviados pelo usuário: uma legenda automática em inglês (vídeo de 19 min) e uma legenda feita por pessoa (TED de 14 min).

| Característica         | Automática (“auto-generated”)                                                          | Feita por pessoa (TED)                                                                          |
|------------------------|----------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------|
| Codificação            | UTF-8 sem BOM, quebras \n, sem linha vazia no fim do arquivo                           | Igual                                                                                           |
| Falas                  | 570, uma linha cada, duração média de 2,0 s (máx. 4,5 s)                               | 315, às vezes em duas linhas, média de 2,4 s (máx. 8,0 s)                                       |
| Intervalo entre falas  | Contíguas: o fim de uma é o início da outra (569 de 570)                               | Pequeno intervalo, por volta de 25 ms; nenhuma sobreposta                                       |
| Pontuação              | Tem pontuação, mas a frase acaba no meio da fala; só 11% das falas terminam em ponto   | 45% terminam em ponto                                                                           |
| Repetição em “rolagem” | Não tem                                                                                | Não tem                                                                                         |
| Marcas especiais       | \>\> na troca de quem fala (40 falas); \[clears throat\] e \[snorts\] no meio do texto | (Laughter) e (Applause) como falas inteiras (30); texto de tela entre colchetes, como \[Nope!\] |

Consequências já incorporadas ao plano: o leitor aceita arquivo sem linha vazia no fim; o modo frases funciona por palavra (6.2); \>\> fecha frase e some do texto; a regra de marcações de som segue 5.3, item 5. A regra de “rolagem” de 5.3 continua, para arquivos VTT de outras fontes.

**Direitos autorais:** não colocar esses arquivos reais no repositório público. Os arquivos de teste devem ser **sintéticos**, imitando exatamente as características desta tabela.

## 6. Pareamento das legendas, modo frases e fala atual

A linha do tempo do app é a legenda estudada. Cada “fala” do app é uma unidade {i, s, e, texto, trad}. A tradução é encaixada nessas unidades **pelo tempo, nunca pela posição na lista**, porque as duas legendas podem ter cortes diferentes.

Ordem de processamento, refeita sempre que mudar arquivo, ajuste de sincronia ou modo frases:

1.  Aplicar o ajuste de sincronia de cada legenda: somar o deslocamento (em segundos, pode ser negativo) a s e e.

2.  Se o modo frases estiver ligado, juntar falas da legenda estudada em frases (6.2).

3.  Parear a tradução com as unidades (6.1).

### 6.1 Pareamento pelo tempo

- Para cada fala T da tradução, calcular a sobreposição com cada unidade U: max(0, min(T.e, U.e) − max(T.s, U.s)).

- T vai para **uma única** unidade: a de maior sobreposição. Empate: a mais cedo.

- Se T não se sobrepõe a nenhuma unidade, vai para a unidade cujo intervalo contém o meio de T. Se nenhuma contiver, vai para a unidade com início mais próximo, desde que a distância seja de até 1,5 s. Fora disso, T é descartada.

- Os textos que caem na mesma unidade são juntados em ordem de início, separados por espaço.

- Unidade sem tradução fica com trad vazio e a segunda linha não aparece.

- Implementar com dois ponteiros (as duas listas estão ordenadas). Uma legenda automática de 2 horas tem cerca de 3.600 falas (uma a cada 2 s); pareamento e modo frases juntos precisam levar menos de 100 ms com 4.000 falas.

**Com o modo frases ligado**, a tradução é pareada por palavra, e não por fala inteira: aplicar à tradução o mesmo tempo proporcional por palavra (6.2, passo 1) e colocar cada palavra traduzida na unidade que contém o meio do tempo dela (ou na unidade mais próxima, até 1,5 s). Motivo: na legenda automática, um pedaço traduzido costuma cobrir o fim de uma frase e o começo da outra. Com o modo frases desligado, vale o pareamento por fala descrito acima. \[Não confirmado: se a tradução automática do DownSub tem os mesmos tempos da automática em inglês; o algoritmo funciona nos dois casos.\]

### 6.2 Modo frases

O modo frases transforma legendas automáticas, que vêm em pedaços de cerca de 2 s cortados no meio da frase, em frases completas. As regras abaixo foram testadas em 21/11/2026 com os arquivos reais do DownSub (seção 5.4): 570 pedaços viraram 260 frases, com duração média de 4,4 s e máxima de 13,2 s.

- **Opções:** **Desligado**, **Ligado** e **Automático** (padrão).

- **Automático liga só para legenda automática**, detectada assim: o rótulo do nome do arquivo termina em “(auto-generated)”, **ou** pelo menos 80% das falas são contíguas (fim = início da próxima, com tolerância de 10 ms). Conferido: a automática real teve 569 de 570 falas contíguas; a manual do TED, nenhuma. Legenda manual fica fala por fala, como veio.

- **Algoritmo (por palavra):**

  1.  Para cada fala, separar as palavras e dar a cada uma um tempo de início e fim **proporcional à posição do caractere** dentro da fala: s + (e − s) × posição / comprimento do texto.

  2.  A marca \>\> (troca de quem fala, comum na automática) fecha a frase atual e é removida do texto.

  3.  Uma palavra que termina em . ? ! ou … (podendo vir seguida de aspas, parênteses ou colchete de fechamento) fecha a frase. Exceção: abreviações como Mr., Mrs., Ms., Dr., St., Jr., Sr., vs., etc., e.g., i.e., U.S., a.m., p.m., Prof., Sra.

  4.  Uma fala que é inteira uma marcação, como (Laughter) ou \[Music\], vira uma unidade sozinha e nunca é juntada a outra.

  5.  Frase com mais de 15 s ou mais de 220 caracteres é dividida: na vírgula, ponto e vírgula ou dois-pontos mais perto do meio (se estiver no terço central); senão, na palavra do meio. Repetir até caber.

  6.  Início da frase = início da primeira palavra; fim = fim da última. Texto = palavras unidas por espaço.

- Quando o Automático ligar, mostrar o aviso discreto “Legenda automática: frases montadas pelo app”.

- Ligado manualmente numa legenda feita por pessoa, o mesmo algoritmo vale (regra 4 protege as falas de risos e aplausos).

### 6.3 Fala atual

Função pura falaNoTempo(unidades, t) com busca binária. Devolve {indice, dentro}:

- indice = a última unidade com s ≤ t + 0,05, ou −1 se t está antes da primeira.

- dentro = true se t \< e dessa unidade; false se t está no intervalo vazio depois dela.

Exibição: dentro de uma fala, mostrar a fala. No intervalo vazio entre falas, a opção **Manter a última fala na tela** (padrão: ligada) mantém a anterior visível; desligada, a caixa fica vazia.

## 7. Integração com o player do YouTube

O player é criado a partir de um iframe escrito pela própria página. Assim a página controla referrerpolicy e allow, o que evita o erro 153. Os controles do YouTube ficam escondidos (controls=0) e a interface é toda nossa.

### 7.1 Criação

1.  No \<head\> da página: \<meta name="referrer" content="strict-origin-when-cross-origin"\>.

2.  Carregar https://www.youtube.com/iframe_api com uma tag \<script\> criada por código. Esperar o window.onYouTubeIframeAPIReady, embrulhado numa Promise, com tempo limite de 15 s e a mensagem “Não consegui carregar o player do YouTube. Confira a internet.”

3.  Inserir na área do vídeo o iframe do bloco abaixo, ocupando 100% da área 16:9.

4.  Criar o controle: new YT.Player('yt', {events: {onReady, onStateChange, onPlaybackRateChange, onError, onAutoplayBlocked}}).

5.  No onReady: aplicar a velocidade salva e tentar player.unloadModule('captions') dentro de try/catch (não documentado). Repetir essa tentativa no primeiro estado “tocando”.

6.  Trocar de vídeo = destroy() do player, remover o iframe e criar tudo de novo.

\<iframe id="yt"  
src="https://www.youtube.com/embed/VIDEO_ID?enablejsapi=1&controls=0&playsinline=1&rel=0&iv_load_policy=3&cc_load_policy=0&fs=0&disablekb=1&start=INICIO&origin=ORIGEM"  
referrerpolicy="strict-origin-when-cross-origin"  
allow="autoplay; encrypted-media; picture-in-picture"  
title="Player do YouTube"\>\</iframe\>

No iframe: VIDEO_ID = ID do vídeo, INICIO = segundos inteiros e ORIGEM = encodeURIComponent(location.origin).

### 7.2 Primeiro play (regra de segurança)

- Até o primeiro estado 1 (tocando) ou 3 (carregando), a camada de gestos fica com pointer-events: none, para o toque chegar ao botão de play do próprio YouTube.

- Mostrar também um botão grande **▶ Tocar** que chama tocar().

- Se vier onAutoplayBlocked, ou se o estado continuar −1 ou 5 por 1,5 s depois do toque, esconder o botão nosso e mostrar “Toque no vídeo para começar”. O usuário toca no play do YouTube.

- Depois do primeiro estado 1, ligar a camada de gestos (pointer-events: auto) e deixar assim.

### 7.3 Relógio

A IFrame API conversa com o iframe por mensagens; o valor de getCurrentTime() pode chegar atrasado. Por isso o tempo é interpolado:

- Guardar ultimoTempo (o último valor diferente lido) e marca (performance.now() quando ele mudou).

- Se o estado for 1, tempo() = ultimoTempo + (performance.now() − marca) / 1000 × velocidade, limitado a no máximo ultimoTempo + 0,5. Nos outros estados, tempo() = getCurrentTime().

- Depois de irPara(x), fixar ultimoTempo = x e marca = agora.

- Laço com requestAnimationFrame enquanto a aba está visível. A cada quadro: calcular a fala atual (6.3), atualizar a tela **só quando o índice mudar**, checar pausa automática e repetição.

### 7.4 Navegação entre falas

Regras exatas, usando falaNoTempo:

| Situação do tempo atual        | Voltar fala                           | Repetir fala | Avançar fala                      |
|--------------------------------|---------------------------------------|--------------|-----------------------------------|
| Dentro da fala c               | início de c−1 (se c = 0, início de 0) | início de c  | início de c+1                     |
| No intervalo vazio depois de c | início de c                           | início de c  | início de c+1                     |
| Antes da primeira fala         | início de 0                           | início de 0  | início de 0                       |
| Na última fala ou depois       | normal                                | normal       | não faz nada; aviso “Última fala” |

- **Toques e arrastos rápidos em sequência:** guardar o índice de destino da última navegação por 800 ms. Dentro desse prazo, a próxima navegação parte desse índice, e não do tempo do player (que ainda pode estar atrasado). Três arrastos rápidos para a esquerda voltam exatamente três falas.

- **Pré-rolagem:** o destino é início da fala − pré-rolagem, nunca abaixo de 0 s. Padrão: 0,15 s para falas originais e 0,30 s para frases montadas pelo modo frases, cujo início é estimado. As duas são ajustáveis de 0 a 0,5 s. Isso evita cortar a primeira sílaba.

- **Tocar ao navegar** (padrão: ligado): se estava pausado, chamar tocar() depois de irPara(). Desligado: mantém o estado.

- Ao navegar, zerar a marca de “já pausei nesta fala” da pausa automática.

### 7.5 Pausa automática e repetição

- **Pausa automática no fim de cada fala:** com o estado 1 e tempo() ≥ fim da fala − antecedência (padrão 0,10 s, ajustável de 0 a 0,3 s), pausar uma vez por fala. Ao tocar de novo, segue para a próxima.

- **Repetir a fala em loop:** quando tempo() ≥ fim − 0,05, voltar para início − pré-rolagem. Contador de vezes: 1, 2, 3, 5 ou ∞ (padrão ∞). Ao completar, desligar o loop e seguir. Pausa entre repetições: 0, 0,5, 1 ou 2 s (padrão 0).

- Com loop e pausa automática ligados ao mesmo tempo, o loop manda; a pausa automática age só quando o contador acaba.

- **Repetir trecho A–B:** marcar a fala inicial e a final na lista de falas (botões “A” e “B”) e repetir de A até o fim de B. Botão para limpar.

### 7.6 Velocidade

Mostrar somente os valores de getAvailablePlaybackRates() (normalmente 0,25 a 2). Destacar o valor confirmado pelo evento onPlaybackRateChange, não o pedido. Guardar a última velocidade e reaplicar ao abrir outro vídeo.

### 7.7 Erros do player

| Código    | Mensagem ao usuário                                                                                                              |
|-----------|----------------------------------------------------------------------------------------------------------------------------------|
| 2         | Link inválido. Confira o endereço do vídeo.                                                                                      |
| 5         | O navegador não conseguiu tocar este vídeo. Tente recarregar a página.                                                           |
| 100       | Vídeo não encontrado: foi removido ou é privado.                                                                                 |
| 101 e 150 | O dono do vídeo não permite tocar fora do YouTube. Mostrar também o botão “Abrir no YouTube”.                                    |
| 153       | O YouTube recusou o player por falta de identificação do site. Abra pelo endereço do GitHub Pages, não pelo arquivo no aparelho. |
| outro     | Erro do YouTube (código N). Tente recarregar.                                                                                    |

### 7.8 Título, tela cheia e tela ligada

- **Título:** player.getVideoData().title (não documentado, em try/catch). Se vier vazio, usar “Vídeo ” + ID. O usuário pode renomear na biblioteca.

- **Tela cheia:** chamar requestFullscreen({navigationUI: 'hide'}) no **contêiner do vídeo da página**, nunca no iframe (as legendas ficariam de fora). Depois, screen.orientation.lock('landscape') com .catch(() =\> {}). Ao sair, screen.orientation.unlock(). Só dentro de um evento de clique ou toque.

- **Tela sempre ligada:** navigator.wakeLock.request('screen') enquanto toca; soltar ao pausar; pedir de novo no visibilitychange quando a aba voltar e o vídeo estiver tocando. Tudo em try/catch.

## 8. Layout e interface

São duas telas, **Biblioteca** (início) e **Assistir**, mais um painel de **Ajustes** que desliza de baixo. A navegação entre telas usa \#biblioteca e \#assistir no endereço, e o botão voltar do Android volta da tela Assistir para a Biblioteca.

Visual: tema escuro (fundo \#111111, texto \#FFFFFF), fonte system-ui, alvos de toque com pelo menos 48 × 48 px, respeitar env(safe-area-inset-\*) e usar viewport-fit=cover. Toda a interface em português com acentos.

### 8.1 Biblioteca

De cima para baixo:

1.  Campo **Link do vídeo do YouTube** com botão **Colar** (navigator.clipboard.readText() em try/catch; se falhar, o usuário cola manualmente).

2.  Os dois botões de arquivo da seção 5.2 e o botão ⇅ Trocar.

3.  Botão grande **Abrir vídeo**, ativo só com link válido e legenda estudada lida.

4.  Lista **Continuar assistindo**: miniatura (https://i.ytimg.com/vi/ID/mqdefault.jpg), título, posição salva (“parou em 12:34”) e data. Tocar abre o vídeo no ponto salvo, com as legendas guardadas. Menu ⋮ em cada item: **Renomear**, **Trocar legendas**, **Apagar** (com confirmação feita na própria página).

5.  Rodapé: **Exportar biblioteca**, **Importar biblioteca** e um link “Como baixar legendas no DownSub”, que abre uma ajuda passo a passo dentro da página (seção 9.4).

### 8.2 Assistir — celular em pé (largura menor que 900 px)

De cima para baixo:

| Bloco                | Conteúdo                                                                                                                                                                                              |
|----------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Barra superior       | ← Biblioteca, título do vídeo (cortado com “…”), botão ⚙ Ajustes.                                                                                                                                     |
| Vídeo 16:9           | Iframe, camada de gestos por cima (transparente) e legendas sobre o vídeo (desligadas por padrão em pé, porque a caixa abaixo já mostra).                                                             |
| Barra de progresso   | Tempo atual / duração (mm:ss ou h:mm:ss). Arrastar a bolinha muda o tempo: durante o arraste, seekTo(x, false); ao soltar, seekTo(x, true).                                                           |
| Caixa de legenda     | Linha 1 (idioma estudado) grande e branca; linha 2 (tradução) menor e âmbar \#FFD54F. Altura mínima para 2 linhas de cada, para a tela não pular. Aceita arrastar para voltar ou avançar.             |
| Controles principais | ⏮ Voltar fala, ↻ Repetir fala, ▶/⏸, Avançar fala ⏭. Botões grandes.                                                                                                                                   |
| Controles de estudo  | Velocidade, Pausa automática (liga/desliga), Loop da fala (liga/desliga), Linha 1 (visível/borrada/oculta), Linha 2 (visível/borrada/oculta), − 5 s e + 5 s. Faixa com rolagem lateral se não couber. |
| Lista de falas       | Ocupa o resto da tela, com rolagem. Cada item: tempo, linha 1 e linha 2. A fala atual fica destacada e centralizada sozinha.                                                                          |

**Detalhes da lista de falas:**

- Tocar num item vai para o início dele.

- Se o usuário rolar a lista com o dedo, a centralização automática para por 5 s e aparece o botão **↧ Voltar à fala atual**.

- Campo de busca no topo da lista: filtra pelo texto das duas linhas, sem diferenciar maiúsculas nem acentos.

- Em listas com mais de 500 falas, desenhar só as visíveis mais uma margem (lista virtual), para não travar o celular.

### 8.3 Assistir — celular deitado e tela cheia

- O vídeo ocupa a tela e as legendas aparecem **sobre o vídeo**, na parte de baixo, com fundo semitransparente.

- Controles principais e barra de progresso numa faixa na parte de baixo. Ela aparece a cada toque e some depois de 3 s tocando. Pausado, fica visível.

- Lista de falas escondida. Botão ☰ abre a lista como painel lateral.

### 8.4 Assistir — notebook (largura de 900 px ou mais)

Duas colunas. Esquerda (cerca de 65%): vídeo, barra de progresso, caixa de legenda e controles. Direita: lista de falas com altura da tela.

### 8.5 Regras de exibição das legendas

- Cada linha tem três modos: **Visível**, **Borrada** (filter: blur(6px); tocar na linha revela até a próxima fala) e **Oculta**.

- Opção **Tradução só quando pausado** (padrão: desligada).

- Opção **Inverter ordem** (tradução em cima).

- Legendas sobre o vídeo: posição embaixo ou em cima; opacidade do fundo de 0 a 100% (padrão 60%).

- Tamanho da fonte separado por linha: 14 a 40 px. Padrão: 22 px na linha 1 e 18 px na linha 2.

- Texto longo quebra em várias linhas; nunca cortar com “…”.

## 9. Controles e recursos completos

Esta é a lista fechada do que o app faz. Nada a mais, nada a menos. As regras de cada item estão nas seções indicadas.

### 9.1 Reprodução e navegação

| Recurso                          | Onde fica                                       | Padrão                         | Seção   |
|----------------------------------|-------------------------------------------------|--------------------------------|---------|
| Tocar e pausar                   | Botão ▶/⏸, toque no vídeo, tecla Espaço         | —                              | 10      |
| Voltar uma fala                  | Botão ⏮, arrastar para a esquerda, tecla ←      | —                              | 7.4, 10 |
| Avançar uma fala                 | Botão ⏭, arrastar para a direita, tecla →       | —                              | 7.4, 10 |
| Repetir a fala atual             | Botão ↻, pressionar e segurar no vídeo, tecla R | —                              | 7.4, 10 |
| Ir a uma fala da lista           | Toque no item                                   | —                              | 8.2     |
| Pular 5 s                        | Botões − 5 s e + 5 s, Shift + ←/→               | —                              | 10      |
| Barra de progresso               | Arrastar                                        | —                              | 8.2     |
| Tocar ao navegar                 | Ajustes                                         | Ligado                         | 7.4     |
| Pré-rolagem antes da fala        | Ajustes, 0 a 0,5 s                              | 0,15 s (0,30 s no modo frases) | 7.4     |
| Velocidade                       | Botão de velocidade, teclas \[ e \]             | 1× (lembra a última)           | 7.6     |
| Tela cheia com giro para deitado | Botão ⛶, tecla F                                | —                              | 7.8     |
| Tela sempre ligada enquanto toca | Automático                                      | Ligado                         | 7.8     |
| Continuar de onde parou          | Automático, salva a cada 5 s                    | Ligado                         | 11      |

### 9.2 Estudo com as legendas

| Recurso                                  | Onde fica                                | Padrão               | Seção |
|------------------------------------------|------------------------------------------|----------------------|-------|
| Pausa automática no fim de cada fala     | Botão, tecla P                           | Desligado            | 7.5   |
| Antecedência da pausa automática         | Ajustes, 0 a 0,3 s                       | 0,10 s               | 7.5   |
| Loop da fala atual                       | Botão, tecla L                           | Desligado            | 7.5   |
| Número de repetições do loop             | Ajustes: 1, 2, 3, 5, ∞                   | ∞                    | 7.5   |
| Pausa entre repetições                   | Ajustes: 0; 0,5; 1; 2 s                  | 0                    | 7.5   |
| Repetir trecho A–B                       | Botões A e B na lista de falas           | —                    | 7.5   |
| Linha 1: visível, borrada ou oculta      | Botão, tecla 1                           | Visível              | 8.5   |
| Linha 2: visível, borrada ou oculta      | Botão, tecla 2                           | Visível              | 8.5   |
| Tradução só quando pausado               | Ajustes                                  | Desligado            | 8.5   |
| Inverter ordem das linhas                | Ajustes                                  | Desligado            | 8.5   |
| Manter a última fala na tela entre falas | Ajustes                                  | Ligado               | 6.3   |
| Modo frases                              | Ajustes: Desligado, Ligado, Automático   | Automático           | 6.2   |
| Esconder marcações de som (\[Music\])    | Ajustes                                  | Desligado            | 5.3   |
| Sincronia da legenda estudada            | Ajustes: −0,5; −0,1; +0,1; +0,5 s; Zerar | 0 s, salvo por vídeo | 6     |
| Sincronia da tradução                    | Igual ao anterior                        | 0 s, salvo por vídeo | 6     |
| Busca na lista de falas                  | Campo no topo da lista                   | —                    | 8.2   |
| Tocar numa palavra                       | Caixa de legenda, linha 1                | —                    | 9.3   |

### 9.3 Toque numa palavra

- Tocar numa palavra da linha 1 **na caixa de legenda** pausa o vídeo e abre um cartão pequeno com a palavra.

- Botões do cartão: **Traduzir palavra** e **Traduzir frase** (links para https://translate.google.com/?sl=IDIOMA&tl=pt&text=TEXTO&op=translate, com encodeURIComponent, abrindo em nova aba), **Copiar palavra** e **Copiar frase** (navigator.clipboard.writeText, em try/catch).

- IDIOMA vem do ajuste **Idioma que estou estudando** (lista: Inglês en, Francês fr, Espanhol es, Italiano it, Alemão de, Outro = auto). Padrão: Inglês.

- As palavras são separadas por espaço e a pontuação das pontas é removida. Apóstrofo e hífen ficam (“don't”, “peut-être”).

- Fechar o cartão: tocar fora ou no ✕. O vídeo continua pausado.

- Linha borrada: o primeiro toque só revela; não abre o cartão.

### 9.4 Ajuda “Como baixar legendas no DownSub”

Texto da ajuda dentro do app, passo a passo, marcado como “pode mudar se o site mudar”:

1.  No app do YouTube, toque em **Compartilhar** → **Copiar link**.

2.  No Chrome, abra **downsub.com**, cole o link no campo do topo e toque no **botão verde com a seta para baixo**. Se aparecer “Verifique se você é humano”, marque a caixa.

3.  Aparece o título do vídeo e, logo abaixo, a **lista das legendas que o vídeo tem**. Cada linha tem os botões **SRT**, **VTT**, **TXT**, **RAW** e um lápis, e o nome do idioma.

4.  Na linha do idioma falado no vídeo (por exemplo **English** ou **English (auto-generated)**), toque em **SRT**.

5.  Para o português: se nessa primeira lista houver **Portuguese**, **Portuguese (Brazil)** ou **Portuguese (Portugal)**, toque em **SRT** nela. Se não houver, desça até a parte **Auto-translate from**, deixe **Default** e toque em **SRT** na linha **Portuguese**. Essa é a tradução automática do YouTube, grátis.

6.  Não use **Download Full Video With Subtitle**, **Translate with AI** (pago), **Bilingual (Dual subtitles)** nem os anúncios. O Legenda Dupla já junta as duas legendas.

7.  Volte ao Legenda Dupla, cole o link e escolha os dois arquivos. Eles ficam em **Downloads** com nomes como \[English\] Título do vídeo \[DownSub.com\].srt e \[Portuguese\] Título do vídeo \[DownSub.com\].srt.

**Conferência (prints do usuário, 21/11/2026):**

- Confirmados: o botão verde com seta, os botões SRT, VTT, TXT e RAW, e a seção “Auto-translate from”.

- Nome real de um arquivo baixado: \[English (auto-generated)\] Hype or reality Inside Anthropic’s \$1 trillion US IPO The Current \[DownSub.com\].srt. O DownSub tira do título caracteres como ? e \|.

- \[Não confirmado: o rótulo exato do arquivo da tradução automática, provavelmente \[Portuguese\].\]

- Se o site mudar, o usuário manda prints novos e a LLM atualiza só esta ajuda.

### 9.5 Outros ajustes (painel ⚙ Ajustes)

| Ajuste                                        | Opções                                             | Padrão    | Seção |
|-----------------------------------------------|----------------------------------------------------|-----------|-------|
| Idioma que estou estudando                    | Inglês, Francês, Espanhol, Italiano, Alemão, Outro | Inglês    | 9.3   |
| Inverter direção do arraste                   | Liga/desliga                                       | Desligado | 10    |
| Legendas sobre o vídeo com o celular em pé    | Liga/desliga                                       | Desligado | 8.2   |
| Posição das legendas sobre o vídeo            | Embaixo, em cima                                   | Embaixo   | 8.5   |
| Opacidade do fundo das legendas sobre o vídeo | 0 a 100%                                           | 60%       | 8.5   |
| Tamanho da fonte da linha 1                   | 14 a 40 px                                         | 22 px     | 8.5   |
| Tamanho da fonte da linha 2                   | 14 a 40 px                                         | 18 px     | 8.5   |
| Restaurar padrões                             | Botão, com confirmação na própria página           | —         | —     |

Todos os ajustes desta seção e de 9.1 e 9.2 (menos a sincronia, que é por vídeo) ficam em ld.ajustes e valem para todos os vídeos.

## 10. Gestos e atalhos de teclado

Arrastar o dedo na horizontal é o jeito principal de navegar: **para a esquerda volta uma fala, para a direita avança uma fala**. A opção **Inverter direção do arraste** (Ajustes, padrão desligada) troca os lados.

### 10.1 Onde os gestos funcionam

| Área                               | Arrastar na horizontal     | Toque curto                                                                                       | Pressionar e segurar (500 ms) |
|------------------------------------|----------------------------|---------------------------------------------------------------------------------------------------|-------------------------------|
| Camada sobre o vídeo, em pé        | Voltar ou avançar fala     | Tocar/pausar                                                                                      | Repetir a fala atual          |
| Camada sobre o vídeo, tela cheia   | Voltar ou avançar fala     | Faixa de controles escondida: só mostra a faixa. Faixa visível: tocar/pausar                      | Repetir a fala atual          |
| Caixa de legenda (abaixo do vídeo) | Voltar ou avançar fala     | Numa palavra da linha 1: cartão da palavra (9.3). Numa linha borrada: revela. Fora do texto: nada | Nada                          |
| Lista de falas                     | Nada (só rolagem vertical) | Ir para a fala                                                                                    | Nada                          |

A camada de gestos só fica ativa depois do primeiro play (7.2).

### 10.2 Detecção (módulo gestos.js)

Usar **Pointer Events**, que cobrem dedo, mouse e caneta. Assim o arraste com o mouse no notebook também funciona.

1.  pointerdown: guardar x, y e o instante; chamar setPointerCapture; iniciar o temporizador de 500 ms para “pressionar e segurar”.

2.  pointermove: se o dedo andou mais de 10 px, cancelar o “segurar”.

3.  pointerup: calcular dx, dy e a duração. Classificar nesta ordem:

    1.  **Arraste**: \|dx\| ≥ max(40 px, 8% da largura da área), \|dx\| ≥ 1,5 × \|dy\| e duração ≤ 800 ms. dx \< 0 = esquerda = voltar; dx \> 0 = direita = avançar (salvo se a direção estiver invertida).

    2.  **Segurar**: o temporizador de 500 ms já disparou (a ação acontece no disparo, não no pointerup).

    3.  **Toque**: andou menos de 10 px e durou menos de 350 ms.

    4.  Qualquer outra coisa: ignorar.

4.  pointercancel: cancelar tudo.

CSS obrigatório: touch-action: none na camada sobre o vídeo e touch-action: pan-y na caixa de legenda (a rolagem vertical da página continua funcionando ali). user-select: none nas duas áreas. O toque executa na hora, sem esperar duplo toque.

**Retorno visual e tátil:** ao voltar ou avançar, mostrar por 500 ms uma seta grande translúcida com o texto “◀ Fala anterior” ou “Próxima fala ▶”. Ao repetir, “↻ Repetindo”. Vibrar 15 ms com navigator.vibrate?.(15) em try/catch.

### 10.3 Atalhos de teclado (notebook)

Ignorar atalhos quando o foco estiver num campo de texto. Chamar preventDefault() nas teclas usadas, para a página não rolar.

| Tecla                 | Ação                                                              |
|-----------------------|-------------------------------------------------------------------|
| Espaço                | Tocar/pausar                                                      |
| ←                     | Voltar uma fala                                                   |
| →                     | Avançar uma fala                                                  |
| R ou ↓                | Repetir a fala atual                                              |
| Shift + ← / Shift + → | − 5 s / + 5 s                                                     |
| P                     | Pausa automática liga/desliga                                     |
| L                     | Loop da fala liga/desliga                                         |
| 1 / 2                 | Alternar o modo da linha 1 / linha 2 (visível → borrada → oculta) |
| \[ / \]               | Velocidade menor / maior                                          |
| F                     | Tela cheia liga/desliga                                           |

As setas ← e → do teclado não são afetadas pela opção de inverter o arraste.

## 11. Armazenamento, biblioteca e backup

Tudo fica só no navegador de cada aparelho: o celular e o notebook têm bibliotecas separadas. Para passar de um para o outro, usar Exportar e Importar.

### 11.1 Onde guardar

| O quê                      | Onde                                                                    | Chave                                 |
|----------------------------|-------------------------------------------------------------------------|---------------------------------------|
| Vídeos, legendas e posição | IndexedDB, banco legenda-dupla versão 1, store videos com keyPath: "id" | ID do vídeo                           |
| Ajustes gerais             | localStorage                                                            | ld.ajustes (JSON com campo versao: 1) |

Registro de cada vídeo na store videos:

{  
"id": "arj7oStGLkU",  
"titulo": "Inside the Mind of a Master Procrastinator \| Tim Urban \| TED",  
"criadoEm": "2026-11-21T20:00:00.000Z",  
"abertoEm": "2026-11-21T20:30:00.000Z",  
"posicao": 754.2,  
"estudo": {  
"arquivo": "\[English\] Título do vídeo \[DownSub.com\].srt",  
"falas": \[{ "s": 12.645, "e": 14.015, "t": "So in college," }\]  
},  
"traducao": {  
"arquivo": "\[Portuguese (Brazil)\] Título do vídeo \[DownSub.com\].srt",  
"falas": \[{ "s": 12.645, "e": 14.015, "t": "Na faculdade," }\]  
},  
"ajusteEstudo": 0,  
"ajusteTraducao": 0  
}

- Guardar as **falas já lidas e limpas** (seção 5.3), sem ajuste de sincronia aplicado, sem modo frases e sem pareamento. Isso é recalculado ao abrir. Assim uma melhoria futura no algoritmo vale também para vídeos antigos.

- traducao pode ser null.

- Salvar posicao a cada 5 s tocando, ao pausar, ao sair da tela e no visibilitychange para oculto.

- Ao abrir um vídeo da biblioteca, começar em max(0, posicao − 2).

- Abrir o mesmo ID com arquivos novos substitui as legendas, mas mantém posição e título.

### 11.2 Robustez

- Todo acesso a IndexedDB e localStorage fica em try/catch. Se o IndexedDB não abrir, o app funciona só na memória e mostra “O navegador não deixou salvar. O vídeo funciona, mas não ficará na biblioteca.”

- Na primeira gravação, chamar navigator.storage.persist() (em try/catch), para o Chrome não apagar os dados quando faltar espaço.

- Ajustes sem versao ou com versão desconhecida: misturar com os padrões, sem quebrar.

### 11.3 Exportar e importar

- **Exportar biblioteca:** gera um arquivo legenda-dupla-backup-AAAA-MM-DD.json em UTF-8 com {versao: 1, exportadoEm, ajustes, videos: \[...\]}. Baixar com Blob e um link com atributo download (funciona no GitHub Pages).

- **Importar biblioteca:** escolher o arquivo .json, validar versao e a forma dos registros, e mesclar. Se o ID já existir, manter o registro com abertoEm mais recente. Mostrar o resumo: “Importados 12 vídeos, 3 já existiam.”

- Ajustes importados só substituem os atuais se o usuário marcar a caixa “Também importar ajustes”.

## 12. Testes e critérios de aceite

Nada vai para a branch main sem os testes automáticos passando. O teste com YouTube real só pode ser feito pelo usuário (R12).

### 12.1 Testes de lógica (node --test tests/)

Criar os arquivos de exemplo em tests/fixtures/ à mão, cobrindo:

| Caso                                                                             | O que conferir                                                                                         |
|----------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------|
| SRT normal                                                                       | Número de falas, tempos com 3 casas, texto.                                                            |
| SRT com BOM e quebras \r\n                                                       | Igual ao normal.                                                                                       |
| SRT sem os números das falas                                                     | Lê pelas linhas de tempo.                                                                              |
| SRT com milissegundos com ponto e com 1 ou 2 dígitos                             | 00:00:01.5 = 1,500 s.                                                                                  |
| SRT em Windows-1252 com “ação” e “não”                                           | Acentos corretos depois de decodificar.                                                                |
| SRT com \<i\>, \<font\>, {\an8} e &amp;                                          | Texto limpo.                                                                                           |
| VTT com cabeçalho, NOTE, STYLE e configurações depois do tempo                   | Ignora tudo isso.                                                                                      |
| VTT automático do YouTube com \<c\>, tempos internos e texto repetido em rolagem | Sem repetição e sem tags.                                                                              |
| Falas sobrepostas e fim menor que início                                         | Corrigidas conforme 5.3.                                                                               |
| Arquivo vazio e arquivo que não é legenda                                        | Erro amigável, sem exceção solta.                                                                      |
| Pareamento com tempos iguais                                                     | Um para um.                                                                                            |
| Pareamento com cortes diferentes                                                 | Duas traduções numa unidade; uma tradução longa vai só para a unidade de maior sobreposição.           |
| Pareamento com ajuste de sincronia                                               | Deslocamento aplicado antes.                                                                           |
| Modo frases com e sem pontuação                                                  | Regras de 6.2: corte no ponto final, abreviações preservadas, \>\> e limites de 15 s e 220 caracteres. |
| falaNoTempo                                                                      | Antes da primeira, dentro, no intervalo vazio, depois da última.                                       |
| Navegação                                                                        | Tabela de 7.4 inteira, mais três “voltar” seguidos dentro de 800 ms.                                   |
| lerLink                                                                          | Todos os formatos de 5.1, texto compartilhado com link no meio, t=1m30s, link inválido.                |
| Pareamento e modo frases com 4.000 falas                                         | Menos de 100 ms.                                                                                       |

Casos obrigatórios a mais, com arquivos sintéticos no formato real de 5.4:

- **Automática estilo DownSub:** falas contíguas de cerca de 2 s, frase terminando no meio da fala, \>\> e \[clears throat\]. Conferir: detecção automática liga o modo frases; frases cortadas no ponto final; \>\> fecha frase e some; nenhuma frase passa de 15 s ou 220 caracteres; tempos estimados por palavra entre o início e o fim da fala original.

- **Manual estilo TED:** falas em duas linhas, intervalos de 25 ms, (Laughter) como fala inteira e \[Nope!\] no texto. Conferir: modo frases fica desligado no Automático; ligado manualmente, (Laughter) continua sozinha; a opção de esconder marcações some com (Laughter) e mantém \[Nope!\].

- **Tradução pareada por palavra** com o modo frases ligado: um pedaço traduzido que cobre o fim de uma frase e o começo da outra é dividido entre as duas.

- **Arquivo sem linha vazia no fim:** a última fala é lida.

### 12.2 Testes da interface (Playwright para Python + Chromium)

Conferido nesta sessão: o Playwright para Python abriu o Chromium em modo headless no ambiente do Claude Code. Na nova sessão, instalar com pip install --break-system-packages playwright e python3 -m playwright install chromium. Se o Chromium não instalar, usar executable_path="/usr/bin/google-chrome", que existia no ambiente.

Arquivo tests/e2e_test.py, servindo o site com python3 -m http.server e abrindo http://localhost:8000/?mock=1:

1.  Carregar link e os dois arquivos de exemplo com set_input_files; abrir o vídeo.

2.  Tocar; esperar a fala 0 aparecer na caixa com as duas linhas.

3.  Simular arraste para a esquerda e para a direita com page.mouse.down, move em passos e up sobre a camada do vídeo e sobre a caixa de legenda. Conferir o índice da fala.

4.  Simular toque curto (play/pausa) e segurar 600 ms (repetir).

5.  Teclas Espaço, ←, →, R, P, L, 1, 2, \[ e \].

6.  Pausa automática: com o player falso, conferir que pausa no fim da fala.

7.  Loop com contador 2: a fala toca duas vezes e segue.

8.  Recarregar a página: vídeo na biblioteca, posição e ajustes mantidos.

9.  Exportar e importar a biblioteca.

10. Capturas de tela em 384 × 854 e 412 × 915 (celular em pé), 915 × 412 (deitado) e 1366 × 768 (notebook). **A LLM deve abrir e olhar cada captura** e corrigir sobreposição, texto cortado ou botão fora da tela.

Tela cheia, giro de tela, vibração e tela sempre ligada não são testáveis em modo headless. Conferir que as chamadas existem e estão em try/catch.

### 12.3 Aceite pelo usuário (no S23 Ultra e no notebook)

- [ ] O site abre pelo endereço do GitHub Pages e instala na tela inicial.

- [ ] Um vídeo real toca sem erro 153.

- [ ] As duas legendas aparecem sincronizadas.

- [ ] Arrastar para a esquerda volta uma fala; para a direita avança uma fala, sobre o vídeo e sobre a caixa de legenda.

- [ ] Pausa automática, loop, velocidade e borrar linha funcionam.

- [ ] Tela cheia gira para deitado e mostra as legendas sobre o vídeo.

- [ ] Compartilhar do app do YouTube para o Legenda Dupla preenche o link.

- [ ] Fechar e abrir de novo continua de onde parou.

- [ ] Todos os textos têm acentos corretos.

- [ ] Atalhos de teclado funcionam no notebook.

## 13. Fora do escopo e limitações conhecidas

**Fora do escopo** (não fazer, mesmo que pareça fácil):

- Baixar legendas automaticamente por qualquer meio (decisão da seção 1; caminhos testados na R3).

- Lista de vocabulário, flashcards, dicionário embutido, leitura em voz alta, IA, contas, sincronização entre aparelhos, playlists, comentários e anúncios dentro do app.

- Bibliotecas externas (React, Vue, jQuery, Tailwind etc.) e qualquer etapa de build.

- Tocar vídeos fora do YouTube.

**Limitações que o app não tem como resolver** (explicar ao usuário quando aparecerem; não tentar contornar):

| Limitação                                                   | Causa                                                                              |
|-------------------------------------------------------------|------------------------------------------------------------------------------------|
| Alguns vídeos não tocam no app                              | O dono proibiu o player embutido (erros 101 e 150).                                |
| Aparecem vídeos relacionados ao pausar ou no fim            | O YouTube não permite desligar (R4).                                               |
| Pode haver anúncios                                         | Controlados pelo YouTube. Durante anúncio, as legendas podem não bater.            |
| Pular de fala pode começar um pouco antes                   | Quadro-chave do vídeo quando o trecho não está carregado (R6).                     |
| A legenda do próprio YouTube pode aparecer junto            | Não há parâmetro oficial para desligar (R5).                                       |
| O áudio para com a tela desligada ou o app em segundo plano | Comportamento do player embutido no navegador.                                     |
| Biblioteca não passa sozinha do celular para o notebook     | Dados ficam no navegador; usar Exportar/Importar.                                  |
| O app pode quebrar se o YouTube mudar o player              | Depende de recursos não documentados (unloadModule, getVideoData) e da IFrame API. |

## 14. Ordem de execução para a nova sessão

### 14.1 Texto para o usuário colar na nova sessão

Antes, exportar este documento: menu **▾** ao lado do título → **Exportar** → **Markdown**. Depois, anexar o arquivo .md na nova sessão. Se não conseguir anexar, colar o texto inteiro do documento logo abaixo do pedido.

Construa o projeto Legenda Dupla seguindo EXATAMENTE o plano anexado (PLANO).  
Regras:  
1. Leia o plano inteiro antes de começar e salve-o no repositório como PLANO.md.  
2. Não reabra decisões da seção 1 nem acrescente recursos fora da seção 9.  
3. Se algo do plano se mostrar errado na prática, pare e me explique com a prova, de forma simples.  
4. Toda a interface em português do Brasil, com acentos e cedilha.  
5. Siga a ordem da seção 14.2 e só envie para a main com os testes passando.  
6. No fim, me dê o link do site e o passo a passo para eu testar no celular, sem pular etapas.

### 14.2 Etapas

1.  Ler o plano, salvar como PLANO.md, criar a estrutura de pastas da seção 4 e o .nojekyll.

2.  Escrever legendas.js e tests/legendas.test.mjs juntos (seções 5, 6 e 7.4), até todos os casos de 12.1 passarem.

3.  Escrever player.js: primeiro o player falso, depois o do YouTube (seção 7).

4.  Escrever index.html, app.css e app.js com as duas telas e o painel de ajustes (seções 8 e 9).

5.  Escrever gestos.js e ligar gestos e teclado (seção 10).

6.  Escrever armazenamento.js, biblioteca, exportar e importar (seção 11).

7.  PWA: manifest.webmanifest com share_target, sw.js e os ícones (seções 4 e 5.1).

8.  Rodar os testes de 12.2, olhar todas as capturas de tela e corrigir.

9.  Revisão crítica: se puder, pedir a um subagente que não escreveu o código para conferir o app contra este plano, item por item, e corrigir o que ele achar.

10. Escrever o README.md em português: o que é, como usar, como baixar legendas, como atualizar.

11. Commit e push na main. Ligar o GitHub Pages pela API; se não der, passar ao usuário os passos da seção 3.

12. Entregar ao usuário: o link do site e a lista de 12.3, explicada passo a passo.

### 14.3 Detalhes que costumam dar errado

- **Palavras tocáveis:** desenhar a linha 1 da caixa de legenda com cada palavra num \<span class="palavra"\>. Descobrir a palavra tocada pelo event.target, nunca por seleção de texto.

- **Texto da legenda:** inserir sempre com textContent ou createTextNode, nunca com innerHTML.

- **Desempenho:** atualizar a caixa de legenda e o destaque da lista só quando o índice da fala mudar; atualizar a barra de progresso no máximo 4 vezes por segundo.

- **Camada de gestos e iframe:** antes do primeiro play, a camada não pode capturar toques (7.2). Depois, precisa capturar todos os toques sobre o vídeo.

- **Caminhos relativos** em tudo, por causa da subpasta /legenda-dupla/ (seção 3).

- **Sem alert, confirm ou prompt:** usar diálogos da própria página.

- **Números na tela no padrão brasileiro:** “0,15 s”, “1,25×”. Tempos como “1:05” ou “1:02:05”.

- **Codificação:** \<meta charset="utf-8"\> e todos os arquivos salvos em UTF-8. Conferir acentos nas capturas de tela.

- **Botão voltar do Android** na tela Assistir volta para a Biblioteca (histórico com \#assistir e \#biblioteca), sem sair do app.

- **Nova versão:** ao mudar arquivos, trocar o nome do cache no sw.js (ld-v2, ld-v3…).

## Fontes consultadas

- [YouTube IFrame Player API — referência oficial](https://developers.google.com/youtube/iframe_api_reference) (erros, estados, velocidade, seekTo, autoplay).

- [YouTube Embedded Players — parâmetros oficiais](https://developers.google.com/youtube/player_parameters) (controls, playsinline, rel, cc_load_policy, modestbranding).

- [Erro 153 e Referrer-Policy — Simon Willison](https://til.simonwillison.net/youtube/fixing-153-embed).

- [GitHub Pages — documentação oficial](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages) (disponível em repositório público no plano Free).

- [GitHub Pages e o arquivo .nojekyll](https://docs.github.com/en/articles/about-github-pages).

- Testes feitos nesta conversa em 21/11/2026: leitura das legendas pelo player no Chrome do usuário (funcionou, mas exige o notebook ligado e foi descartada); bloqueio do YouTube e do DownSub no navegador de nuvem; Invidious sem entrega de texto; Playwright com Chromium funcionando no ambiente do Claude Code.


## 15. Mudanças de 22/11/2026 (pedido do usuário)

Estas mudanças substituem o que as seções anteriores dizem sobre controles, lista de falas e ajustes.

1. **Tradução automática.** Quando o vídeo só tem a legenda estudada, cada unidade (fala, ou frase montada) é traduzida sozinha e a tradução fica presa a ela (`js/traducao.js`), então a sincronia é exata. Serviço: `https://translate.googleapis.com/translate_a/t?client=gtx`, POST com vários `q`, que devolve uma tradução por `q` na mesma ordem. Testado em 22/11/2026 a partir do GitHub Pages: responde com CORS liberado. Não é API oficial. A API Translator embutida no Chrome não serve: em 22/11/2026 é só para computador. O resultado fica no registro do vídeo em `traducaoAuto: { para, mapa: { texto: tradução } }` e vai junto no backup. A tradução começa pela fala atual.
2. **Legenda dupla.** Botão para um arquivo com os dois idiomas em cada fala (`lerLegendaDupla` em `js/legendas.js`). Falas com mais de duas linhas são cortadas pelo perfil de palavras de cada lado. O lado mais “português” vira a tradução.
3. **Interface enxuta.** Só o botão tocar/pausar e a barra do tempo; navegar entre falas é por gesto. Saíram: ⏮ ↻ ⏭, −5 s / +5 s, pausa automática, loop, linha 1 / linha 2, lista lateral de falas (com busca e A–B), botão de velocidade (foi para os ajustes). Ajustes que ficaram: velocidade, sincronia, tradução automática (destino e idioma do vídeo), tamanho das letras (a linha 2 usa 85%) e inverter arraste. Os ajustes passaram para a versão 2; o tamanho de letra salvo na versão 1 é ignorado (padrão novo: 19 px).
4. **Botões de estudo (22/11/2026, segundo pedido).** Além do play, só três botões, na linha abaixo da barra do tempo: **Loop** da fala atual (sem limite, segue a fala escolhida por gesto), **A–B** (1º toque marca A na fala da tela, 2º marca B, 3º desliga; um modo de repetição por vez) e **文A**, que abre um menu flutuante com “Mostrar sempre”, “Só quando pausar” e “Desativar” (ajuste `modoTraducao`). Sem tradução na tela, a linha 1 cresce 20% (classe `so-original`).
5. **A–B por toque na legenda.** O botão A–B só inicia a marcação (borda tracejada e aviso na caixa da legenda). O 1º toque na caixa marca A na fala da tela, o 2º marca B; então o vídeo volta para A e toca. Durante a marcação o toque na legenda não abre o cartão da palavra; os gestos de arrastar continuam valendo.
