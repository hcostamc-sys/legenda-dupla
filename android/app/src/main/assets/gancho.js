// gancho.js — roda dentro do player do YouTube (quadro www.youtube.com/embed/...), antes do código dele.
// 1) Quando o player baixa uma legenda (/api/timedtext), manda uma cópia do texto para a página do
//    Legenda Dupla (a janela de cima) por postMessage. Não muda nada no pedido nem na resposta.
// 2) Lista TODAS as legendas do vídeo, inclusive as automáticas: a lista que a API do iframe entrega
//    à página (getOption('captions','tracklist')) deixa as automáticas de fora. Aqui, dentro do
//    player, dá para ler a resposta do próprio YouTube (captionTracks) e a lista interna com includeAsr.
// 3) Baixa a faixa que a página pedir: pelo próprio player e, se ele não baixar, direto pelo endereço
//    da faixa (mesmo site do player, com os cookies dele).
// 4) Avisa quando há anúncio e quando o botão "Pular anúncio" do YouTube aparece, e clica nele.
// 5) Descobre o idioma do áudio original (vídeos com dublagem automática têm vários) e, se o player
//    escolheu uma dublagem, volta para o áudio original: a legenda sugerida é a do idioma falado.
// 6) Esconde o que o player desenha por cima do vídeo: botão compartilhar, título, logotipo do YouTube,
//    ícone de pausa no meio, sugestões de vídeos. O app tem os próprios botões, tempo e barra.
(function () {
  if (window.__ldGancho) return;
  window.__ldGancho = true;
  var VERSAO = 4; // 3: ao vivo; 4: idioma do áudio original e player sem os enfeites do YouTube
  var noPlayer = window.top !== window && /^\/embed\//.test(location.pathname);
  var contagemLegendas = 0; // legendas vistas (para saber se o player já baixou)

  function ehLegenda(url) {
    return /\/api\/timedtext/.test(String(url || ''));
  }

  function ehRespostaPlayer(url) {
    return /\/youtubei\/v1\/player(\?|$)/.test(String(url || ''));
  }

  function absoluto(url) {
    try { return new URL(String(url), location.href).href; } catch (e) { return String(url || ''); }
  }

  function enviar(msg) {
    try { window.top.postMessage(msg, '*'); } catch (e) { /* nada */ }
  }

  // Token (pot) que o próprio player usa nos pedidos de legenda: reaproveitado no download direto.
  var token = null;
  function lembrarToken(url) {
    try {
      var q = new URL(absoluto(url)).searchParams;
      if (q.get('pot')) token = { pot: q.get('pot'), potc: q.get('potc'), c: q.get('c') };
    } catch (e) { /* nada */ }
  }

  function enviarLegenda(url, texto, status, via) {
    contagemLegendas++;
    lembrarToken(url);
    enviar({ ldLegenda: true, url: absoluto(url), status: status, texto: String(texto || ''), via: via });
  }

  // Respostas do /youtubei/v1/player vistas (por id do vídeo).
  var respostas = {};
  function guardarResposta(texto) {
    try {
      var j = typeof texto === 'string' ? JSON.parse(texto) : texto;
      var id = j && j.videoDetails && j.videoDetails.videoId;
      if (id) respostas[id] = j;
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
          resp.clone().text().then(function (t) { enviarLegenda(url, t, resp.status, 'fetch'); }, function () {});
        }, function () {});
      } else if (noPlayer && ehRespostaPlayer(url)) {
        promessa.then(function (resp) {
          resp.clone().text().then(guardarResposta, function () {});
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
    var legenda = ehLegenda(xhr.__ldUrl);
    var resposta = noPlayer && ehRespostaPlayer(xhr.__ldUrl);
    if (legenda || resposta) {
      xhr.addEventListener('load', function () {
        try {
          var r = xhr.response;
          var texto;
          if (xhr.responseType === '' || xhr.responseType === 'text') texto = xhr.responseText;
          else if (typeof r === 'string') texto = r;
          else if (r instanceof ArrayBuffer) texto = new TextDecoder('utf-8').decode(r);
          else if (typeof Blob !== 'undefined' && r instanceof Blob) {
            r.text().then(function (t) {
              if (legenda) enviarLegenda(xhr.__ldUrl, t, xhr.status, 'xhr-blob'); else guardarResposta(t);
            }, function () {});
            return;
          } else texto = JSON.stringify(r);
          if (legenda) enviarLegenda(xhr.__ldUrl, texto, xhr.status, 'xhr'); else guardarResposta(texto);
        } catch (e) { /* nada */ }
      });
    }
    return mandar.apply(this, arguments);
  };

  if (!noPlayer) return;

  // ---------------------------------------------------------------- player limpo (só o vídeo)

  // Nomes de classe do player do YouTube (podem mudar; aí o elemento volta a aparecer, sem outro efeito).
  // Nada de anúncio (.ytp-ad-*, .video-ads) é escondido: o "Pular anúncio" precisa continuar visível.
  var CSS = [
    '.ytp-share-button, .ytp-share-button-visible, .ytp-copylink-button, .ytp-overflow-button,',
    'button[aria-label^="Compartilhar"], button[aria-label^="Share"], button[title^="Compartilhar"], button[title^="Share"],',
    '.ytp-watermark, .ytp-youtube-button, .ytp-small-redirect, .ytp-impression-link,',
    '.ytp-chrome-top, .ytp-gradient-top, .ytp-title, .ytp-title-channel, .ytp-show-cards-title,',
    '.ytp-chrome-bottom, .ytp-gradient-bottom, .ytp-bezel, .ytp-bezel-text-wrapper, .ytp-doubletap-ui-legacy,',
    '.ytp-pause-overlay, .ytp-pause-overlay-container, .ytp-ce-element, .html5-endscreen, .videowall-endscreen,',
    '.ytp-endscreen-content, .ytp-suggested-action, .ytp-featured-product, .ytp-iv-player-content, .iv-branding,',
    '.branding-img-container, .annotation, .ytp-cards-teaser, .ytp-cards-button, .ytp-paid-content-overlay,',
    '.ytp-caption-window-container, .ytp-contextmenu',
    '{ display: none !important; }',
    // Variações de nome (player para celular): pelo pedaço do nome, sem tocar no que é de anúncio.
    ':is([class*="share-button"], [class*="watermark"], [class*="bezel"], [class*="pause-overlay"],',
    '[class*="player-controls"], [class*="play-pause"], [class*="chrome-top"], [class*="title-channel"])',
    ':not(.video-ads *):not([class*="ad-"]) { display: none !important; }',
    // Botão grande de tocar: só some depois que o vídeo tocou uma vez (antes, pode ser preciso tocar nele).
    'html.ld-tocou :is(.ytp-large-play-button, [class*="large-play-button"], .ytp-cued-thumbnail-overlay):not(.video-ads *)',
    '{ display: none !important; }',
  ].join('\n');

  function porEstilo() {
    if (document.getElementById('ld-player-limpo')) return;
    var alvo = document.head || document.documentElement;
    if (!alvo) return;
    var st = document.createElement('style');
    st.id = 'ld-player-limpo';
    st.textContent = CSS;
    alvo.appendChild(st);
  }
  porEstilo();
  document.addEventListener('DOMContentLoaded', porEstilo);
  // 'playing' não sobe pela página, mas passa pela captura no documento.
  document.addEventListener('playing', function () {
    try { document.documentElement.classList.add('ld-tocou'); } catch (e) { /* nada */ }
  }, true);

  // ---------------------------------------------------------------- áudio original

  function idiomaDoId(id) {
    var m = /^([a-zA-Z]{2,3}(?:-[A-Za-z0-9]+)?)(\.|$)/.exec(String(id || ''));
    return m ? m[1] : '';
  }

  function nomeAudio(t) {
    try { return String(t.displayName || t.name || (t.getLanguageInfo && t.getLanguageInfo().getName && t.getLanguageInfo().getName()) || ''); } catch (e) { return ''; }
  }

  function idiomaAudio(t) {
    if (!t) return '';
    var c = '';
    try { c = t.languageCode || (t.getLanguageInfo && t.getLanguageInfo().getId && t.getLanguageInfo().getId()) || ''; } catch (e) { /* nada */ }
    return idiomaDoId(c) || idiomaDoId(t.id) || idiomaDoId(t.audioTrackId);
  }

  function ehOriginal(t) {
    return !!t && (t.isOriginalTrack === true || t.isOriginal === true || /original/i.test(nomeAudio(t)));
  }

  var audioTrocadoEm = ''; // vídeo em que o áudio já foi trocado para o original (uma vez só)

  /** { original, atual, fonte } ou null. Só informa quando há mais de um áudio (com um só, a legenda automática basta). */
  function lerAudio(p, resp, video) {
    // 1) O player: faixas de áudio com a marcação de original.
    try {
      var lista = p && p.getAvailableAudioTracks && p.getAvailableAudioTracks();
      if (lista && lista.length > 1) {
        var orig = null;
        for (var i = 0; i < lista.length; i++) if (ehOriginal(lista[i])) { orig = lista[i]; break; }
        var atual = p.getAudioTrack && p.getAudioTrack();
        if (orig && idiomaAudio(orig)) {
          var anuncio = !!p.classList && (p.classList.contains('ad-showing') || p.classList.contains('ad-interrupting'));
          if (!anuncio && video && atual && orig.id !== undefined && atual.id !== orig.id && audioTrocadoEm !== video && p.setAudioTrack) {
            audioTrocadoEm = video;
            try { p.setAudioTrack(orig); } catch (e) { /* nada */ }
          }
          return { original: idiomaAudio(orig), atual: idiomaAudio(atual), fonte: 'player' };
        }
      }
    } catch (e) { /* nada */ }
    // 2) A resposta do YouTube: os formatos de áudio trazem o nome da faixa ("English original").
    try {
      var fmts = resp && resp.streamingData && resp.streamingData.adaptiveFormats;
      if (Array.isArray(fmts)) {
        var vistos = {};
        var achou = '';
        fmts.forEach(function (f) {
          var a = f && f.audioTrack;
          if (!a) return;
          vistos[a.id] = true;
          if (!achou && /original/i.test(a.displayName || '')) achou = idiomaDoId(a.id);
        });
        if (achou && Object.keys(vistos).length > 1) return { original: achou, atual: '', fonte: 'resposta' };
      }
    } catch (e) { /* nada */ }
    return null;
  }

  // ---------------------------------------------------------------- faixas de legenda

  function obterPlayer() {
    return document.getElementById('movie_player') || document.querySelector('.html5-video-player');
  }

  function textoDoNome(n) {
    if (!n) return '';
    if (typeof n === 'string') return n;
    if (n.simpleText) return n.simpleText;
    if (n.runs) return n.runs.map(function (x) { return x.text || ''; }).join('');
    return '';
  }

  function ehAsr(kind) { return kind === 'asr'; }

  function respostaDoPlayer(p, video) {
    var r = null;
    try { if (p && typeof p.getPlayerResponse === 'function') r = p.getPlayerResponse(); } catch (e) { /* nada */ }
    if (r && video && r.videoDetails && r.videoDetails.videoId && r.videoDetails.videoId !== video) r = null;
    if (!r && video && respostas[video]) r = respostas[video];
    if (!r) {
      try {
        var pv = window.ytcfg && window.ytcfg.get && window.ytcfg.get('PLAYER_VARS');
        var emb = pv && pv.embedded_player_response;
        var j = typeof emb === 'string' ? JSON.parse(emb) : emb;
        if (j && j.videoDetails && (!video || j.videoDetails.videoId === video)) r = j;
      } catch (e) { /* nada */ }
    }
    return r;
  }

  /** Todas as faixas do vídeo que está no player, de todas as fontes. */
  function coletarFaixas() {
    var p = obterPlayer();
    var video = '';
    try {
      var vd = p && p.getVideoData && p.getVideoData();
      video = (vd && vd.video_id) || '';
    } catch (e) { /* nada */ }
    var lista = [];
    var fontes = [];
    var resp = respostaDoPlayer(p, video);
    var status = '';
    var semCaptions = false;
    var aoVivo = false;
    var agendado = false;
    try {
      var dados = p && p.getVideoData && p.getVideoData();
      if (dados && dados.isLive === true) aoVivo = true;
    } catch (e) { /* nada */ }
    if (resp && resp.videoDetails) {
      if (resp.videoDetails.isLive === true) aoVivo = true;
      if (resp.videoDetails.isUpcoming === true) agendado = true;
    }
    if (resp) {
      status = (resp.playabilityStatus && resp.playabilityStatus.status) || '';
      if (!video && resp.videoDetails) video = resp.videoDetails.videoId || '';
      var ren = resp.captions && resp.captions.playerCaptionsTracklistRenderer;
      var ct = ren && ren.captionTracks;
      if (Array.isArray(ct)) {
        fontes.push('resposta');
        ct.forEach(function (t) {
          lista.push({
            languageCode: t.languageCode || '', kind: t.kind || '', languageName: textoDoNome(t.name),
            vss_id: t.vssId || '', baseUrl: t.baseUrl || '',
          });
        });
      } else if (status === 'OK' && resp.streamingData) {
        semCaptions = true; // resposta completa do vídeo, sem nenhuma legenda
      }
    }
    var interna = [];
    try {
      interna = (p && p.getOption && p.getOption('captions', 'tracklist', { includeAsr: true })) || [];
    } catch (e) { /* nada */ }
    if (Array.isArray(interna) && interna.length) {
      fontes.push('tracklist');
      interna.forEach(function (t) {
        var ja = lista.some(function (x) { return x.languageCode === t.languageCode && ehAsr(x.kind) === ehAsr(t.kind); });
        if (!ja) {
          lista.push({
            languageCode: t.languageCode || '', kind: t.kind || '', languageName: t.languageName || t.displayName || '',
            vss_id: t.vss_id || '', baseUrl: '',
          });
        }
      });
      semCaptions = false;
    }
    return {
      ldFaixas: true, versao: VERSAO, video: video, faixas: lista, fontes: fontes, status: status,
      semCaptions: semCaptions, temResposta: !!resp, aoVivo: aoVivo, agendado: agendado,
      audio: lerAudio(p, resp, video),
      getPlayerResponse: !!(p && typeof p.getPlayerResponse === 'function'), token: !!token,
    };
  }

  var ultimoFaixas = '';
  var ultimoFaixasEm = 0;
  function avisarFaixas(forcar) {
    var c = coletarFaixas();
    var chave = JSON.stringify(c);
    var agora = Date.now();
    if (forcar || chave !== ultimoFaixas || agora - ultimoFaixasEm > 3000) {
      ultimoFaixas = chave;
      ultimoFaixasEm = agora;
      enviar(c);
    }
  }

  /** Baixa a faixa pedida pela página: 1) pelo próprio player; 2) direto, se não chegar. */
  function baixar(f) {
    var p = obterPlayer();
    if (!p || !f) return;
    var asr = ehAsr(f.kind);
    var antes = contagemLegendas;
    try { if (p.loadModule) p.loadModule('captions'); } catch (e) { /* nada */ }
    try {
      var tl = (p.getOption && p.getOption('captions', 'tracklist', { includeAsr: true })) || [];
      var t = null;
      for (var i = 0; i < tl.length; i++) {
        if (tl[i].languageCode === f.languageCode && ehAsr(tl[i].kind) === asr) { t = tl[i]; break; }
      }
      if (p.setOption) p.setOption('captions', 'track', t || { languageCode: f.languageCode, kind: f.kind || '', vss_id: f.vss_id || '' });
    } catch (e) { /* nada */ }
    setTimeout(function () {
      if (contagemLegendas > antes) return; // o player já baixou
      var c = coletarFaixas();
      var alvo = null;
      c.faixas.forEach(function (x) {
        if (!alvo && x.baseUrl && x.languageCode === f.languageCode && ehAsr(x.kind) === asr) alvo = x;
      });
      if (!alvo) { enviar({ ldBaixou: true, ok: false, motivo: 'sem endereço da faixa' }); return; }
      var u;
      try {
        u = new URL(alvo.baseUrl, location.href);
        u.searchParams.set('fmt', 'json3');
        u.searchParams.delete('tlang');
        if (token && !u.searchParams.has('pot')) {
          u.searchParams.set('pot', token.pot);
          if (token.potc) u.searchParams.set('potc', token.potc);
          if (token.c) u.searchParams.set('c', token.c);
        }
      } catch (e) { enviar({ ldBaixou: true, ok: false, motivo: 'endereço inválido' }); return; }
      // window.fetch (com o gancho acima) manda a cópia da legenda para a página sozinho.
      window.fetch(u.href, { credentials: 'include' }).then(function (r) {
        return r.text().then(function (tx) {
          enviar({ ldBaixou: true, ok: r.status === 200 && tx.length > 20, status: r.status, tamanho: tx.length, token: !!token });
        });
      }, function (e) {
        enviar({ ldBaixou: true, ok: false, motivo: String((e && e.message) || e) });
      });
    }, 1500);
  }

  // ---------------------------------------------------------------- anúncios

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
  function conferirAnuncio() {
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
        enviar(msg);
      }
    } catch (e) { /* nada */ }
  }

  var voltas = 0;
  setInterval(function () {
    conferirAnuncio();
    if (++voltas % 2 === 0) { try { avisarFaixas(false); } catch (e) { /* nada */ } } // a cada 0,8 s
  }, 400);

  window.addEventListener('message', function (ev) {
    if (ev.source !== window.top) return;
    var d = ev.data;
    if (!d || typeof d !== 'object') return;
    if (d.ldPular === true) {
      var b = botaoPular();
      if (b) {
        try { b.click(); } catch (e) { /* nada */ }
      }
      setTimeout(conferirAnuncio, 300);
    } else if (d.ldFaixasAgora === true) {
      try { avisarFaixas(true); } catch (e) { /* nada */ }
    } else if (d.ldBaixar && typeof d.ldBaixar === 'object') {
      try { baixar(d.ldBaixar); } catch (e) { enviar({ ldBaixou: true, ok: false, motivo: String(e) }); }
    }
  });
})();
