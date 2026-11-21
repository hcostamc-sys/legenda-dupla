// player.js — adaptador do player (PLANO.md seções 4 e 7).
// Duas implementações com a mesma interface: PlayerYouTube (real) e PlayerFalso (?mock=1).
//
// carregar(videoId, inicioSeg) -> Promise (resolvida no "pronto")
// tocar() pausar() irPara(seg, buscar = true) tempo() duracao() estado() titulo()
// velocidades() velocidade() definirVelocidade(v) destruir()
// eventos (on): pronto, estado, velocidade, erro, autoplayBloqueado

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
  }

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
            this._aplicarSemLegendas();
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
            if (e.data === 1 && !this._legendasDesligadas) {
              this._aplicarSemLegendas();
              this._legendasDesligadas = true;
            }
            this.emitir('estado', e.data);
          },
          onPlaybackRateChange: (e) => {
            this._rebase();
            this._vel = Number(e.data) || 1;
            this.emitir('velocidade', this._vel);
          },
          onError: (e) => this.emitir('erro', e.data),
          onAutoplayBlocked: () => this.emitir('autoplayBloqueado'),
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

  velocidades() {
    try {
      const v = this.yt?.getAvailablePlaybackRates?.();
      if (Array.isArray(v) && v.length) return v;
    } catch { /* nada */ }
    return [1];
  }

  velocidade() { return this._vel; }
  definirVelocidade(v) { try { this.yt?.setPlaybackRate(Number(v)); } catch { /* nada */ } }

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
    this._dur = 600;
    this._estado = -1;
    this._vel = 1;
    this._base = 0;
    this._marca = performance.now();
    this._el = null;
    this._timer = null;
  }

  carregar(videoId, inicioSeg = 0) {
    this.destruir();
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
    if (this._estado === 1) {
      return Math.min(this._dur, this._base + ((performance.now() - this._marca) / 1000) * this._vel);
    }
    return this._base;
  }

  tocar() {
    if (this._estado === 1) return;
    if (this._base >= this._dur) this._base = 0;
    this._marca = performance.now();
    this._mudar(1);
  }

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
  velocidades() { return VELS_FALSAS.slice(); }
  velocidade() { return this._vel; }

  definirVelocidade(v) {
    const alvo = VELS_FALSAS.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a), 1);
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
  }
}

/** Cria o player certo conforme o endereço (?mock=1 usa o falso). */
export function criarPlayer(container) {
  const p = new URLSearchParams(location.search);
  if (p.get('mock') === '1') return new PlayerFalso(container, { erro: p.get('mockErro') });
  return new PlayerYouTube(container);
}
