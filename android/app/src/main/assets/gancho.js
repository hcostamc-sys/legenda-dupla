// gancho.js — roda dentro do player do YouTube (quadro www.youtube.com/embed/...), antes do código dele.
// Quando o próprio player baixa uma legenda (/api/timedtext, já com o token que ele mesmo gera),
// manda uma cópia do texto para a página do Legenda Dupla (a janela de cima) por postMessage.
// Não muda nada no pedido nem na resposta.
// Também avisa a página quando há anúncio e quando o botão "Pular anúncio" do YouTube aparece,
// e clica nele quando a página pede (botão "Pular anúncio" do Legenda Dupla).
(function () {
  if (window.__ldGancho) return;
  window.__ldGancho = true;

  function ehLegenda(url) {
    return /\/api\/timedtext/.test(String(url || ''));
  }

  function enviar(url, texto, status, via) {
    try {
      var abs = new URL(String(url), location.href).href;
      window.top.postMessage({ ldLegenda: true, url: abs, status: status, texto: String(texto || ''), via: via }, '*');
    } catch (e) { /* nada */ }
  }

  // fetch
  var fetchOriginal = window.fetch;
  if (typeof fetchOriginal === 'function') {
    window.fetch = function (entrada) {
      var url = typeof entrada === 'string' ? entrada : (entrada && entrada.url) || String(entrada);
      var promessa = fetchOriginal.apply(this, arguments);
      if (ehLegenda(url)) {
        promessa.then(function (resp) {
          resp.clone().text().then(function (t) { enviar(url, t, resp.status, 'fetch'); }, function () {});
        }, function () {});
      }
      return promessa;
    };
  }

  // XMLHttpRequest
  var abrir = XMLHttpRequest.prototype.open;
  var mandar = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (metodo, url) {
    this.__ldUrl = url;
    return abrir.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    var xhr = this;
    if (ehLegenda(xhr.__ldUrl)) {
      xhr.addEventListener('load', function () {
        try {
          var r = xhr.response;
          var texto;
          if (xhr.responseType === '' || xhr.responseType === 'text') texto = xhr.responseText;
          else if (typeof r === 'string') texto = r;
          else if (r instanceof ArrayBuffer) texto = new TextDecoder('utf-8').decode(r);
          else if (typeof Blob !== 'undefined' && r instanceof Blob) {
            r.text().then(function (t) { enviar(xhr.__ldUrl, t, xhr.status, 'xhr-blob'); }, function () {});
            return;
          } else texto = JSON.stringify(r);
          enviar(xhr.__ldUrl, texto, xhr.status, 'xhr');
        } catch (e) { /* nada */ }
      });
    }
    return mandar.apply(this, arguments);
  };

  // ---------------------------------------------------------------- anúncios
  if (window.top === window || !/^\/embed\//.test(location.pathname)) return;

  var PULAR = '.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern, ' +
    '.ytp-ad-skip-button-slot button, button[id^="skip-button"], .videoAdUiSkipButton';

  function botaoPular() {
    var lista = document.querySelectorAll(PULAR);
    for (var i = 0; i < lista.length; i++) {
      var b = lista[i];
      var r = b.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      var st = getComputedStyle(b);
      if (st.visibility === 'hidden' || st.display === 'none' || Number(st.opacity) < 0.1) continue;
      return b;
    }
    return null;
  }

  var ultimo = '';
  var ultimoEnvio = 0;
  function conferir() {
    try {
      var p = document.querySelector('.html5-video-player');
      var ativo = !!p && (p.classList.contains('ad-showing') || p.classList.contains('ad-interrupting'));
      var b = ativo ? botaoPular() : null;
      var r = b ? b.getBoundingClientRect() : null;
      var msg = {
        ldAnuncio: true,
        ativo: ativo,
        pulavel: !!b,
        x: r ? Math.round(r.left) : 0,
        y: r ? Math.round(r.top) : 0,
        w: r ? Math.round(r.width) : 0,
        h: r ? Math.round(r.height) : 0,
      };
      var chave = JSON.stringify(msg);
      var agora = Date.now();
      // Manda quando muda e, durante o anúncio, de novo a cada 2 s (se a página perdeu um aviso).
      if (chave !== ultimo || (ativo && agora - ultimoEnvio > 2000)) {
        ultimo = chave;
        ultimoEnvio = agora;
        window.top.postMessage(msg, '*');
      }
    } catch (e) { /* nada */ }
  }
  setInterval(conferir, 400);

  window.addEventListener('message', function (ev) {
    if (ev.source !== window.top) return;
    var d = ev.data;
    if (!d || typeof d !== 'object' || d.ldPular !== true) return;
    var b = botaoPular();
    if (b) {
      try { b.click(); } catch (e) { /* nada */ }
    }
    setTimeout(conferir, 300);
  });
})();
