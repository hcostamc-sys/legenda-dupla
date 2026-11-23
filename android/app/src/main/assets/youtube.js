// youtube.js — roda no YouTube que é a tela inicial do app (m.youtube.com), antes do código dele.
// 1) Esconde o botão "Shorts" da barra de baixo e as prateleiras de Shorts: o app não abre Shorts.
//    Se um Shorts for aberto mesmo assim (pelo histórico, por exemplo), o app mostra um aviso.
// 2) Troca de abas da barra de baixo (Início, Inscrições, Você), versão 17: igual ao app oficial do YouTube,
//    medida quadro a quadro numa gravação de tela dele (120 quadros/s, Galaxy S23 Ultra, 23/11/2026):
//    - a aba antiga some de uma vez (não se mexe);
//    - a página NOVA (barra de cima + conteúdo; a barra de abas fica parada) aparece 41 dp abaixo, a 89%,
//      e SOBE até o lugar em 0,375 s na curva "fast out slow in" (0.4, 0, 0.2, 1), clareando junto até 100%.
//    O erro da versão 16 (gravação do app de 23/11/2026): ela animava já no toque, mas o m.youtube.com só
//    troca a página uns 80 a 200 ms depois. Então a página ANTIGA é que descia e subia (com um quadro preto
//    no começo, da opacidade 0), e a nova entrava com a animação já pela metade.
//    Agora o toque só "arma" a troca; a animação começa no instante em que a página antiga sai da tela (o
//    observador de mudanças roda antes de a tela ser desenhada), então o 1º quadro da página nova já é o
//    1º quadro da subida. Até lá a página antiga fica parada, sem piscar. Tocar na aba aberta não anima.
//    Versão 18: a página nova só sobe completa, sem nada surgindo no meio (ver prepararAba).
//    Versão 19: sobe tudo o que está na tela menos a barra de abas, inclusive a fileira de chips da aba
//    Início, que pulava fora de sincronia (ver calcularPecas).
//    Outras páginas (Histórico, busca, canal) continuam sem animação.
// 3) Toque num vídeo: avisa o app (LDYoutube) antes de o YouTube abrir a página do vídeo. A lista fica
//    exatamente como estava (sem ir e voltar, sem recarregar). Sem LDYoutube, o YouTube segue normal e o
//    app pega a troca de endereço.
// Os nomes dos elementos são do site do YouTube e podem mudar: aí o botão volta a aparecer, mas nada quebra
// (o aviso de Shorts continua, e o conteúdo nunca fica escondido).
(function () {
  if (window.__ldYoutube) return;
  window.__ldYoutube = true;

  // Página que sobe na troca de aba: a barra de cima e o conteúdo (a barra de abas de baixo fica parada).
  var PAGINA = 'ytm-mobile-topbar-renderer, ytm-browse, ytm-search';
  var ABA_MS = 375;

  var CSS = [
    // botão Shorts da barra de baixo
    'ytm-pivot-bar-item-renderer:has(.pivot-shorts) { display: none !important; }',
    'ytm-pivot-bar-item-renderer:has(a[href^="/shorts"]) { display: none !important; }',
    // prateleiras de Shorts na página inicial, na busca e nos canais
    'ytm-reel-shelf-renderer { display: none !important; }',
    'ytm-rich-section-renderer:has(ytm-shorts-lockup-view-model) { display: none !important; }',
    'ytm-rich-section-renderer:has(ytm-reel-shelf-renderer) { display: none !important; }',
    'grid-shelf-view-model:has(ytm-shorts-lockup-view-model) { display: none !important; }',
    // Shorts soltos no meio de outras listas (o resumo "Histórico" da aba Você, por exemplo): ver esconderShorts()
    '.ld-short-escondido { display: none !important; }',
    // troca de aba (ver o item 2 no topo): sobe 41 dp em 0,375 s (0.4, 0, 0.2, 1) e a opacidade vai de 0,89
    // a 1 na mesma curva (na gravação, a opacidade acompanha a subida). Começa em 0,89, nunca em 0: se o
    // celular atrasar o 1º quadro, aparece a página nova parada embaixo, e não uma tela preta.
    '@keyframes ld-aba-sobe { from { transform: translate3d(0, 41px, 0); opacity: 0.89; }' +
      ' to { transform: translate3d(0, 0, 0); opacity: 1; } }',
    // As partes que sobem levam o atributo ld-aba-peca (versão 19, ver calcularPecas): tudo o que está na
    // tela menos a barra de abas, inclusive a fileira de chips da aba Início e os elementos fixos.
    'html.ld-aba [ld-aba-peca] { animation: ld-aba-sobe ' + ABA_MS + 'ms cubic-bezier(0.4, 0, 0.2, 1) both' +
      ' !important; will-change: transform, opacity; }',
    // espera da página nova completa (versão 18): parada no ponto de partida, invisível (0,01 e não 0, para o
    // navegador já desenhar as imagens; numa camada com opacidade 0 ele não desenha nada)
    'html.ld-aba-espera [ld-aba-peca] { transform: translate3d(0, 41px, 0) !important;' +
      ' opacity: 0.01 !important; will-change: transform, opacity; }',
    // transições do próprio YouTube (barra que entra deslizando, por exemplo): desligadas durante a troca,
    // para nada andar num tempo diferente da página; o que mudou já aparece no estado final
    'html:is(.ld-aba, .ld-aba-espera) [ld-aba-peca], html:is(.ld-aba, .ld-aba-espera) [ld-aba-peca] *' +
      ' { transition: none !important; }',
    '@media (prefers-reduced-motion: reduce) { html.ld-aba [ld-aba-peca] { animation: none !important; } }',
  ].join('\n');

  function por() {
    if (document.getElementById('ld-sem-shorts')) return true;
    var alvo = document.head || document.documentElement;
    if (!alvo) return false;
    var st = document.createElement('style');
    st.id = 'ld-sem-shorts';
    st.textContent = CSS;
    alvo.appendChild(st);
    return true;
  }

  if (!por()) document.addEventListener('DOMContentLoaded', por);
  // O site troca de página sem recarregar e pode refazer o <head>: confere de vez em quando.
  setInterval(por, 2000);

  // ------------------------------------------------------------------ Shorts soltos (versão 14)
  // A página Histórico ("Ver tudo") junta os Shorts numa prateleira, que fica escondida; mas o resumo
  // "Histórico" da aba Você mistura os Shorts com os vídeos normais. Por isso as duas listas não batiam
  // (o resumo mostrava Shorts que o "Ver tudo" não mostrava). Agora todo cartão que leva a um Shorts some,
  // em qualquer lista: as duas mostram os mesmos vídeos, e o app não abre Shorts mesmo.
  var ITENS = 'ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2, ytm-reel-item-renderer,' +
    ' ytm-compact-video-renderer, ytm-video-with-context-renderer, ytm-media-item, ytm-video-card-renderer,' +
    ' ytm-rich-item-renderer, ytm-playlist-video-renderer, ytm-grid-video-renderer, yt-lockup-view-model';
  var PAREDES = 'body, ytm-app, ytm-browse, ytm-search, ytm-section-list-renderer, ytm-item-section-renderer,' +
    ' ytm-shelf-renderer, ytm-horizontal-card-list-renderer, ytm-rich-grid-renderer';

  function caminhoDe(a) { return (a.getAttribute('href') || '').split(/[?#]/)[0]; }

  /** O cartão inteiro do Shorts (miniatura, título e menu), e não só o link. */
  function cartaoDoShort(a) {
    var conhecido = a.closest(ITENS);
    if (conhecido) return conhecido;
    // Nome de elemento desconhecido: sobe enquanto o elemento de cima só tiver links para este mesmo Shorts.
    var caminho = caminhoDe(a);
    var el = a;
    for (var n = 0; n < 10; n++) {
      var pai = el.parentElement;
      if (!pai || pai.matches(PAREDES)) break;
      var links = pai.querySelectorAll('a[href]');
      var so = true;
      for (var j = 0; j < links.length; j++) {
        if (caminhoDe(links[j]) !== caminho) { so = false; break; }
      }
      if (!so) break;
      el = pai;
    }
    return el;
  }

  function esconderShorts() {
    if (!document.body) return;
    var alvos = [];
    var links = document.querySelectorAll('a[href^="/shorts/"], a[href*="youtube.com/shorts/"]');
    for (var i = 0; i < links.length; i++) alvos.push(cartaoDoShort(links[i]));
    // O YouTube reaproveita elementos: o que deixou de ser Shorts volta a aparecer.
    var marcados = document.querySelectorAll('.ld-short-escondido');
    for (var k = 0; k < marcados.length; k++) {
      if (alvos.indexOf(marcados[k]) < 0) marcados[k].classList.remove('ld-short-escondido');
    }
    for (var m = 0; m < alvos.length; m++) alvos[m].classList.add('ld-short-escondido');
  }

  var tShorts = 0;
  function agendarShorts() {
    if (tShorts) return;
    tShorts = setTimeout(function () { tShorts = 0; esconderShorts(); }, 60);
  }
  function vigiarShorts() {
    if (!document.body) return false;
    try { new MutationObserver(agendarShorts).observe(document.body, { childList: true, subtree: true }); } catch (e) { /* nada */ }
    esconderShorts();
    return true;
  }
  if (!vigiarShorts()) document.addEventListener('DOMContentLoaded', vigiarShorts);
  setInterval(esconderShorts, 1500); // reforço

  // ------------------------------------------------------------------ toque num vídeo
  function enderecoDeVideo(href) {
    var u;
    try { u = new URL(href, location.href); } catch (e) { return ''; }
    var host = u.hostname;
    if (host === 'youtu.be') return u.pathname.length > 1 ? u.href : '';
    if (!/(^|\.)youtube\.com$/.test(host)) return '';
    if (u.pathname === '/watch') return u.searchParams.get('v') ? u.href : '';
    return /^\/(shorts|live)\/./.test(u.pathname) ? u.href : '';
  }

  // Fase de captura na janela: roda antes do código do YouTube, que abriria a página do vídeo.
  window.addEventListener('click', function (ev) {
    var ponte = window.LDYoutube;
    if (!ponte || typeof ponte.postMessage !== 'function') return;
    if (ev.defaultPrevented || ev.button > 0 || !ev.target || !ev.target.closest) return;
    var a = ev.target.closest('a[href]');
    if (!a) return;
    // Botões dentro do cartão do vídeo (menu ⋮, por exemplo) continuam com o YouTube.
    var b = ev.target.closest('button, [role="button"]');
    if (b && a.contains(b) && b !== a) return;
    var url = enderecoDeVideo(a.getAttribute('href'));
    if (!url) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    try { ponte.postMessage(url); } catch (e) { /* nada: o YouTube não abre o vídeo, o toque se perde */ }
  }, true);

  // ------------------------------------------------------------------ troca de aba (versão 16)
  // Ordem das abas da barra de baixo. Outras páginas: -1.
  function ordemAba(caminho) {
    if (caminho === '/' || caminho === '') return 0;
    if (caminho.indexOf('/feed/subscriptions') === 0) return 1;
    if (caminho.indexOf('/feed/you') === 0 || caminho.indexOf('/feed/library') === 0) return 2;
    return -1;
  }

  /** Aba de um botão da barra de baixo (pelo link ou pelo nome do ícone); -1 se não der para saber. */
  function abaDoBotao(item) {
    var a = item.querySelector('a[href]') || item.closest('a[href]');
    if (a) {
      try { return ordemAba(new URL(a.getAttribute('href'), location.href).pathname); } catch (e) { /* segue */ }
    }
    if (item.querySelector('.pivot-w2w, .pivot-home')) return 0;
    if (item.querySelector('.pivot-subs')) return 1;
    if (item.querySelector('.pivot-library, .pivot-you')) return 2;
    return -1;
  }

  var tAba = 0;
  var obsAba = null;
  var refAba = null; // a animação de uma parte que já estava na tela: o relógio da troca
  var inicioAba = null; // startTime do relógio (fica guardado se a parte de referência sair)

  // ------------------------------------------------------------------ partes que sobem (versão 19)
  // Versão 18: subiam só a barra de cima e o conteúdo (pelos nomes ytm-mobile-topbar-renderer e
  // ytm-browse). Na aba Você estava certo, mas na aba Início a fileira de chips (Tudo, Música, Ao vivo...)
  // pulava fora de sincronia (gravação do usuário, 23/11/2026). Três jeitos de isso acontecer, todos
  // reproduzidos em tests/youtube_aba_inicio_test.py:
  // - elemento com position: fixed dentro de uma parte deslocada passa a contar a partir dela (fica 41 dp
  //   mais um cabeçalho abaixo do lugar) e salta para o lugar no fim;
  // - elemento fora do ytm-browse não subia (ficava parado, ou aparecia na espera escura);
  // - transição do próprio YouTube (a barra entra deslizando no tempo dela).
  // Agora as partes não dependem dos nomes do YouTube: sobe tudo o que está na tela, menos a barra de abas.
  // Partindo do <body>, cada elemento que não contém a barra de abas nem um elemento fixo sobe inteiro (uma
  // "peça"); o que contém é aberto e os filhos viram peças. Assim um elemento fixo é sempre uma peça própria
  // (nunca fica dentro de outra deslocada) e se move igual às outras. As transições ficam desligadas (CSS).
  var ATR_PECA = 'ld-aba-peca';
  var pecas = [];

  function barraDeAbas() { return document.querySelector('ytm-pivot-bar-renderer'); }

  // deslocamento vertical que a animação está aplicando agora num elemento (0 se nenhum)
  function deslocamentoAtual(el) {
    if (!el.hasAttribute(ATR_PECA)) return 0;
    try {
      var tr = getComputedStyle(el).transform;
      return tr && tr !== 'none' ? new DOMMatrixReadOnly(tr).m42 : 0;
    } catch (e) { return 0; }
  }

  function calcularPecas() {
    var corpo = document.body;
    if (!corpo) return [];
    var barra = barraDeAbas();
    if (!barra) return Array.prototype.slice.call(document.querySelectorAll(PAGINA)); // nomes mudaram
    var exibicao = new Map(); // elemento visível -> display
    var fixos = [];
    var andar = document.createTreeWalker(corpo, NodeFilter.SHOW_ELEMENT, {
      acceptNode: function (el) {
        if (el === barra) return NodeFilter.FILTER_REJECT;
        var cs = getComputedStyle(el);
        if (cs.display === 'none') return NodeFilter.FILTER_REJECT; // nem ele nem o que tem dentro aparece
        exibicao.set(el, cs.display);
        if (cs.position === 'fixed') fixos.push(el);
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    while (andar.nextNode()) { /* só percorre */ }
    var abrir = new Set(); // elementos que contêm a barra de abas ou um fixo
    function marcarAcima(el) {
      for (var e = el.parentElement; e && e !== corpo && !abrir.has(e); e = e.parentElement) abrir.add(e);
    }
    marcarAcima(barra);
    for (var i = 0; i < fixos.length; i++) marcarAcima(fixos[i]);
    var topoBarra = barra.getBoundingClientRect().top;
    var lista = [];
    (function visitar(pai) {
      for (var c = pai.firstElementChild; c; c = c.nextElementSibling) {
        if (c === barra || !exibicao.has(c)) continue;
        // display: contents não tem caixa própria (deslocá-lo não move nada): os filhos é que sobem
        if (abrir.has(c) || exibicao.get(c) === 'contents') { visitar(c); continue; }
        // elemento fixo que fica todo na faixa da barra de abas (um fundo dela, por exemplo): fica parado
        if (fixos.indexOf(c) >= 0 && c.getBoundingClientRect().top - deslocamentoAtual(c) >= topoBarra - 2) continue;
        lista.push(c);
      }
    })(corpo);
    return lista;
  }

  /** Marca as peças atuais; devolve as que entraram agora. */
  function aplicarPecas() {
    var novas = calcularPecas();
    var ficam = new Set(novas);
    for (var i = 0; i < pecas.length; i++) if (!ficam.has(pecas[i])) pecas[i].removeAttribute(ATR_PECA);
    var entraram = [];
    for (var j = 0; j < novas.length; j++) {
      if (!novas[j].hasAttribute(ATR_PECA)) { novas[j].setAttribute(ATR_PECA, ''); entraram.push(novas[j]); }
    }
    pecas = novas;
    return entraram;
  }

  function limparPecas() {
    for (var i = 0; i < pecas.length; i++) pecas[i].removeAttribute(ATR_PECA);
    pecas = [];
  }

  // O que as mudanças da página pedem: 'novos' (entrou ou saiu elemento: recalcula já, antes de a tela ser
  // desenhada) ou 'attr' (só classe/estilo: o YouTube muda muitos enquanto carrega as miniaturas, então
  // junta tudo num recálculo só, no próximo quadro, para não pesar). '' = só a barra de abas mudou.
  function tipoDeMudanca(lista) {
    var tipo = '';
    for (var i = 0; i < lista.length; i++) {
      var alvo = lista[i].target;
      if (alvo.closest && alvo.closest('ytm-pivot-bar-renderer')) continue;
      if (lista[i].type === 'childList') return 'novos';
      tipo = 'attr';
    }
    return tipo;
  }

  var quadroPecas = 0;
  /** Recalcula as peças no próximo quadro (uma vez só); depois chama aoTerminar(peças que entraram). */
  function recalcularNoQuadro(aoTerminar) {
    if (quadroPecas) return;
    quadroPecas = requestAnimationFrame(function () {
      quadroPecas = 0;
      var entraram = aplicarPecas();
      if (aoTerminar) aoTerminar(entraram);
    });
  }

  function cancelarRecalculo() {
    if (quadroPecas) cancelAnimationFrame(quadroPecas);
    quadroPecas = 0;
  }

  function animacoesAba(el) {
    try {
      return el.getAnimations().filter(function (a) { return /^ld-aba-/.test(a.animationName || ''); });
    } catch (e) { return []; }
  }

  function relogioAba() {
    if (refAba && refAba.playState !== 'idle' && refAba.startTime !== null) inicioAba = refAba.startTime;
    return inicioAba;
  }

  // Peça que entra no meio da subida (o YouTube pôs mais coisa na tela): entra no mesmo ponto da animação
  // das outras, em vez de começar de novo (apagada e 41 dp abaixo = pulo).
  function sincronizarAba(el) {
    var inicio = relogioAba();
    var anims = animacoesAba(el);
    for (var i = 0; i < anims.length; i++) {
      try {
        // mesmo instante de início no relógio da página (com currentTime ficaria um quadro atrasada)
        if (inicio !== null) anims[i].startTime = inicio;
        else if (refAba && refAba.currentTime !== null) anims[i].currentTime = refAba.currentTime;
      } catch (e) { /* nada */ }
    }
  }

  function fimAba() {
    clearTimeout(tAba);
    tAba = 0;
    if (obsAba) { obsAba.disconnect(); obsAba = null; }
    refAba = null;
    inicioAba = null;
    var raiz = document.documentElement;
    if (raiz) raiz.classList.remove('ld-aba');
    if (!preparo) { cancelarRecalculo(); limparPecas(); }
  }

  // A classe fica até a página terminar de subir (com folga). Peças que entram no meio: sincronizarAba().
  function prolongarAba() {
    clearTimeout(tAba);
    tAba = setTimeout(fimAba, ABA_MS + 60);
  }

  function animarAba() {
    var raiz = document.documentElement;
    if (!raiz || !document.body) return;
    var reduzir = false;
    try { reduzir = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* nada */ }
    if (reduzir) { cancelarRecalculo(); limparPecas(); return; }
    clearTimeout(tAba);
    if (obsAba) { obsAba.disconnect(); obsAba = null; }
    cancelarRecalculo(); // recálculo pendente da espera: feito agora, junto com a subida
    raiz.classList.remove('ld-aba');
    aplicarPecas();
    void raiz.offsetWidth; // recomeça a animação, mesmo com toques seguidos
    raiz.classList.add('ld-aba');
    prolongarAba();
    refAba = null;
    inicioAba = null;
    for (var k = 0; k < pecas.length && !refAba; k++) refAba = animacoesAba(pecas[k])[0] || null;
    try {
      // roda antes de a tela ser desenhada: o que o YouTube põe ou muda já entra no mesmo ponto da subida
      var sincronizar = function (entraram) {
        if (!raiz.classList.contains('ld-aba')) return;
        for (var j = 0; j < entraram.length; j++) sincronizarAba(entraram[j]);
      };
      obsAba = new MutationObserver(function (lista) {
        var tipo = tipoDeMudanca(lista);
        if (tipo === 'novos') { cancelarRecalculo(); sincronizar(aplicarPecas()); }
        else if (tipo === 'attr') recalcularNoQuadro(sincronizar);
      });
      obsAba.observe(document.body, {
        childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'style', 'class'],
      });
    } catch (e) { obsAba = null; }
  }

  // ------------------------------------------------------------------ espera da troca (versão 17)
  // O toque arma a troca; a animação começa quando a página antiga sai da tela. Para saber isso sem depender
  // dos nomes internos do YouTube: guarda os elementos que estão em 3 pontos do conteúdo e, a cada mudança
  // na página, confere se a maioria deles sumiu (saiu da página ou ficou escondida).
  var ESPERA_MS = 3000; // sem troca nesse tempo (o YouTube não mudou de página): desarma, nada anima
  var PONTOS = [[0.25, 0.35], [0.5, 0.55], [0.75, 0.75]];
  var armada = null; // { marcas: [elementos], ate: ms }
  var obsTroca = null;

  function elementoNoPonto(p) {
    var el = null;
    try { el = document.elementFromPoint(window.innerWidth * p[0], window.innerHeight * p[1]); } catch (e) { /* nada */ }
    if (!el || el === document.documentElement || el === document.body) return null;
    if (el.closest && el.closest('ytm-pivot-bar-renderer')) return null;
    return el;
  }

  function sumiu(el) {
    return !el.isConnected || el.getClientRects().length === 0;
  }

  function desarmar() {
    armada = null;
    if (obsTroca) { obsTroca.disconnect(); obsTroca = null; }
  }

  function conferirTroca() {
    if (!armada) return;
    if (Date.now() > armada.ate) { desarmar(); return; }
    var validos = 0, foram = 0;
    for (var i = 0; i < armada.marcas.length; i++) {
      var el = armada.marcas[i];
      if (!el) continue;
      validos++;
      if (sumiu(el)) foram++;
    }
    var trocou;
    if (validos) trocou = foram * 2 > validos;
    else trocou = PONTOS.some(function (p) { return !!elementoNoPonto(p); }); // tela vazia: veio conteúdo
    if (!trocou) return;
    desarmar();
    prepararAba();
  }

  // ------------------------------------------------------------------ página nova completa (versão 18)
  // Na gravação da v16, a página nova chegava incompleta e as coisas surgiam no meio da subida: a engrenagem
  // 1 quadro depois, a foto do perfil 2 quadros depois e as miniaturas como blocos cinza por 2 a 4 quadros.
  // No app oficial tudo já está lá no 1º quadro. Então a página nova fica parada no ponto de partida,
  // invisível (como os 1 ou 2 quadros escuros do app oficial), até as imagens à vista estarem carregadas e
  // decodificadas e o YouTube passar um quadro inteiro sem pôr nada novo; só aí a subida começa.
  // Limite: 120 ms. Com a internet lenta, sobe assim mesmo (melhor que a tela escura demorar).
  var ESPERA_COMPLETA_MS = 120;
  var preparo = null;

  function imagensAVista() {
    var lista = [];
    for (var k = 0; k < pecas.length; k++) {
      var imgs = pecas[k].querySelectorAll('img');
      for (var i = 0; i < imgs.length; i++) {
        var r = imgs[i].getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        if (r.bottom <= 0 || r.top >= window.innerHeight || r.right <= 0 || r.left >= window.innerWidth) continue;
        lista.push(imgs[i]);
      }
    }
    return lista;
  }

  function cancelarPreparo() {
    if (!preparo) return;
    if (preparo.obs) preparo.obs.disconnect();
    preparo = null;
    var raiz = document.documentElement;
    if (raiz) raiz.classList.remove('ld-aba-espera');
    cancelarRecalculo();
    limparPecas();
  }

  function prepararAba() {
    cancelarPreparo();
    fimAba();
    var raiz = document.documentElement;
    aplicarPecas();
    raiz.classList.add('ld-aba-espera'); // aplicado antes de a tela ser desenhada: a página nova não aparece
    var p = preparo = { desde: performance.now(), mexeu: true, decod: null, pronto: false, obs: null };
    try {
      // o que o YouTube põe na tela durante a espera também fica escondido, já no mesmo quadro
      p.obs = new MutationObserver(function (lista) {
        var tipo = tipoDeMudanca(lista);
        // "quieto" (pronto para subir) olha só elementos novos: classes e estilos mudam o tempo todo
        if (tipo === 'novos') { p.mexeu = true; cancelarRecalculo(); aplicarPecas(); }
        else if (tipo === 'attr') recalcularNoQuadro(null);
      });
      // imagens: conferidas a cada quadro
      p.obs.observe(document.body, {
        childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'style', 'class'],
      });
    } catch (e) { p.obs = null; }

    function soltar() {
      if (preparo !== p) return;
      if (p.obs) p.obs.disconnect();
      preparo = null;
      // no mesmo quadro: sai da espera e começa a subida do mesmíssimo ponto (41 dp abaixo)
      raiz.classList.remove('ld-aba-espera');
      animarAba();
    }

    requestAnimationFrame(function passo() {
      if (preparo !== p) return;
      if (performance.now() - p.desde >= ESPERA_COMPLETA_MS) { soltar(); return; }
      var quieto = !p.mexeu;
      p.mexeu = false;
      var imgs = imagensAVista();
      var faltam = imgs.some(function (im) { return !im.complete || !im.naturalWidth; });
      if (faltam) {
        p.decod = null;
        p.pronto = false;
      } else if (!p.decod || p.decod.imgs.length !== imgs.length ||
          imgs.some(function (im, i) { return im !== p.decod.imgs[i]; })) {
        // todas carregadas: decodifica já (se o YouTube trocar alguma, decodifica de novo)
        var d = { imgs: imgs };
        p.decod = d;
        p.pronto = false;
        Promise.all(imgs.map(function (im) {
          try { return im.decode().catch(function () {}); } catch (e) { return null; }
        })).then(function () { if (p.decod === d) p.pronto = true; });
      }
      // sobe no quadro em que está tudo pronto e o YouTube passou o quadro anterior sem pôr nada novo
      if (!faltam && quieto && p.pronto) { soltar(); return; }
      requestAnimationFrame(passo);
    });
  }

  function armarTroca() {
    if (!document.body) return;
    var reduzir = false;
    try { reduzir = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* nada */ }
    if (reduzir) return;
    desarmar();
    cancelarPreparo();
    fimAba(); // toque no meio de uma subida: a página atual fica no lugar até a troca
    armada = { marcas: PONTOS.map(elementoNoPonto), ate: Date.now() + ESPERA_MS };
    try {
      // roda depois de cada mudança e antes de a tela ser desenhada: o 1º quadro da página nova já anima
      obsTroca = new MutationObserver(conferirTroca);
      obsTroca.observe(document.documentElement, {
        childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'style', 'class'],
      });
    } catch (e) { desarmar(); }
  }

  // Toque numa aba da barra de baixo: arma a troca (fase de captura, antes do código do YouTube).
  // Pelo pointerup (vem mesmo se o YouTube cancelar o click do toque) e pelo click, sem repetir.
  var ultimoToqueAba = { item: null, em: 0 };
  function aoTocarAba(ev) {
    if (ev.button > 0 || !ev.target || !ev.target.closest) return;
    var item = ev.target.closest('ytm-pivot-bar-item-renderer');
    if (!item) return;
    var agora = Date.now();
    // o click que vem logo depois do pointerup do mesmo toque
    if (ev.type === 'click' && ultimoToqueAba.item === item && agora - ultimoToqueAba.em < 600) return;
    ultimoToqueAba = { item: ev.type === 'pointerup' ? item : null, em: agora };
    if (item.getAttribute('aria-selected') === 'true' || item.querySelector('[aria-selected="true"]')) return;
    var destino = abaDoBotao(item);
    if (destino >= 0 && destino === ordemAba(location.pathname)) return; // já está nesta aba
    armarTroca();
  }
  window.addEventListener('pointerup', aoTocarAba, true);
  window.addEventListener('click', aoTocarAba, true);

  // Voltar do celular de uma aba para outra: a mesma animação.
  var caminhoAba = location.pathname;
  ['pushState', 'replaceState'].forEach(function (nome) {
    var original = history[nome];
    if (typeof original !== 'function') return;
    history[nome] = function () {
      var r = original.apply(this, arguments);
      caminhoAba = location.pathname;
      return r;
    };
  });
  window.addEventListener('popstate', function () {
    var de = caminhoAba;
    caminhoAba = location.pathname;
    var a = ordemAba(de);
    var b = ordemAba(caminhoAba);
    if (a >= 0 && b >= 0 && a !== b) armarTroca();
  });
})();
