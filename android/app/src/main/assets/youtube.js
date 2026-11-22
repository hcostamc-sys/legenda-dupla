// youtube.js — roda no YouTube que é a tela inicial do app (m.youtube.com), antes do código dele.
// Esconde o botão "Shorts" da barra de baixo e as prateleiras de Shorts: o app não abre Shorts.
// Se um Shorts for aberto mesmo assim (pelo histórico, por exemplo), o app mostra um aviso.
// Os nomes dos elementos são do site do YouTube e podem mudar: aí o botão volta a aparecer, mas o aviso continua.
(function () {
  if (window.__ldYoutube) return;
  window.__ldYoutube = true;

  var CSS = [
    // botão Shorts da barra de baixo
    'ytm-pivot-bar-item-renderer:has(.pivot-shorts) { display: none !important; }',
    'ytm-pivot-bar-item-renderer:has(a[href^="/shorts"]) { display: none !important; }',
    // prateleiras de Shorts na página inicial, na busca e nos canais
    'ytm-reel-shelf-renderer { display: none !important; }',
    'ytm-rich-section-renderer:has(ytm-shorts-lockup-view-model) { display: none !important; }',
    'ytm-rich-section-renderer:has(ytm-reel-shelf-renderer) { display: none !important; }',
    'grid-shelf-view-model:has(ytm-shorts-lockup-view-model) { display: none !important; }',
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
})();
