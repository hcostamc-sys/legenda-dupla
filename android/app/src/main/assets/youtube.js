// youtube.js — roda no YouTube que é a tela inicial do app (m.youtube.com), antes do código dele.
// 1) Esconde o botão "Shorts" da barra de baixo e as prateleiras de Shorts: o app não abre Shorts.
//    Se um Shorts for aberto mesmo assim (pelo histórico, por exemplo), o app mostra um aviso.
// 2) Troca de abas e páginas do YouTube (Início, Inscrições, Você, Histórico, busca, canal): SEM animação do
//    app (versão 15), como no app oficial do YouTube. A animação antiga (apagar e acender o conteúdo) começava
//    depois de o YouTube já ter trocado o conteúdo pelos blocos cinza de carregamento, e por isso a tela
//    piscava: conteúdo novo, escuro, conteúdo de novo (visto quadro a quadro numa gravação de tela).
// 3) Toque num vídeo: avisa o app (LDYoutube) antes de o YouTube abrir a página do vídeo. A lista fica
//    exatamente como estava (sem ir e voltar, sem recarregar). Sem LDYoutube, o YouTube segue normal e o
//    app pega a troca de endereço.
// Os nomes dos elementos são do site do YouTube e podem mudar: aí o botão volta a aparecer, mas nada quebra
// (o aviso de Shorts continua, e o conteúdo nunca fica escondido).
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
    // Shorts soltos no meio de outras listas (o resumo "Histórico" da aba Você, por exemplo): ver esconderShorts()
    '.ld-short-escondido { display: none !important; }',
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

})();
