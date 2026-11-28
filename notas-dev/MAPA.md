# MAPA do projeto — atualizado em 2026-11-28 (commit ba35d8e, app v25)

## Stack, build e testes
- Linguagem/framework: página web em JavaScript puro (módulos ES, sem npm nem bundler), HTML e CSS na raiz; app Android em Java (WebView) na pasta `android/`.
- Onde a página roda: o app NÃO leva a página dentro do APK. `MainActivity` abre `https://hcostamc-sys.github.io/legenda-dupla/` (constante `PAGINA`). Mudança só na página = basta chegar à `main` (o GitHub Pages publica em ~1 min); não precisa de APK novo.
- Gerar APK: workflow `.github/workflows/android.yml`, sozinho a cada push na `main` que mexe em `android/**` (`gradle -p android assembleDebug`). Publica na release `android-prototipo`. Se falhar, o registro vai para a release `android-build-log`. Em branches `voz-*` só compila (APK como artefato de 3 dias). Não há Android SDK garantido no ambiente do Claude: compilação de verdade = Actions.
- Como o Heric baixa e instala o APK novo: no celular, abrir https://github.com/hcostamc-sys/legenda-dupla/releases/download/android-prototipo/legenda-dupla-android.apk → baixar → abrir o arquivo → Instalar (instala por cima, sem desinstalar).
- Assinatura: fixa. `android/app/ld-debug.keystore` (config `signingConfigs.debug` em `android/app/build.gradle`). Cada APK instala por cima e os dados ficam.
- Como a mudança chega à principal: o Claude faz commit e `git push` direto na `main` (é assim desde o início; tem permissão). O Heric não precisa fazer nada.
- Versão do app: `versionCode`/`versionName` em `android/app/build.gradle` (hoje 25 / '0.25') e `VERSAO_APK` em `MainActivity` (hoje 24; a página lê pelo `?apk=` em `APK` de `js/app.js` para saber o que o app sabe fazer). Incrementar os três ao mudar algo em `android/`; a página só confere `APK` quando depende de função nativa nova.
- Cache da página: `CACHE` em `sw.js` (hoje `ld-v34`). Toda mudança em arquivo do site exige trocar o nome (ld-v34…), senão o celular continua com a versão velha.
- Testes automáticos:
  - `node --test` (raiz; `tests/*.test.mjs`, lógica pura; ~1 s, 115 testes);
  - `python3 tests/e2e_test.py` (interface com Playwright + player falso `?mock=1`; instalar com `pip install --break-system-packages playwright` e `python3 -m playwright install chromium`);
  - `python3 tests/youtube_aba_test.py` e `tests/youtube_aba_inicio_test.py` (troca de aba do YouTube);
  - `sh tests/voz_java/rodar.sh` (Java da voz mais clara);
  - Actions: `voz-ci.yml` (modelos de voz de verdade, só em branches `voz-*`), `pontuacao.yml` (modelos de pontuação de verdade).
- Checagem rápida: `node --test` e, para cada arquivo JS mexido, `node --input-type=module --check < js/ARQUIVO.js`. Java: só o Actions compila.
- Documentação longa: `PLANO.md` (seções numeradas por versão; 22 = voz mais clara v24, 23 = limpeza v25) e `README.md`.

## Fluxo do app (da abertura até a legenda na tela)
1. `MainActivity.onCreate` abre a página (`web`) e, por cima, o YouTube móvel (`criarPainelYoutube`, `ytWeb`, com `assets/youtube.js` injetado). Botões nativos: Entrar e Meus vídeos (`abrirMeusVideos` → `window.ldMostrarBiblioteca` em `js/app.js`).
2. Tocar num vídeo no YouTube → `MainActivity.escolherVideo` → `window.ldAbrirDoYoutube` → `abrirVideo` (`js/app.js`).
3. `abrirVideo` cria `PlayerYouTube` (`js/player.js`, iframe embed). O `assets/gancho.js` roda dentro do player, lista as faixas e copia a legenda baixada (`/api/timedtext`) por postMessage → `aoReceberDoGancho`.
4. `escolherLegendaYoutube` → `perguntarIdioma` (janela `#tela-idioma`, "Legendas do vídeo", botão Começar) → `pedirFaixa` → `aoReceberLegenda` → `aplicarLegendaYoutube` (lê com `lerTimedText` de `js/timedtext.js`).
5. `processar` (`js/legendas.js`) monta as frases; pontuação por modelo opcional (`pontuarComModelo`, `js/modelos.js` + Web Worker `js/pontuador-worker.js`); tradução automática (`iniciarTraducaoAuto` → `traduzirTodos`, `js/traducao.js`).
6. `iniciarLaco` → `tique` (a cada quadro) → `renderLegenda`/`atualizarProgresso`/`salvarPosicao`. Gestos na caixa e no vídeo (`ligarGestos`, `js/gestos.js`) → `navegarAcao`, `acelerarSegurando`.
7. Voz mais clara (opcional): página pede ao app (`mandarAoApp({acao:'voz'…})`), `ServicoVoz.java` baixa o áudio, separa, limpa e mixa; a página toca o mix num `<audio>` sincronizado (`criarVoz` em `js/voz.js`).

## Módulos
| Arquivo | Responsabilidade | Símbolos-chave |
|---|---|---|
| `index.html` | Todas as telas e janelas (sem lógica) | `#tela-biblioteca` (Meus vídeos), `#tela-assistir`, `#barra-topo`, `#btn-tela-cheia`, `#aviso-rede`, `#painel-ajustes`, `#grupo-sincronia`, `#grupo-voz`, `#voz-modelo`, `#tela-idioma`, `#tela-carregando`, `#carregando-roda`, `#tela-gestos`, `#tela-ab` |
| `css/app.css` (1776) | Aparência de tudo | classes das telas acima (`.roda`, `.aviso-rede`, `.barra-topo`, `.pm-bloco`) |
| `js/app.js` (4426) | Estado, telas, eventos; liga todos os módulos | por seção (comentários `// ====`): estado `ajustesIniciais`, `S`; utilidades `toast`, `selo`, `dialogo`; biblioteca `renderBiblioteca`, `apagar`; telas `trocarTela`, `mostrarBiblioteca`; abrir/fechar `abrirVideo`, `fecharVideo`, `mostrarPreparandoVideo`; legenda do YouTube `escolherLegendaYoutube`, `perguntarIdioma`, `mostrarCarregando`, `cancelarCarregando`, `aplicarLegendaYoutube`; pacotes `baixarPacoteUI`, `baixarPacoteNativo`, `desenharPacote`, `atualizarCartaoPontuacao`; primeiro play `aoMudarEstado`; rede `atualizarAvisoRede`, `conferirRede`, `recarregarPlayer`, `recuperarRede`, `aoMudarRede`; laço `tique`, `irParaIndice`, `renderLegenda`, `atualizarProgresso`, `salvarPosicao`; repetição `logicaRepeticao`, `alternarLoop`, `abrirTelaAB`; tradução `abrirMenuTraducao`, `definirModoTraducao`; navegação `navegarAcao`; segurar 2× `acelerarSegurando`, `soltarAceleracao`; velocidade/folga `montarVelocidades`, `montarFolgas`; cartão da palavra `mostrarSignificado`, `buscarSignificado`, `abrirCartao`, `fecharCartao`; gestos `toqueNoVideo`, `toqueNaCaixa`; tela cheia `atualizarImersivo`, `alternarTelaCheia`; ajustes `sincronizarPainel`, `aoMudarAjuste`, `ajustarSincronia`, `restaurarAjustesPadrao`; ligação `ligarEventos` (onde `ligarGestos` é chamado), `iniciar` |
| `js/legendas.js` (1403) | PURO: lê SRT/VTT, monta frases, pareia tradução, navegação e folga | `processar`, `montarFrases`, `falaNoTempo`, `navegar`, `tempoDestino`, `tempoDestinoFolga`, `FOLGAS_MAX`, `FOLGA_MAX_PADRAO`, `formatarTempo` |
| `js/player.js` (667) | Adaptador do player: `PlayerYouTube` (iframe) e `PlayerFalso` (`?mock=1`, testes) | `carregar`, `_ler` (espera o ponto salvo antes de mostrar o vídeo), `revelar`, `tempo`, `irPara`, `tocar`, `pausar`, `duracao`, `criarPlayer` |
| `js/gestos.js` (96) | Toque, arraste e segurar (Pointer Events) | `ligarGestos`, `TEMPO_SEGURAR` (500 ms) |
| `js/traducao.js` (170) | Tradução automática das falas e significado de palavra (Google Tradutor `translate_a`) | `traduzirTodos`, `traduzirLote`, `significadoPalavra`, `lerSignificado` |
| `js/armazenamento.js` (265) | IndexedDB (vídeos) e localStorage (ajustes) | `AJUSTES_PADRAO`, `OPCOES` (interno), `misturarAjustes`, `carregarAjustes`, `salvarAjustes`, `salvarVideo`, `obterVideo`, `listarVideos`, `apagarVideo` |
| `js/voz.js` (614) | Voz mais clara do lado da página: Ajustes, selo, sincronia do áudio tratado | `MARGENS`, `LIMPEZAS`, `BYTES_MODELO`, `descreverVideo`, `criarVoz`, `decidirSincronia` |
| `js/modelos.js` (274) | Pacotes de pontuação melhorada (download, cache, uso) | `estadoPacote`, `baixarPacote`, `apagarPacote`, `pontuarPalavras` |
| `js/pontuador.js` / `pontuador-worker.js` | Pontuação por modelo (parte pura / Web Worker) | `PACOTES`, `pacoteDoIdioma` |
| `js/i18n.js` (175) | Interface no idioma do celular (traduz textos em português na hora) | `t`, `iniciarI18n` |
| `js/idiomas.js` (199) | Lista de idiomas, idioma do sistema, endereço do dicionário | `IDIOMAS_TRADUCAO`, `idiomaDoSistema`, `urlDicionario` |
| `js/timedtext.js` (208) | Lê a legenda do formato do player do YouTube | `lerTimedText` |
| `js/busca.js` (49) | Endereço de busca do YouTube com filtros | `urlBusca`, `montarSp` |
| `sw.js` (69) | Service worker: rede primeiro, cache reserva | `CACHE`, `ARQUIVOS` |
| `android/app/src/main/java/io/github/hcostamcsys/legendadupla/MainActivity.java` (1533) | App nativo: WebViews, YouTube da tela inicial, Meus vídeos, internet, mensagens página↔app | `PAGINA`, `VERSAO_APK`, `criarPainelYoutube`, `abrirMeusVideos`, `mostrarYoutube`, `escolherVideo`, `vigiarInternet`, `conferirInternet`, `enviarInternet`, `CONFIRMAR_QUEDA_MS`, `aoMensagem`, `chamarPagina`, `iniciarDownloadModelos`, `esconderBarras` |
| `.../ServicoVoz.java` (1504) | Serviço da voz mais clara: fila, download do modelo, áudio, separação, limpeza, mixagem, entrega com Range | `URL_MODELO`, `pedido`, `lacoSeparacao`, `tratar`, `separar`, `renderizar`, `lacoMixagem`, `baixarModelo`, `baixarArquivo`, `progressoModelo`, `responder` |
| `.../ServicoModelos.java` (618) | Download nativo dos pacotes de pontuação | `iniciar`, `baixarTudo`, `baixarArquivo`, `responder` |
| `.../voz/*.java` | Peças da voz: `ObterAudio` (NewPipe), `DecodificadorAudio`, `SeparadorVoz`, `LimpezaVoz`, `LimpadorVoz`+`ModeloDfn3` (ruído), `Dereverberador` (eco, WPE), `MixadorVoz`, `CodificadorAac`, `Reamostrador`, `Fft`, `BaixadorHttp` | — |
| `android/app/src/main/assets/gancho.js` (528) | Roda dentro do player do YouTube: legendas, anúncios, relógio do vídeo | — |
| `android/app/src/main/assets/youtube.js` (572) | Roda no YouTube da tela inicial: esconde Shorts, troca de abas | — |
| `android/app/src/main/res/values*/strings.xml` | Textos nativos (notificações) em vários idiomas | — |

## Configurações persistidas
Ajustes gerais: localStorage `ld.ajustes` (`js/armazenamento.js`). Valor fora de `OPCOES`/`FAIXAS` é descartado por `misturarAjustes` e volta ao padrão (é a "migração" automática). `VERSAO_AJUSTES` = 4 (P01: folga salva antes da 4 volta ao padrão uma vez; regras por versão dentro de `misturarAjustes`).

| Chave | Valores | Padrão | Lida/gravada em |
|---|---|---|---|
| `folgaFala` | 0.18, 0.3, 0.45 (igual a `FOLGAS_MAX` de `legendas.js`; `FOLGA_MIN_FRASES` = menor opção) | 0.3 | `montarFolgas`, `tempoDestinoFolga` |
| `velocidade` | 0.25–2 | 1 | `montarVelocidades` |
| `fonteL1` | 14–32 | 19 | `aplicarAparencia`, `confirmarFonte` |
| `modoTraducao` | sempre, pausado, desligada | sempre | menu da tradução |
| `modoLegenda` | uma, lista | lista | `alternarModoLegenda` |
| `idioma` / `destino` / `destinoManual` | códigos de `IDIOMAS_TRADUCAO` | auto / pt / false | `perguntarIdioma`, Ajustes |
| `inverterArraste` | bool | false | `direcaoDoArraste` |
| `pontuacaoModelo` | bool | true | pontuação melhorada |
| `gestosExplicados` | bool | false | `mostrarExplicacaoGestos` |
| `vozMargem` | 8, 12, 16, 22 (`MARGENS`) | 12 | `js/voz.js`, `ServicoVoz.margemValida` |
| `vozLimpeza` | 0, 12, 100 (`LIMPEZAS`) | 100 | `js/voz.js`, `ServicoVoz.limpezaValida` |
| `vozAuto` | bool | false | `js/voz.js` |

Por vídeo (IndexedDB `legenda-dupla`/`videos`, registro `reg`): posição salva (`salvarPosicao`), sincronia `ajusteEstudo` e `ajusteTraducao` (`ajustarSincronia`), `vozDesligada` (`js/voz.js`). Estado da voz no app: `files/voz/estado.json`.

## Recursos baixáveis (modelos, pacotes)
| Recurso | Origem do download | Onde é salvo | Quem usa |
|---|---|---|---|
| Modelo de tratamento do áudio (na página; HT-Demucs FT, 316 MB) | Hugging Face, `URL_MODELO` em `ServicoVoz.java` (revisão fixa, confere SHA-256) | `files/voz/` (`arquivoModelo`) | `ServicoVoz.baixarModelo`/`baixarArquivo`; página: bloco `#voz-modelo` |
| Limpeza de ruído (DeepFilterNet3, 8,6 MB) | Dentro do APK (`assets/dfn3/`) | — | `ModeloDfn3`, `abrirModeloLimpeza` |
| Pacotes de pontuação (en, latinas) | Hugging Face; no app, download nativo por `ServicoModelos` | Cache `modelos-pontuacao-v1` (`CACHE_MODELOS`) | `js/modelos.js`, `baixarPacoteNativo` |
| Motor onnxruntime-web | `vendor/ort/` (no site) | cache do site | `pontuador-worker.js` |

## Textos da interface (onde ficam)
- Quase todos: direto no `index.html`, em português. Os montados por código: em `js/app.js` (`toast`, `selo`, `dialogo`, textos de `mostrarCarregando`, `atualizarAvisoRede`) e `js/voz.js` (`descreverVideo`).
- Com o celular em outro idioma, `js/i18n.js` traduz os textos na hora (não há arquivos de tradução para manter).
- Textos nativos (notificações): `android/app/src/main/res/values*/strings.xml` e strings no Java dos serviços.
- Para achar um texto: `grep -rn "texto" index.html js/ android/app/src/main`.

## Pontos sensíveis (o que quebra fácil e por quê)
- **Cache do site:** esquecer de trocar `CACHE` em `sw.js` = o celular não vê a mudança.
- **Listas duplicadas:** `OPCOES` em `armazenamento.js` precisa bater com `FOLGAS_MAX` (`legendas.js`), `MARGENS` e `LIMPEZAS` (`voz.js`) e com `margemValida`/`limpezaValida` (`ServicoVoz.java`).
- **Ponto salvo ao abrir vídeo:** `PlayerYouTube._ler`/`revelar` esperam o vídeo tocar perto do ponto salvo antes de mostrar a imagem (v16; PLANO.md seção 20, item 3). A barra (`atualizarProgresso`) é atualizada pelo laço `tique`, que pode ler tempos falsos do player antes disso.
- **Aviso de rede:** depende de três fontes — `ldRede` (nativo, `vigiarInternet`, confirma queda após `CONFIRMAR_QUEDA_MS` = 2 s), `conferirRede` (player travado em buffer) e `aoMudarRede`. Falso alarme já foi corrigido uma vez (v14); pulos rápidos de fala geram buffer e podem disparar `conferirRede`.
- **Gestos:** `ligarGestos` é ligado em `ligarEventos` duas vezes: em `#camada-gestos` (vídeo: arrastar, toque, `segurar` = 2× com `acelerarSegurando`/`soltarAceleracao`) e em `#caixa-legenda` (só arrastar e toque, sem `segurar`). Antes do primeiro play a camada de gestos não pode capturar toques (PLANO.md 7.2).
- **Folga antes da fala:** `tempoDestinoFolga` usa o silêncio antes da fala; ver testes `tests/folga.test.mjs`. `FOLGA_MIN_FRASES` não pode ser maior que a menor opção de `FOLGAS_MAX`, senão a opção some na legenda automática.
- **Nome na interface:** o grupo `#grupo-voz` aparece como "Tratamento do áudio" (partes "Volume da voz e do fundo" e "Limpeza da voz (ruído e eco)"); no código e nos comentários ainda se chama "voz mais clara". Textos nativos (`android/`) ainda dizem "separação de voz" até o P05.
- **Testes e2e** dependem dos ids do `index.html`; renomear id = ajustar `tests/e2e_test.py`.
- **Voz mais clara:** o download do áudio do YouTube (NewPipe Extractor) não pode ser testado no Actions (YouTube recusa servidores); só no celular. A função não pode ir para a Play Store.
- **APK:** `abiFilters` só ARM; mexer em dependências muda o tamanho do APK.
- **GitHub Pages publica a raiz inteira do repositório** (inclusive `notas-dev/`, `PLANO.md`, `CLAUDE.md`): nada de segredos em nenhum arquivo.
