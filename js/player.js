// player.js — adaptador do player (PLANO.md seções 4 e 7).
// Duas implementações com a mesma interface: PlayerYouTube (real) e PlayerFalso (?mock=1).
//
// carregar(videoId, inicioSeg) -> Promise (resolvida no "pronto")
// tocar() pausar() irPara(seg, buscar = true) tempo() duracao() estado() titulo()
// velocidades() velocidade() definirVelocidade(v) destruir()
// eventos (on): pronto, estado, velocidade, erro, autoplayBloqueado, modulos
//
// Legendas do próprio YouTube (só no app Android, PLANO.md 15.10):
// manterLegendas(sim) faixasLegenda() pedirLegenda(faixa) esconderLegendas()
// silenciar(sim) pularAnuncio() retangulo()

class Emissor {
  constructor() { this._ouvintes = {}; }
  on(nome, fn) { (this._ouvintes[nome] ||= []).push(fn); return this; }
  emitir(nome, dado) {
    for (const fn of this._ouvintes[nome] || []) {
      try { fn(dado); } catch (e) { console.error(e); }
    }
  }
}

export const MSG_API = 'Não consegui carregar o player do YouTube. Confira a internet.';

let promessaApi = null;

function carregarApi() {
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (promessaApi) return promessaApi;
  promessaApi = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const falhar = () => {
      clearTimeout(limite);
      promessaApi = null;
      script.remove();
      reject(new Error(MSG_API));
    };
    const limite = setTimeout(falhar, 15000);
    const anterior = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      clearTimeout(limite);
      try { if (typeof anterior === 'function') anterior(); } catch { /* nada */ }
      resolve();
    };
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = falhar;
    document.head.appendChild(script);
  });
  return promessaApi;
}

export class PlayerYouTube extends Emissor {
  constructor(container) {
    super();
    this.container = container;
    this.yt = null;
    this.iframe = null;
    this._estado = -1;
    this._vel = 1;
    this._lido = null; // último valor bruto lido de getCurrentTime
    this._base = 0; // ultimoTempo (base da interpolação)
    this._marca = 0;
    this._seek = null; // { alvo, quando, lidoAntes }
    this._legendasDesligadas = false;
    this._congelado = false; // pausa pedida, ainda sem confirmação do player
    this._token = 0;
    this._manterLegendas = false; // app Android: o módulo de legendas fica até a legenda ser pega
  }

  /** true: não descarrega o módulo de legendas do YouTube (precisamos dele para pegar a legenda). */
  manterLegendas(sim) { this._manterLegendas = !!sim; }

  /** { faixas, traducoes } informadas pelo player (funções não documentadas). */
  faixasLegenda() {
    let faixas = [];
    let traducoes = [];
    try { this.yt?.loadModule('captions'); } catch { /* nada */ }
    try { faixas = this.yt?.getOption('captions', 'tracklist') || []; } catch { /* nada */ }
    try { traducoes = this.yt?.getOption('captions', 'translationLanguages') || []; } catch { /* nada */ }
    return { faixas: Array.isArray(faixas) ? faixas : [], traducoes: Array.isArray(traducoes) ? traducoes : [] };
  }

  /** Faz o player baixar a legenda desta faixa (o gancho do app Android copia a resposta). */
  pedirLegenda(faixa) {
    try { this.yt?.loadModule('captions'); } catch { /* nada */ }
    const t = { languageCode: faixa.languageCode, kind: faixa.kind || '' };
    if (faixa.vss_id) t.vss_id = faixa.vss_id;
    if (faixa.languageName) t.languageName = faixa.languageName;
    try { this.yt?.setOption('captions', 'track', t); return true; } catch { return false; }
  }

  /** Some com a legenda desenhada pelo YouTube (o app mostra a dele). */
  esconderLegendas() {
    this._manterLegendas = false;
    try { this.yt?.setOption('captions', 'track', {}); } catch { /* nada */ }
    this._aplicarSemLegendas();
  }

  /** Tira ou devolve o som (o vídeo toca sem som enquanto a legenda carrega). */
  silenciar(sim) {
    try { if (sim) this.yt?.mute(); else this.yt?.unMute(); } catch { /* nada */ }
  }

  _paraGancho(msg) {
    try { this.iframe?.contentWindow?.postMessage(msg, 'https://www.youtube.com'); } catch { /* nada */ }
  }

  /** Pede ao gancho do app Android (dentro do player) que toque em "Pular anúncio". */
  pularAnuncio() { this._paraGancho({ ldPular: true }); }

  /** Pede ao gancho a lista de faixas agora (inclui as automáticas, que a API do iframe esconde). */
  pedirFaixasAoGancho() { this._paraGancho({ ldFaixasAgora: true }); }

  /** Pede ao gancho que baixe a faixa (pelo player e, se não vier, direto pelo endereço dela). */
  baixarPeloGancho(f) {
    this._paraGancho({ ldBaixar: { languageCode: f.languageCode, kind: f.kind || '', vss_id: f.vss_id || '' } });
  }

  /** Posição do player na tela (para o toque de verdade do app Android). */
  retangulo() { return this.iframe ? this.iframe.getBoundingClientRect() : null; }

  /** A janela do player (para conferir de onde vêm os avisos do gancho). */
  janela() { return this.iframe?.contentWindow || null; }

  async carregar(videoId, inicioSeg = 0) {
    this.destruir();
    const token = this._token;
    await carregarApi();
    if (token !== this._token) return; // destruir() foi chamado enquanto a API carregava
    const origem = encodeURIComponent(location.origin);
    const inicio = Math.max(0, Math.floor(inicioSeg || 0));
    const iframe = document.createElement('iframe');
    iframe.id = 'yt';
    iframe.src = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&controls=0&playsinline=1&rel=0` +
      `&iv_load_policy=3&cc_load_policy=0&fs=0&disablekb=1&start=${inicio}&origin=${origem}`;
    iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
    iframe.setAttribute('title', 'Player do YouTube');
    this.container.appendChild(iframe);
    this.iframe = iframe;
    this._base = inicio;
    this._marca = performance.now();
    return new Promise((resolve) => {
      this.yt = new window.YT.Player(iframe, {
        events: {
          onReady: () => {
            if (!this._manterLegendas) this._aplicarSemLegendas();
            try { this._vel = this.yt.getPlaybackRate() || 1; } catch { /* nada */ }
            this.emitir('pronto');
            resolve();
          },
          onStateChange: (e) => {
            this._estado = e.data;
            this._congelado = false;
            this._ler();
            if (!this._seekAtivo() && this._lido !== null) this._base = this._lido;
            this._marca = performance.now();
            if (e.data === 1 && !this._legendasDesligadas && !this._manterLegendas) {
              this._aplicarSemLegendas();
              this._legendasDesligadas = true;
            }
            this.emitir('estado', e.data);
          },
          onPlaybackRateChange: (e) => {
            // Com a velocidade exata (gancho v5) quem informa a velocidade real é o gancho:
            // o YouTube não sabe das velocidades fora da lista dele.
            if (this._velPeloGancho) return;
            this._rebase();
            this._vel = Number(e.data) || 1;
            this.emitir('velocidade', this._vel);
          },
          onError: (e) => this.emitir('erro', e.data),
          onAutoplayBlocked: () => this.emitir('autoplayBloqueado'),
          onApiChange: () => this.emitir('modulos'),
        },
      });
    });
  }

  _aplicarSemLegendas() {
    // R5: não documentado. Pode não funcionar; o usuário desliga no app do YouTube.
    try { this.yt.unloadModule('captions'); } catch { /* nada */ }
    try { this.yt.unloadModule('cc'); } catch { /* nada */ }
  }

  _ler() {
    let atual = null;
    try { atual = this.yt?.getCurrentTime?.(); } catch { /* nada */ }
    if (typeof atual === 'number' && atual !== this._lido) {
      const primeiro = this._lido === null;
      this._lido = atual;
      // Depois de irPara, ignora o valor antigo que ainda pode chegar atrasado.
      if (this._seekAtivo() && Math.abs(atual - this._seek.alvo) > 1.5 && !primeiro) {
        return atual;
      }
      this._seek = null;
      this._base = atual;
      this._marca = performance.now();
    }
    return atual;
  }

  _seekAtivo() {
    return !!this._seek && performance.now() - this._seek.quando < 1500;
  }

  _rebase() {
    this._base = this.tempo();
    this._marca = performance.now();
  }

  tempo() {
    const atual = this._ler();
    if (this._congelado) return this._base;
    if (this._estado === 1) {
      const passado = ((performance.now() - this._marca) / 1000) * this._vel;
      return this._base + Math.min(Math.max(0, passado), 0.5);
    }
    if (this._seekAtivo()) return this._seek.alvo;
    return typeof atual === 'number' ? atual : this._base;
  }

  tocar() {
    this._congelado = false;
    this._marca = performance.now();
    try { this.yt?.playVideo(); } catch { /* nada */ }
  }

  pausar() {
    // Congela o relógio na hora: a confirmação da pausa chega atrasada pelo postMessage.
    if (this._estado === 1) {
      this._base = this.tempo();
      this._marca = performance.now();
      this._congelado = true;
    }
    try { this.yt?.pauseVideo(); } catch { /* nada */ }
  }

  irPara(seg, buscar = true) {
    const alvo = Math.max(0, Number(seg) || 0);
    try { this.yt?.seekTo(alvo, buscar); } catch { /* nada */ }
    this._base = alvo;
    this._marca = performance.now();
    this._seek = { alvo, quando: performance.now() };
  }

  duracao() { try { return this.yt?.getDuration?.() || 0; } catch { return 0; } }
  estado() { return this._estado; }

  titulo() {
    try { return (this.yt?.getVideoData?.().title || '').trim(); } catch { return ''; }
  }

  /** Transmissão ao vivo agora? (getVideoData().isLive do player; não documentado, só confia em true) */
  aoVivo() {
    try { return this.yt?.getVideoData?.().isLive === true; } catch { return false; }
  }

  velocidades() {
    try {
      const v = this.yt?.getAvailablePlaybackRates?.();
      if (Array.isArray(v) && v.length) return v;
    } catch { /* nada */ }
    return [1];
  }

  velocidade() { return this._vel; }
  definirVelocidade(v) { try { this.yt?.setPlaybackRate(Number(v)); } catch { /* nada */ } }

  /**
   * Velocidade exata (0,95×, 0,85×...), pelo gancho do app Android (v5): ele muda a velocidade do
   * próprio vídeo, que aceita qualquer valor. A API do iframe só aceita as velocidades da lista do YouTube.
   */
  definirVelocidadeExata(v) {
    this._velPeloGancho = true;
    this._paraGancho({ ldVelocidade: Number(v) });
  }

  /** Velocidade real do vídeo, informada pelo gancho. */
  receberVelocidade(v) {
    const n = Number(v);
    if (!(n > 0)) return;
    this._velPeloGancho = true;
    if (Math.abs(n - this._vel) > 1e-6) {
      this._rebase();
      this._vel = n;
    }
    this.emitir('velocidade', n);
  }

  destruir() {
    this._token++;
    this._congelado = false;
    try { this.yt?.destroy(); } catch { /* nada */ }
    this.yt = null;
    try { this.iframe?.remove(); } catch { /* nada */ }
    const sobra = this.container.querySelector('#yt');
    if (sobra) sobra.remove();
    this.iframe = null;
    this._estado = -1;
    this._lido = null;
    this._seek = null;
    this._legendasDesligadas = false;
  }
}

// ---------------------------------------------------------------------------
// Player falso: vídeo de 600 s, relógio por performance.now(). Só com ?mock=1.
// ---------------------------------------------------------------------------

const VELS_FALSAS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export class PlayerFalso extends Emissor {
  constructor(container, opcoes = {}) {
    super();
    this.container = container;
    this.opcoes = opcoes;
    this._videoId = '';
    this.legendasEscondidas = false;
    this.pedidos = [];
    this._dur = 600;
    this._estado = -1;
    this._vel = 1;
    this._base = 0;
    this._marca = performance.now();
    this._el = null;
    this._timer = null;
    this.mudo = false;
    this._jaTocou = false; // como no YouTube: as faixas de legenda só aparecem depois que o vídeo começa
    this._anuncio = null; // { fim, pulavelEm } durante o anúncio de teste (?mockAnuncio=1)
    this.pedidosPular = 0;
    this._voltas = 0;
  }

  carregar(videoId, inicioSeg = 0) {
    this.destruir();
    this._videoId = videoId;
    const el = document.createElement('div');
    el.className = 'player-falso';
    el.id = 'yt';
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', 'Player de teste');
    el.addEventListener('click', () => (this._estado === 1 ? this.pausar() : this.tocar()));
    this.container.appendChild(el);
    this._el = el;
    this._base = Math.min(this._dur, Math.max(0, inicioSeg || 0));
    this._marca = performance.now();
    this._timer = setInterval(() => this._tique(), 50);
    this._tique();
    return new Promise((resolve) => {
      setTimeout(() => {
        this.emitir('pronto');
        resolve();
        if (this.opcoes.erro) this.emitir('erro', Number(this.opcoes.erro));
      }, 30);
    });
  }

  _tique() {
    if (++this._voltas % 16 === 0) this._avisarFaixasGancho(); // como o gancho: a cada 0,8 s
    if (this._anuncio) {
      if (performance.now() >= this._anuncio.fim) this._fimAnuncio();
      else this._avisarAnuncio();
    }
    const t = this.tempo();
    if (this._estado === 1 && t >= this._dur) {
      this._base = this._dur;
      this._marca = performance.now();
      this._mudar(0);
    }
    if (this._el) {
      const m = Math.floor(t / 60);
      const s = (t % 60).toFixed(1).padStart(4, '0');
      this._el.textContent = `Player de teste · ${m}:${s}`;
    }
  }

  _mudar(estado) {
    this._estado = estado;
    setTimeout(() => this.emitir('estado', estado), 0);
  }

  tempo() {
    if (this._estado === 1 && !this._anuncio) {
      return Math.min(this._dur, this._base + ((performance.now() - this._marca) / 1000) * this._vel);
    }
    return this._base;
  }

  tocar() {
    if (this._estado === 1) return;
    if (this._base >= this._dur) this._base = 0;
    this._marca = performance.now();
    // Anúncio de teste antes do vídeo: 4 s, com "Pular" depois de 1 s.
    if (this.opcoes.anuncio && !this._jaTocou && !this._anuncioVisto) {
      this._anuncioVisto = true;
      const agora = performance.now();
      this._anuncio = { fim: agora + 4000, pulavelEm: agora + 1000 };
      this._avisarAnuncio();
    } else if (!this._anuncio) {
      this._jaTocou = true;
    }
    this._mudar(1);
  }

  _avisarAnuncio() {
    const a = this._anuncio;
    const pulavel = !!a && performance.now() >= a.pulavelEm;
    const msg = { ldAnuncio: true, ativo: !!a, pulavel, x: pulavel ? 200 : 0, y: pulavel ? 150 : 0, w: pulavel ? 90 : 0, h: pulavel ? 30 : 0 };
    const chave = JSON.stringify(msg);
    if (chave === this._ultimoAviso) return;
    this._ultimoAviso = chave;
    window.postMessage(msg, '*');
  }

  _fimAnuncio() {
    this._anuncio = null;
    this._jaTocou = true;
    this._marca = performance.now();
    this._avisarAnuncio();
  }

  silenciar(sim) { this.mudo = !!sim; }

  /** ?mockAnuncio=1 pula; ?mockAnuncio=teimoso ignora o clique por código (precisa do toque do app). */
  pularAnuncio() {
    this.pedidosPular += 1;
    const a = this._anuncio;
    if (a && performance.now() >= a.pulavelEm && this.opcoes.anuncio !== 'teimoso') this._fimAnuncio();
  }

  retangulo() { return this._el ? this._el.getBoundingClientRect() : null; }
  janela() { return window; }

  pausar() {
    if (this._estado !== 1) return;
    this._base = this.tempo();
    this._marca = performance.now();
    this._mudar(2);
  }

  irPara(seg) {
    this._base = Math.min(this._dur, Math.max(0, Number(seg) || 0));
    this._marca = performance.now();
    if (this._estado === 0) this._mudar(2);
  }

  duracao() { return this._dur; }
  estado() { return this._estado; }
  titulo() { return 'Vídeo de teste'; }

  /** ?mockAoVivo=1: transmissão ao vivo (o player só informa depois de carregar). */
  aoVivo() { return !!this.opcoes.aoVivo && this._estado !== -1; }

  manterLegendas() {}

  /** Faixas de teste: inglês automática, inglês feita por pessoa e português. ?mockSemLegenda=1: nenhuma. */
  /** Simula o gancho do app: lista de faixas vista dentro do player (inclui a automática). */
  _avisarFaixasGancho() {
    if (!this._jaTocou || !(this.opcoes.soAsr || this.opcoes.semLegenda || this.opcoes.dublado)) return;
    // ?mockDublado=1: vídeo em inglês com dublagem automática em alemão (uma automática para cada áudio).
    const faixas = this.opcoes.dublado
      ? [
        { languageCode: 'de', kind: 'asr', languageName: 'Deutsch (automatisch erzeugt)', vss_id: 'a.de' },
        { languageCode: 'en', kind: 'asr', languageName: 'English (auto-generated)', vss_id: 'a.en' },
      ]
      : this.opcoes.soAsr
        ? [{ languageCode: 'en', kind: 'asr', languageName: 'English (auto-generated)', vss_id: 'a.en' }]
        : [];
    window.postMessage({
      ldFaixas: true, versao: this.opcoes.dublado ? 4 : 2, video: this._videoId, faixas, fontes: faixas.length ? ['resposta'] : [],
      status: 'OK', temResposta: true, semCaptions: !faixas.length, getPlayerResponse: true,
      audio: this.opcoes.dublado ? { original: 'en', atual: 'de', fonte: 'player' } : null,
    }, '*');
  }

  pedirFaixasAoGancho() { this._avisarFaixasGancho(); }

  /** Simula o download pelo gancho (só no modo ?mockSoAsr=1, em que a API do iframe não vê a faixa). */
  baixarPeloGancho(f) {
    if (!(this.opcoes.soAsr || this.opcoes.dublado) || f.kind !== 'asr') return;
    const events = [];
    for (let i = 0; i < 30; i++) {
      events.push({ tStartMs: Math.round((0.5 + i * 2.2) * 1000), dDurationMs: 2000, segs: [{ utf8: `auto line ${i + 1} from YouTube` }] });
    }
    const url = `https://www.youtube.com/api/timedtext?v=${this._videoId}&lang=${f.languageCode}&kind=asr&fmt=json3`;
    setTimeout(() => window.postMessage({ ldLegenda: true, via: 'mock-gancho', status: 200, url, texto: JSON.stringify({ events }) }, '*'), 200);
  }

  faixasLegenda() {
    if (this.opcoes.semLegenda || this.opcoes.soAsr || this.opcoes.dublado || !this._jaTocou) return { faixas: [], traducoes: [] };
    return {
      faixas: [
        { languageCode: 'en', languageName: 'Inglês', kind: 'asr', vss_id: 'a.en' },
        { languageCode: 'en', languageName: 'Inglês', kind: '', vss_id: '.en' },
        { languageCode: 'pt-BR', languageName: 'Português (Brasil)', kind: '', vss_id: '.pt-BR' },
      ],
      traducoes: [{ languageCode: 'pt', languageName: 'Português' }],
    };
  }

  /** Simula o gancho do app Android: manda pela janela a resposta de /api/timedtext em json3. */
  pedirLegenda(faixa) {
    this.pedidos.push(faixa);
    if (this.opcoes.soAsr || this.opcoes.dublado) return true; // como no YouTube real: a API do iframe não baixa a automática
    const pt = faixa.languageCode.startsWith('pt');
    const events = [];
    for (let i = 0; i < 40; i++) {
      const s = Math.round((0.5 + i * 2.2) * 1000);
      events.push({ tStartMs: s, dDurationMs: 2000, segs: [{ utf8: pt ? `Linha ${i + 1} do YouTube, com ação.` : `Line ${i + 1} from YouTube, with words.` }] });
    }
    const kind = faixa.kind === 'asr' ? '&kind=asr' : '';
    const url = `https://www.youtube.com/api/timedtext?v=${this._videoId}&lang=${faixa.languageCode}${kind}&fmt=json3`;
    // primeiro a legenda de um "anúncio" (outro vídeo), que deve ser ignorada
    setTimeout(() => window.postMessage({ ldLegenda: true, via: 'mock', status: 200, url: url.replace(this._videoId, 'ANUNCIO0000'), texto: JSON.stringify({ events: events.slice(0, 2) }) }, '*'), 40);
    setTimeout(() => window.postMessage({ ldLegenda: true, via: 'mock', status: 200, url, texto: JSON.stringify({ events }) }, '*'), 120);
    return true;
  }

  esconderLegendas() { this.legendasEscondidas = true; }
  velocidades() { return VELS_FALSAS.slice(); }
  velocidade() { return this._vel; }

  definirVelocidade(v) {
    const alvo = VELS_FALSAS.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a), 1);
    this._base = this.tempo();
    this._marca = performance.now();
    this._vel = alvo;
    setTimeout(() => this.emitir('velocidade', alvo), 0);
  }

  /** ?mockVelFina=1: simula o gancho v5 (qualquer velocidade). */
  definirVelocidadeExata(v) {
    const alvo = Math.round(Number(v) * 100) / 100;
    this._base = this.tempo();
    this._marca = performance.now();
    this._vel = alvo;
    setTimeout(() => this.emitir('velocidade', alvo), 0);
  }

  destruir() {
    clearInterval(this._timer);
    this._timer = null;
    try { this._el?.remove(); } catch { /* nada */ }
    this._el = null;
    this._estado = -1;
    this._anuncio = null;
  }
}

/** Cria o player certo conforme o endereço (?mock=1 usa o falso). */
export function criarPlayer(container) {
  const p = new URLSearchParams(location.search);
  if (p.get('mock') === '1') {
    return new PlayerFalso(container, {
      erro: p.get('mockErro'),
      semLegenda: p.get('mockSemLegenda') === '1',
      anuncio: p.get('mockAnuncio') === 'teimoso' ? 'teimoso' : p.get('mockAnuncio') === '1',
      soAsr: p.get('mockSoAsr') === '1',
      aoVivo: p.get('mockAoVivo') === '1',
      dublado: p.get('mockDublado') === '1',
    });
  }
  return new PlayerYouTube(container);
}
