// gancho.js — roda dentro do player do YouTube (quadro www.youtube.com/embed/...), antes do código dele.
// Quando o próprio player baixa uma legenda (/api/timedtext, já com o token que ele mesmo gera),
// manda uma cópia do texto para a página do Legenda Dupla (a janela de cima) por postMessage.
// Não muda nada no pedido nem na resposta.
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
})();
