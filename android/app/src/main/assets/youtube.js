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
    'html.ld-aba :is(' + PAGINA + ') { animation: ld-aba-sobe ' + ABA_MS + 'ms cubic-bezier(0.4, 0, 0.2, 1) both' +
      ' !important; will-change: transform, opacity; }',
    '@media (prefers-reduced-motion: reduce) { html.ld-aba :is(' + PAGINA + ') { animation: none !important; } }',
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

  function animacoesAba(el) {
    try {
      return el.getAnimations().filter(function (a) { return /^ld-aba-/.test(a.animationName || ''); });
    } catch (e) { return []; }
  }

  // Parte da página que o YouTube põe na tela no meio da subida (ele troca o conteúdo inteiro): entra no
  // mesmo ponto da animação das outras, em vez de começar de novo (apagada e 41 dp abaixo = piscada).
  function sincronizarAba(el) {
    if (!refAba) return;
    var anims = animacoesAba(el);
    for (var i = 0; i < anims.length; i++) {
      try {
        // mesmo instante de início no relógio da página (com currentTime ficaria um quadro atrasada)
        if (refAba.startTime !== null) anims[i].startTime = refAba.startTime;
        else if (refAba.currentTime !== null) anims[i].currentTime = refAba.currentTime;
      } catch (e) { /* nada */ }
    }
  }

  function fimAba() {
    clearTimeout(tAba);
    tAba = 0;
    if (obsAba) { obsAba.disconnect(); obsAba = null; }
    refAba = null;
    var raiz = document.documentElement;
    if (raiz) raiz.classList.remove('ld-aba');
  }

  // A classe fica até a página terminar de subir (com folga). Partes que entram no meio: sincronizarAba().
  function prolongarAba() {
    clearTimeout(tAba);
    tAba = setTimeout(fimAba, ABA_MS + 60);
  }

  function animarAba() {
    var raiz = document.documentElement;
    if (!raiz || !document.body) return;
    var reduzir = false;
    try { reduzir = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* nada */ }
    if (reduzir) return;
    fimAba();
    void raiz.offsetWidth; // recomeça a animação, mesmo com toques seguidos
    raiz.classList.add('ld-aba');
    prolongarAba();
    var partes = document.querySelectorAll(PAGINA);
    for (var k = 0; k < partes.length && !refAba; k++) refAba = animacoesAba(partes[k])[0] || null;
    try {
      obsAba = new MutationObserver(function (lista) {
        for (var i = 0; i < lista.length; i++) {
          var nos = lista[i].addedNodes;
          for (var j = 0; j < nos.length; j++) {
            var n = nos[j];
            if (n.nodeType !== 1) continue;
            if (n.matches(PAGINA)) sincronizarAba(n);
            var dentro = n.querySelectorAll(PAGINA);
            for (var m = 0; m < dentro.length; m++) sincronizarAba(dentro[m]);
          }
        }
      });
      obsAba.observe(document.body, { childList: true, subtree: true });
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
    animarAba();
  }

  function armarTroca() {
    if (!document.body) return;
    var reduzir = false;
    try { reduzir = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* nada */ }
    if (reduzir) return;
    desarmar();
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
