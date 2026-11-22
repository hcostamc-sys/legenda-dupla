// youtube.js — roda no YouTube que é a tela inicial do app (m.youtube.com), antes do código dele.
// 1) Esconde o botão "Shorts" da barra de baixo e as prateleiras de Shorts: o app não abre Shorts.
//    Se um Shorts for aberto mesmo assim (pelo histórico, por exemplo), o app mostra um aviso.
// 2) Transição suave entre as abas e páginas do YouTube (Início, Inscrições, Você, Histórico, busca,
//    canal): o conteúdo antigo apaga rápido e o novo aparece devagar (só opacidade, sem mexer no layout).
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
    // transição entre abas: saída rápida (0,15 s) e entrada suave (0,32 s, curva padrão do Material)
    'html.ld-saindo :is(' + CONTEUDO + ') { opacity: 0.15 !important; transition: opacity 0.15s ease-in !important; }',
    '@keyframes ld-entra { from { opacity: 0.15; } to { opacity: 1; } }',
    'html.ld-entrando :is(' + CONTEUDO + ') { animation: ld-entra 0.32s cubic-bezier(0.2, 0, 0, 1) both !important; }',
    '@media (prefers-reduced-motion: reduce) { html.ld-saindo :is(' + CONTEUDO + ') { opacity: 1 !important; }' +
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

  // ------------------------------------------------------------------ transição entre abas
  var endereco = location.pathname + location.search;
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
    tEntrada = setTimeout(function () { raiz.classList.remove('ld-entrando'); }, 400);
  }

  // A página nova já foi desenhada quando o YouTube para de mexer no conteúdo por um instante.
  function aoMexer() {
    clearTimeout(tQuieto);
    var falta = Math.max(0, 160 - (Date.now() - inicio)); // a saída dura pelo menos 0,16 s
    tQuieto = setTimeout(entrar, Math.max(falta, 120));
  }

  function sair() {
    var raiz = raizDoc();
    if (!document.body || !raiz) return;
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
    if (atual === endereco) return;
    endereco = atual;
    if (ehVideo()) return;
    sair();
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
  window.addEventListener('popstate', function () { setTimeout(conferir, 0); });
  setInterval(conferir, 300); // reforço, se o YouTube trocar o endereço por outro caminho
})();
