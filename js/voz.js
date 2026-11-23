// voz.js — "Voz mais clara" (app Android, versão 22; PLANO.md seção 22).
//
// O app Android trata o áudio do vídeo em segundo plano (ServicoVoz.java): separa a voz do fundo com um modelo
// de IA e abaixa o fundo só quando ele encobre a fala. Aqui a página:
// - mostra o estado e os botões nos Ajustes e o selo em Meus vídeos;
// - toca o áudio tratado (<audio>) junto com o vídeo, que fica sem som. O relógio do vídeo vem do gancho
//   (dentro do player do YouTube, v6), com o instante exato de cada leitura; o áudio segue esse relógio:
//   diferença pequena corrige mudando a velocidade um pouco, grande pula direto para o ponto;
// - durante anúncio, carregamento ou qualquer falha do áudio tratado, o som original do vídeo volta.
//
// A parte de cima é pura (sem DOM), testada no Node (tests/voz.test.mjs).

export const MARGENS = Object.freeze([
  { db: 8, nome: 'Pouco' },
  { db: 12, nome: 'Médio' },
  { db: 16, nome: 'Muito' },
  { db: 22, nome: 'Máximo' },
]);
export const MARGEM_PADRAO = 12;
export const BYTES_MODELO = 316446953;

/** Diferença tolerada entre o áudio e o vídeo (s): abaixo disso não mexe. */
export const ZONA_MORTA = 0.035;
/** Diferença acima da qual o áudio pula direto para o ponto do vídeo (s). */
export const PULO = 0.25;
/** Correção máxima da velocidade do áudio para alcançar o vídeo (fração). */
export const CORRECAO_MAX = 0.05;
/** Relógio do gancho mais velho que isso (ms) não vale: usa o tempo do player. */
export const RELOGIO_VALIDADE = 700;

/** Agora, no mesmo relógio do gancho (performance.timeOrigin + performance.now(), em ms). */
export function agoraMs() {
  return performance.timeOrigin + performance.now();
}

/**
 * Tempo do vídeo agora, a partir da última leitura do gancho r = { t, at, taxa, pausado, esperando }.
 * Tocando, o vídeo andou (agora − at) × taxa desde a leitura (no máximo 0,5 s de previsão).
 */
export function tempoDoRelogio(r, agora) {
  if (!r || !Number.isFinite(r.t)) return null;
  if (r.pausado || r.esperando) return r.t;
  const passou = Math.max(0, Math.min(0.5, (agora - r.at) / 1000));
  return r.t + passou * (r.taxa > 0 ? r.taxa : 1);
}

/**
 * O que fazer com o áudio tratado agora.
 * tAudio, tVideo: tempos (s); taxa: velocidade do vídeo; deveTocar: o vídeo está andando e o áudio tratado vale;
 * audioPausado, audioBuscando: estado do <audio>.
 * Devolve { pausar, tocar, irPara (s ou null), taxa }.
 */
export function decidirSincronia({ tAudio, tVideo, taxa, deveTocar, audioPausado, audioBuscando }) {
  const v = taxa > 0 ? taxa : 1;
  if (!deveTocar) return { pausar: !audioPausado, tocar: false, irPara: null, taxa: v };
  if (audioBuscando) return { pausar: false, tocar: audioPausado, irPara: null, taxa: v };
  const d = tAudio - tVideo; // > 0: o áudio está adiantado
  if (Math.abs(d) > PULO || (audioPausado && Math.abs(d) > ZONA_MORTA)) {
    return { pausar: false, tocar: audioPausado, irPara: Math.max(0, tVideo), taxa: v };
  }
  let t = v;
  if (Math.abs(d) > ZONA_MORTA) {
    // Corrige em cerca de 1 s: 50 ms atrasado → 5% mais rápido por um instante.
    const c = Math.max(-CORRECAO_MAX, Math.min(CORRECAO_MAX, d));
    t = v * (1 - c);
  }
  return { pausar: false, tocar: audioPausado, irPara: null, taxa: t };
}

/** "cerca de 12 min", "menos de 1 min". */
export function textoMinutos(seg) {
  const s = Number(seg);
  if (!Number.isFinite(s) || s < 0) return '';
  if (s < 60) return 'menos de 1 min';
  const m = Math.round(s / 60);
  if (m < 60) return `cerca de ${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `cerca de ${h} h${r ? ` ${String(r).padStart(2, '0')}` : ''}`;
}

/**
 * Como mostrar um vídeo: { estado, selo, texto, progresso } a partir do estado do app (v = videos[id]).
 * estado: 'nada' | 'fila' | 'trabalhando' | 'pronto' | 'erro'.
 */
export function descreverVideo(v, geral = {}) {
  if (!v) return { estado: 'nada', selo: '', texto: '', progresso: null };
  const pct = Math.max(0, Math.min(100, Math.floor(100 * (Number(v.progresso) || 0))));
  const resta = Number(v.restante) > 0 ? `, faltam ${textoMinutos(v.restante)}` : '';
  switch (v.estado) {
    case 'pronto':
      return {
        estado: 'pronto',
        selo: 'Voz clara',
        texto: v.mixando ? 'Ajustando o volume do fundo…' : 'Pronto: a voz fica mais clara, e o fundo só abaixa quando alguém fala.',
        progresso: null,
      };
    case 'fila': {
      const modelo = geral.modelo?.estado;
      const esperandoModelo = modelo === 'fila' || modelo === 'baixando' || modelo === 'verificando';
      return {
        estado: 'fila',
        selo: 'Na fila',
        texto: esperandoModelo ? 'Esperando o download do modelo de voz.' : 'Na fila: começa quando o vídeo anterior terminar.',
        progresso: null,
      };
    }
    case 'baixando':
      return { estado: 'trabalhando', selo: `Tratando ${pct}%`, texto: `Baixando o áudio do vídeo… ${pct}%`, progresso: pct };
    case 'separando':
      return { estado: 'trabalhando', selo: `Tratando ${pct}%`, texto: `Separando a voz do fundo… ${pct}%${resta}`, progresso: pct };
    case 'mixando':
      return { estado: 'trabalhando', selo: `Tratando ${pct}%`, texto: `Ajustando o volume do fundo… ${pct}%`, progresso: pct };
    case 'erro':
      return { estado: 'erro', selo: '', texto: v.erro || 'Não deu para tratar o áudio.', progresso: null };
    default:
      return { estado: 'nada', selo: '', texto: '', progresso: null };
  }
}

const MB = (b) => Math.round((Number(b) || 0) / 1e6);

// ---------------------------------------------------------------------------------------------- controle (DOM)

/**
 * ctx: {
 *   disponivel(): o app sabe tratar o áudio (APK 22+ com a ponte);
 *   ajustes(): objeto dos ajustes (vozMargem, vozAuto); salvar(): grava os ajustes;
 *   player(), registro(), salvarRegistro(reg), anuncio(), carregando(): o vídeo está na espera da legenda;
 *   velocidade(): velocidade confirmada do vídeo; mandar(msg): para o app; toast(msg, ms); dialogo(op);
 *   naTelaDoVideo(); urlArquivo(id, arquivo): endereço do áudio tratado; diag(texto)
 * }
 */
export function criarVoz(ctx) {
  const V = {
    estado: null, // último estado do app (ldVozEstado)
    relogio: null, // { t, at, taxa, pausado, esperando, anuncio, chegou }
    audio: null,
    src: '',
    mutei: false,
    falhaAte: 0, // falha do áudio tratado: som original até este instante (ms)
    ultimoAudio: { t: -1, em: 0 },
    autoPedido: new Set(),
    avisadoPronto: new Set(),
    avisadoErro: new Set(),
    anterior: {}, // estado anterior de cada vídeo (para avisar quando fica pronto)
    mudoEm: 0,
  };

  function elementoAudio() {
    if (V.audio) return V.audio;
    const a = document.createElement('audio');
    a.id = 'audio-voz';
    a.preload = 'auto';
    a.hidden = true;
    try { a.preservesPitch = true; } catch { /* nada */ }
    a.addEventListener('error', () => {
      if (!V.src) return;
      ctx.diag?.(`voz: o áudio tratado não tocou (${a.error?.code ?? '?'})`);
      falhar('Não consegui tocar o áudio tratado. O vídeo continua com o som original.');
    });
    document.body.appendChild(a);
    V.audio = a;
    return a;
  }

  function falhar(msg) {
    V.falhaAte = performance.now() + 15000;
    if (msg) ctx.toast?.(msg, 3500);
  }

  function videoAtual() {
    const reg = ctx.registro();
    return reg && V.estado?.videos ? V.estado.videos[reg.id] || null : null;
  }

  /** O áudio tratado deste vídeo vale agora? (pronto, ligado, sem falha recente) */
  function usar() {
    const reg = ctx.registro();
    const v = videoAtual();
    return !!(ctx.disponivel() && reg && v && v.estado === 'pronto' && v.arquivo && !reg.vozDesligada
      && performance.now() >= V.falhaAte);
  }

  function silenciarYoutube(sim) {
    const p = ctx.player();
    if (!p) return;
    p.silenciar?.(sim);
    V.mutei = sim;
  }

  function soltarAudio() {
    const a = V.audio;
    if (a && V.src) {
      try { a.pause(); } catch { /* nada */ }
      a.removeAttribute('src');
      try { a.load(); } catch { /* nada */ }
    }
    V.src = '';
  }

  /** Volta ao som original (sem áudio tratado). */
  function desligar() {
    soltarAudio();
    if (V.mutei) {
      if (!ctx.carregando()) silenciarYoutube(false);
      V.mutei = false;
    }
  }

  /** Chamado a cada quadro (laço da tela do vídeo). */
  function tique() {
    const p = ctx.player();
    if (!p || !usar()) {
      if (V.src || V.mutei) desligar();
      // O YouTube guarda "sem som" no aparelho: se o app foi fechado com o áudio tratado tocando, o próximo
      // vídeo começaria mudo. Fora da espera da legenda e do anúncio, o vídeo sem áudio tratado tem som.
      if (p && ctx.disponivel() && !ctx.carregando() && !ctx.anuncio() && p.estaMudo?.()
        && performance.now() - V.mudoEm > 1000) {
        V.mudoEm = performance.now();
        p.silenciar?.(false);
      }
      pedirAuto();
      return;
    }
    const reg = ctx.registro();
    const v = videoAtual();
    const a = elementoAudio();
    const url = ctx.urlArquivo(reg.id, v.arquivo);
    if (V.src !== url) {
      V.src = url;
      a.src = url;
      V.ultimoAudio = { t: -1, em: performance.now() };
    }
    const anuncio = ctx.anuncio() || !!(V.relogio && V.relogio.anuncio && performance.now() - V.relogio.chegou < RELOGIO_VALIDADE);
    const espera = ctx.carregando();
    // Som do YouTube: sem som enquanto o áudio tratado vale; com som no anúncio.
    if (anuncio) {
      if (V.mutei) silenciarYoutube(false);
    } else if (!espera && (!V.mutei || p.estaMudo?.() === false) && performance.now() - V.mudoEm > 500) {
      V.mudoEm = performance.now(); // no máximo 2 pedidos por segundo
      silenciarYoutube(true);
    }
    // Relógio do vídeo
    const agora = agoraMs();
    const r = V.relogio;
    const fresco = r && performance.now() - r.chegou < RELOGIO_VALIDADE;
    let tVideo, tocando, taxa;
    if (fresco) {
      tVideo = tempoDoRelogio(r, agora);
      tocando = !r.pausado && !r.esperando;
      taxa = r.taxa;
    } else {
      tVideo = p.tempo();
      tocando = p.estado() === 1;
      taxa = ctx.velocidade();
    }
    if (a.readyState < 1) return; // ainda sem os dados do arquivo
    const deveTocar = tocando && !anuncio && !espera;
    const d = decidirSincronia({
      tAudio: a.currentTime, tVideo, taxa, deveTocar, audioPausado: a.paused, audioBuscando: a.seeking,
    });
    if (d.pausar) a.pause();
    if (d.irPara !== null) {
      try { a.currentTime = d.irPara; } catch { /* nada */ }
      V.ultimoAudio = { t: -1, em: performance.now() };
    }
    if (Math.abs(a.playbackRate - d.taxa) > 1e-4) {
      try { a.playbackRate = d.taxa; } catch { /* nada */ }
    }
    if (d.tocar) a.play().catch(() => { /* o próximo quadro tenta de novo */ });
    // Áudio travado (deveria andar e não anda há 2,5 s): volta ao som original por 15 s.
    if (deveTocar && !a.paused && !a.seeking) {
      if (Math.abs(a.currentTime - V.ultimoAudio.t) > 0.001) {
        V.ultimoAudio = { t: a.currentTime, em: performance.now() };
      } else if (performance.now() - V.ultimoAudio.em > 2500) {
        ctx.diag?.('voz: o áudio tratado travou; som original por 15 s');
        falhar('');
        desligar();
      }
    } else {
      V.ultimoAudio = { t: a.currentTime, em: performance.now() };
    }
  }

  /** Tratar sozinho (ajuste vozAuto) o vídeo aberto, uma vez, se o modelo já estiver no celular. */
  function pedirAuto() {
    const reg = ctx.registro();
    if (!ctx.ajustes().vozAuto || !reg || !reg.estudo || reg.vozAutoNao || !ctx.disponivel() || !V.estado) return;
    if (V.autoPedido.has(reg.id) || videoAtual()) return;
    if (V.estado.modelo?.estado !== 'pronto') return;
    V.autoPedido.add(reg.id);
    ctx.mandar({ acao: 'vozTratar', id: reg.id, titulo: reg.titulo || '', margem: margem() });
  }

  function margem() {
    const m = Number(ctx.ajustes().vozMargem);
    return MARGENS.some((x) => x.db === m) ? m : MARGEM_PADRAO;
  }

  /** O gancho (dentro do player) manda o relógio do vídeo várias vezes por segundo. */
  function aoRelogio(d) {
    if (!d || d.ldTempo !== true || !Number.isFinite(Number(d.t))) return;
    V.relogio = {
      t: Number(d.t), at: Number(d.at) || agoraMs(), taxa: Number(d.taxa) || 1,
      pausado: !!d.pausado, esperando: !!d.esperando, anuncio: !!d.anuncio, chegou: performance.now(),
    };
  }

  /** O app mandou o estado (window.ldVozEstado). */
  function aoEstado(texto) {
    let e;
    try { e = JSON.parse(texto); } catch { return; }
    if (!e || typeof e !== 'object' || !e.videos) return;
    V.estado = e;
    const reg = ctx.registro();
    for (const [id, v] of Object.entries(e.videos)) {
      const antes = V.anterior[id];
      V.anterior[id] = v.estado;
      if (!antes || antes === v.estado) continue;
      if (v.estado === 'pronto' && !V.avisadoPronto.has(id)) {
        V.avisadoPronto.add(id);
        if (reg && reg.id === id && ctx.naTelaDoVideo()) {
          ctx.toast?.(reg.vozDesligada ? 'O áudio tratado deste vídeo está pronto. Ligue em ⚙ Ajustes → Voz mais clara.'
            : 'Áudio tratado pronto: voz mais clara ligada.', 3500);
        } else {
          ctx.toast?.(`Áudio tratado pronto: “${v.titulo || 'vídeo'}”. Está em Meus vídeos.`, 4000);
        }
      } else if (v.estado === 'erro' && !V.avisadoErro.has(id + v.erro)) {
        V.avisadoErro.add(id + v.erro);
        if (reg && reg.id === id) ctx.toast?.(`Não deu para tratar o áudio: ${v.erro || ''}`, 5000);
      }
    }
    renderAjustes();
    atualizarSelos();
  }

  function pedirEstado() {
    if (!ctx.disponivel()) return;
    ctx.mandar({ acao: 'vozEstado' });
  }

  // ------------------------------------------------------------------------------ Ajustes

  function $(s) { return document.querySelector(s); }

  function renderAjustes() {
    const grupo = $('#grupo-voz');
    if (!grupo) return;
    grupo.hidden = !ctx.disponivel();
    if (grupo.hidden) return;
    const e = V.estado;
    const reg = ctx.registro();
    // Este vídeo
    const bloco = $('#voz-video');
    bloco.hidden = !reg;
    if (reg) {
      const v = videoAtual();
      const d = descreverVideo(v, e || {});
      const est = bloco.querySelector('.pm-estado');
      const txt = bloco.querySelector('.pm-texto');
      const barra = bloco.querySelector('.pm-barra');
      bloco.dataset.estado = d.estado;
      barra.hidden = d.progresso === null;
      if (d.progresso !== null) barra.firstElementChild.style.width = `${d.progresso}%`;
      est.textContent = d.estado === 'pronto' ? (reg.vozDesligada ? 'Desligado' : 'Ligado')
        : d.estado === 'trabalhando' ? `${d.progresso}%` : d.estado === 'fila' ? 'Na fila' : d.estado === 'erro' ? 'Falhou' : '';
      if (!e) {
        txt.textContent = 'Consultando o app…';
      } else if (d.estado === 'nada') {
        const spp = Number(e.segPorSeg);
        const dur = Number(v?.duracao) || 0;
        txt.textContent = spp > 0 && dur > 0
          ? `O app separa a voz do fundo no celular. Neste vídeo deve levar ${textoMinutos(spp * dur)}; dá para sair dele ou assistir outro enquanto isso.`
          : 'O app separa a voz do fundo no celular. Leva mais ou menos o tempo do vídeo; dá para sair dele ou assistir outro enquanto isso (o andamento fica nas notificações).';
      } else {
        txt.textContent = d.texto;
      }
      $('#voz-tratar').hidden = !(d.estado === 'nada' || d.estado === 'erro');
      $('#voz-tratar').textContent = d.estado === 'erro' ? 'Tentar de novo' : 'Tratar o áudio deste vídeo';
      $('#voz-cancelar').hidden = !(d.estado === 'fila' || d.estado === 'trabalhando');
      $('#voz-apagar-video').hidden = d.estado !== 'pronto';
      $('#voz-copiar').hidden = !(d.estado === 'erro' && v?.detalhe);
      const linhaUsar = $('#voz-usar-linha');
      linhaUsar.hidden = d.estado !== 'pronto';
      $('#voz-usar').checked = !reg.vozDesligada;
    }
    // Margem
    const linha = $('#linha-voz-margem');
    if (linha && !linha.childElementCount) {
      for (const m of MARGENS) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip';
        b.dataset.db = String(m.db);
        b.textContent = m.nome;
        b.addEventListener('click', () => mudarMargem(m.db));
        linha.appendChild(b);
      }
    }
    for (const b of linha?.children || []) b.classList.toggle('confirmada', Number(b.dataset.db) === margem());
    const auto = $('#voz-auto');
    if (auto) auto.checked = !!ctx.ajustes().vozAuto;
    // Modelo
    const bm = $('#voz-modelo');
    const m = e?.modelo || {};
    const estM = bm.querySelector('.pm-estado');
    const txtM = bm.querySelector('.pm-texto');
    const barraM = bm.querySelector('.pm-barra');
    const baixando = m.estado === 'baixando' || m.estado === 'fila' || m.estado === 'verificando';
    barraM.hidden = !baixando;
    const pctM = m.total ? Math.floor((100 * (m.feitos || 0)) / m.total) : 0;
    if (baixando) barraM.firstElementChild.style.width = `${pctM}%`;
    $('#voz-baixar-modelo').hidden = m.estado === 'pronto' || baixando;
    $('#voz-baixar-modelo').textContent = m.estado === 'erro' ? 'Tentar de novo' : `Baixar (${MB(BYTES_MODELO)} MB)`;
    $('#voz-cancelar-modelo').hidden = !baixando;
    $('#voz-apagar-modelo').hidden = m.estado !== 'pronto';
    if (m.estado === 'pronto') {
      estM.textContent = 'Instalado';
      txtM.textContent = 'Modelo HT-Demucs (Meta, licença MIT). Roda no celular, sem internet.';
    } else if (m.estado === 'verificando') {
      estM.textContent = '';
      txtM.textContent = 'Conferindo o arquivo baixado…';
    } else if (baixando) {
      estM.textContent = `${pctM}%`;
      txtM.textContent = `Baixando… ${MB(m.feitos)} de ${MB(m.total || BYTES_MODELO)} MB. Pode sair do app: o download continua (o andamento fica nas notificações).`;
    } else if (m.estado === 'erro') {
      estM.textContent = 'Falhou';
      txtM.textContent = m.erro || 'O download falhou.';
    } else {
      estM.textContent = '';
      txtM.textContent = `Baixado uma vez só (${MB(BYTES_MODELO)} MB; use Wi‑Fi). Sem ele, o app não consegue separar a voz.`;
    }
    // Espaço
    const esp = $('#voz-espaco');
    const qtd = e ? Object.values(e.videos).filter((x) => x.estado === 'pronto').length : 0;
    esp.textContent = e ? `Áudios tratados: ${qtd} vídeo${qtd === 1 ? '' : 's'}, ${MB(e.usado)} MB. Livre no celular: ${MB(e.livre)} MB.` : '';
    $('#voz-apagar-todos').hidden = !(e && (e.usado > 0 || qtd > 0));
  }

  async function tratarEste() {
    const reg = ctx.registro();
    if (!reg) return;
    const m = V.estado?.modelo?.estado;
    if (m !== 'pronto' && m !== 'baixando' && m !== 'fila' && m !== 'verificando') {
      const r = await ctx.dialogo({
        texto: `Para tratar o áudio, o app baixa uma vez o modelo de separação de voz (${MB(BYTES_MODELO)} MB; use Wi‑Fi). `
          + 'Depois, o tratamento roda no próprio celular.',
        ok: 'Baixar e tratar',
        cancelar: 'Agora não',
      });
      if (!r.ok) return;
    }
    if (reg.vozAutoNao) {
      reg.vozAutoNao = false;
      await ctx.salvarRegistro(reg);
    }
    ctx.mandar({ acao: 'vozTratar', id: reg.id, titulo: reg.titulo || '', margem: margem() });
    ctx.toast?.('O áudio deste vídeo entrou na fila. Pode continuar assistindo: o som muda sozinho quando ficar pronto.', 4000);
  }

  async function mudarMargem(db) {
    if (db === margem()) return;
    ctx.ajustes().vozMargem = db;
    ctx.salvar();
    renderAjustes();
    const reg = ctx.registro();
    const v = videoAtual();
    if (reg && v && (v.estado === 'pronto' || v.estado === 'fila')) {
      ctx.mandar({ acao: 'vozMixar', id: reg.id, margem: db });
      if (v.estado === 'pronto') ctx.toast?.('Ajustando o volume do fundo… o som muda em alguns segundos.', 3000);
    }
  }

  async function aoMudarAuto(el) {
    const ligar = el.checked;
    if (ligar && V.estado?.modelo?.estado !== 'pronto') {
      const r = await ctx.dialogo({
        texto: `Para tratar os vídeos sozinho, o app precisa do modelo de separação de voz (${MB(BYTES_MODELO)} MB; use Wi‑Fi). Baixar agora?`,
        ok: 'Baixar',
        cancelar: 'Cancelar',
      });
      if (!r.ok) { el.checked = false; return; }
      ctx.mandar({ acao: 'vozBaixarModelo' });
    }
    ctx.ajustes().vozAuto = ligar;
    ctx.salvar();
    renderAjustes();
  }

  async function apagarEste() {
    const reg = ctx.registro();
    if (!reg) return;
    const r = await ctx.dialogo({ texto: 'Apagar o áudio tratado deste vídeo? O vídeo volta ao som original. Dá para tratar de novo depois.', ok: 'Apagar' });
    if (!r.ok) return;
    desligar();
    ctx.mandar({ acao: 'vozApagar', id: reg.id });
  }

  async function apagarTodos() {
    const r = await ctx.dialogo({ texto: 'Apagar os áudios tratados de todos os vídeos? Os vídeos voltam ao som original (o modelo continua no celular).', ok: 'Apagar' });
    if (!r.ok) return;
    desligar();
    ctx.mandar({ acao: 'vozApagarTodos' });
  }

  async function apagarModelo() {
    const r = await ctx.dialogo({ texto: `Apagar o modelo de separação de voz? Libera ${MB(BYTES_MODELO)} MB. Os áudios já tratados continuam funcionando.`, ok: 'Apagar' });
    if (!r.ok) return;
    ctx.mandar({ acao: 'vozApagarModelo' });
  }

  function ligarEventos() {
    $('#voz-tratar')?.addEventListener('click', tratarEste);
    $('#voz-cancelar')?.addEventListener('click', async () => {
      const reg = ctx.registro();
      if (!reg) return;
      ctx.mandar({ acao: 'vozCancelar', id: reg.id });
      // Cancelado pela pessoa: o "tratar sozinho" não pede de novo para este vídeo.
      reg.vozAutoNao = true;
      await ctx.salvarRegistro(reg);
    });
    $('#voz-apagar-video')?.addEventListener('click', apagarEste);
    $('#voz-usar')?.addEventListener('change', async (ev) => {
      const reg = ctx.registro();
      if (!reg) return;
      reg.vozDesligada = !ev.target.checked;
      await ctx.salvarRegistro(reg);
      renderAjustes();
    });
    $('#voz-auto')?.addEventListener('change', (ev) => aoMudarAuto(ev.target));
    $('#voz-baixar-modelo')?.addEventListener('click', () => ctx.mandar({ acao: 'vozBaixarModelo' }));
    $('#voz-cancelar-modelo')?.addEventListener('click', () => ctx.mandar({ acao: 'vozCancelarModelo' }));
    $('#voz-apagar-modelo')?.addEventListener('click', apagarModelo);
    $('#voz-apagar-todos')?.addEventListener('click', apagarTodos);
    $('#voz-copiar')?.addEventListener('click', async () => {
      const v = videoAtual();
      try { await navigator.clipboard.writeText(`Voz mais clara: ${v?.erro || ''}\n${v?.detalhe || ''}`); ctx.toast?.('Diagnóstico copiado.'); } catch { /* nada */ }
    });
  }

  // ------------------------------------------------------------------------------ Meus vídeos

  /** Selo de um vídeo em Meus vídeos ('' = nenhum). */
  function selo(id) {
    const v = V.estado?.videos?.[id];
    return descreverVideo(v, V.estado || {}).selo;
  }

  function atualizarSelos() {
    for (const li of document.querySelectorAll('#lista-biblioteca [data-id]')) {
      const s = li.querySelector('.selo-voz');
      if (!s) continue;
      const t = selo(li.dataset.id);
      s.textContent = t;
      s.hidden = !t;
    }
  }

  return {
    tique, aoRelogio, aoEstado, pedirEstado, renderAjustes, ligarEventos, selo, desligar,
    aoApagarVideo: (id) => ctx.mandar({ acao: 'vozApagar', id }),
    estado: () => V.estado,
    tocandoTratado: () => !!V.src && V.mutei,
  };
}
