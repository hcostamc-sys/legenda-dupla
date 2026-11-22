// youtube.js — roda no YouTube que é a tela inicial do app (m.youtube.com), antes do código dele.
// 1) Esconde o botão "Shorts" da barra de baixo e as prateleiras de Shorts: o app não abre Shorts.
//    Se um Shorts for aberto mesmo assim (pelo histórico, por exemplo), o app mostra um aviso.
// 2) Transição entre as abas e páginas do YouTube (Início, Inscrições, Você, Histórico, busca, canal), no
//    "eixo horizontal" do Material Design: o conteúdo antigo desliza um pouco para o lado e apaga rápido; o
//    novo vem do outro lado, desacelerando. Aba à direita da atual (ou página mais funda, como Histórico):
//    a página nova vem da direita; aba à esquerda ou voltar: vem da esquerda. Só o conteúdo se move (a barra
//    de cima e a barra de abas ficam paradas) e o deslocamento some ao fim da animação.
// 3) Toque num vídeo: avisa o app (LDYoutube) antes de o YouTube abrir a página do vídeo. A lista fica
//    exatamente como estava (sem ir e voltar, sem recarregar). Sem LDYoutube, o YouTube segue normal e o
//    app pega a troca de endereço.
// Os nomes dos elementos são do site do YouTube e podem mudar: aí o botão volta a aparecer ou a transição
// deixa de acontecer, mas nada quebra (o aviso de Shorts continua, e o conteúdo nunca fica escondido).
(function () {
  if (window.__ldYoutube) return;
  window.__ldYoutube = true;

  // Conteúdo das páginas (a barra de cima e a barra de abas de baixo ficam paradas).
  var CONTEUDO = 'ytm-browse, ytm-search';

  var CSS = [
    // botão Shorts da barra de baixo
    'ytm-pivot-bar-item-renderer:has(.pivot-shorts) { display: none !important; }',
    'ytm-pivot-bar-item-renderer:has(a[href^="/shorts"]) { display: none !important; }',
    // prateleiras de Shorts na página inicial, na busca e nos canais
    'ytm-reel-shelf-renderer { display: none !important; }',
    'ytm-rich-section-renderer:has(ytm-shorts-lockup-view-model) { display: none !important; }',
    'ytm-rich-section-renderer:has(ytm-reel-shelf-renderer) { display: none !important; }',
    'grid-shelf-view-model:has(ytm-shorts-lockup-view-model) { display: none !important; }',
    // transição entre abas (eixo horizontal): saída de 0,14 s acelerando; entrada de 0,4 s desacelerando
    // (curvas "enfatizadas" do Material 3). --ld-dir: 1 = a página nova vem da direita; -1 = da esquerda.
    'html.ld-saindo :is(' + CONTEUDO + ') { opacity: 0 !important;' +
      ' transform: translate3d(calc(var(--ld-dir, 1) * -30px), 0, 0) !important;' +
      ' transition: opacity 0.12s cubic-bezier(0.3, 0, 0.8, 0.15), transform 0.14s cubic-bezier(0.3, 0, 0.8, 0.15) !important; }',
    '@keyframes ld-entra { 0% { opacity: 0; transform: translate3d(calc(var(--ld-dir, 1) * 44px), 0, 0); }' +
      ' 35% { opacity: 1; } 100% { opacity: 1; transform: none; } }',
    'html.ld-entrando :is(' + CONTEUDO + ') { animation: ld-entra 0.4s cubic-bezier(0.05, 0.7, 0.1, 1) both !important; }',
    '@media (prefers-reduced-motion: reduce) { html.ld-saindo :is(' + CONTEUDO + ') { opacity: 1 !important; transform: none !important; }' +
      ' html.ld-entrando :is(' + CONTEUDO + ') { animation: none !important; } }',
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

  // ------------------------------------------------------------------ transição entre abas
  var endereco = location.pathname + location.search;
  var caminhoAntes = location.pathname;
  var voltando = false;
  var obs = null;
  var tQuieto = 0;
  var tLimite = 0;
  var tEntrada = 0;
  var inicio = 0;

  function ehVideo() {
    return /^\/(watch|shorts\/|live\/)/.test(location.pathname); // o app abre esses no Legenda Dupla
  }

  // <html> pode ainda não existir quando este script roda (início da página): pega na hora.
  function raizDoc() { return document.documentElement; }

  function entrar() {
    var raiz = raizDoc();
    clearTimeout(tQuieto);
    clearTimeout(tLimite);
    if (obs) { obs.disconnect(); obs = null; }
    if (!raiz || !raiz.classList.contains('ld-saindo')) return;
    raiz.classList.remove('ld-saindo');
    raiz.classList.add('ld-entrando');
    clearTimeout(tEntrada);
    tEntrada = setTimeout(function () { raiz.classList.remove('ld-entrando'); }, 460);
  }

  // A página nova já foi desenhada quando o YouTube para de mexer no conteúdo por um instante.
  function aoMexer() {
    clearTimeout(tQuieto);
    var falta = Math.max(0, 160 - (Date.now() - inicio)); // a saída dura pelo menos 0,16 s
    tQuieto = setTimeout(entrar, Math.max(falta, 120));
  }

  // Ordem das abas da barra de baixo (o Shorts está escondido). Outras páginas: -1 (mais fundas).
  function ordemAba(caminho) {
    if (caminho === '/' || caminho === '') return 0;
    if (caminho.indexOf('/feed/subscriptions') === 0) return 1;
    if (caminho.indexOf('/feed/you') === 0 || caminho.indexOf('/feed/library') === 0) return 2;
    return -1;
  }

  function direcao(de, para, voltou) {
    var a = ordemAba(de);
    var b = ordemAba(para);
    if (a >= 0 && b >= 0 && a !== b) return b > a ? 1 : -1; // troca de aba: no sentido da aba tocada
    return voltou ? -1 : 1; // abrir uma página: vem da direita; voltar: da esquerda
  }

  function sair(dir) {
    var raiz = raizDoc();
    if (!document.body || !raiz) return;
    raiz.style.setProperty('--ld-dir', String(dir || 1));
    raiz.classList.remove('ld-entrando');
    raiz.classList.add('ld-saindo');
    inicio = Date.now();
    if (obs) obs.disconnect();
    try {
      obs = new MutationObserver(aoMexer);
      obs.observe(document.body, { childList: true, subtree: true });
    } catch (e) { obs = null; }
    aoMexer();
    clearTimeout(tLimite);
    tLimite = setTimeout(entrar, 700); // nunca deixa o conteúdo apagado por mais de 0,7 s
  }

  function conferir() {
    var atual = location.pathname + location.search;
    var voltou = voltando;
    voltando = false;
    if (atual === endereco) return;
    endereco = atual;
    var de = caminhoAntes;
    caminhoAntes = location.pathname;
    if (ehVideo()) return;
    sair(direcao(de, location.pathname, voltou));
  }

  // O YouTube troca de página pelo history.pushState: avisa logo que o endereço muda.
  ['pushState', 'replaceState'].forEach(function (nome) {
    var original = history[nome];
    if (typeof original !== 'function') return;
    history[nome] = function () {
      var r = original.apply(this, arguments);
      setTimeout(conferir, 0);
      return r;
    };
  });
  window.addEventListener('popstate', function () { voltando = true; setTimeout(conferir, 0); });
  setInterval(conferir, 300); // reforço, se o YouTube trocar o endereço por outro caminho
})();
