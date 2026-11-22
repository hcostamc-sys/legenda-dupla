// timedtext.js — lê a legenda no formato que o player do YouTube baixa (/api/timedtext):
// json3, srv3 (XML com <p t= d=>), formato 1 (XML com <text start= dur=>) ou WebVTT.
// Usado pelo protótipo do app Android (prototipo.html). Sem DOM: funciona também no Node (testes).

import { lerLegenda, corrigirSequencia } from './legendas.js';

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodificarEntidades(texto) {
  return String(texto).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, c) => {
    if (c[0] === '#') {
      const n = c[1] === 'x' || c[1] === 'X' ? parseInt(c.slice(2), 16) : parseInt(c.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    const v = ENTIDADES[c.toLowerCase()];
    return v === undefined ? m : v;
  });
}

function limpar(t) {
  return t.replace(/\s+/g, ' ').trim();
}

function atributo(attrs, nome) {
  const m = new RegExp(`\\b${nome}="([^"]*)"`).exec(attrs);
  return m ? m[1] : null;
}

// Duração máxima de uma palavra falada (o YouTube só informa onde cada palavra começa).
const durMaxPalavra = (w) => Math.min(1.5, Math.max(0.5, 0.25 + 0.09 * w.length));

/**
 * Palavras com o tempo real (legenda automática): pedaços [{ texto, ms }] com o início de cada um.
 * Cada pedaço pode ter mais de uma palavra (divide o tempo pelo tamanho). Devolve [{ w, s, e }]
 * ou null quando não há tempo por palavra (legenda feita por pessoa) ou o texto não bate.
 */
function palavrasReais(pedacos, fimMs, textoFala) {
  if (pedacos.length < 2 || !pedacos.slice(1).some((x) => Number.isFinite(x.ms))) return null;
  const ps = [];
  for (let i = 0; i < pedacos.length; i++) {
    const ini = pedacos[i].ms;
    if (!Number.isFinite(ini)) return null;
    let prox = fimMs;
    for (let j = i + 1; j < pedacos.length; j++) if (Number.isFinite(pedacos[j].ms)) { prox = pedacos[j].ms; break; }
    const ws = limpar(pedacos[i].texto).split(' ').filter(Boolean);
    if (!ws.length) continue;
    const total = ws.join(' ').length || 1;
    let pos = 0;
    const span = Math.max(0, prox - ini);
    ws.forEach((w, k) => {
      const s = ini + (span * pos) / total;
      pos += w.length + 1;
      const fimProx = k + 1 < ws.length ? ini + (span * pos) / total : prox;
      const e = Math.min(fimProx, s + durMaxPalavra(w) * 1000);
      ps.push({ w, s: s / 1000, e: Math.max(s, e) / 1000 });
    });
  }
  if (!ps.length || ps.map((p) => p.w).join(' ') !== textoFala) return null;
  return ps;
}

function lerJson3(obj) {
  const falas = [];
  for (const ev of obj.events || []) {
    if (!Array.isArray(ev.segs)) continue;
    const t = limpar(ev.segs.map((s) => s.utf8 || '').join(''));
    if (!t) continue;
    const t0 = Number(ev.tStartMs) || 0;
    const fimMs = t0 + (Number(ev.dDurationMs) || 0);
    const s = t0 / 1000;
    const e = fimMs / 1000;
    const fala = { s, e, t };
    const ps = palavrasReais(ev.segs.map((sg) => ({ texto: sg.utf8 || '', ms: t0 + (sg.tOffsetMs === undefined ? (sg === ev.segs[0] ? 0 : NaN) : Number(sg.tOffsetMs)) })), fimMs, t);
    if (ps) fala.ps = ps;
    falas.push(fala);
  }
  return falas;
}

function lerSrv3(xml) {
  const falas = [];
  const re = /<p\b([^>]*)>([\s\S]*?)<\/p>/g;
  let m;
  while ((m = re.exec(xml))) {
    const t0 = Number(atributo(m[1], 't'));
    const d = Number(atributo(m[1], 'd'));
    const t = limpar(decodificarEntidades(m[2].replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')));
    if (!t || !Number.isFinite(t0)) continue;
    const fimMs = t0 + (Number.isFinite(d) ? d : 0);
    const fala = { s: t0 / 1000, e: fimMs / 1000, t };
    // Legenda automática: <s t="300">palavra</s> com o início de cada palavra.
    const pedacos = [];
    const reS = /<s\b([^>]*)>([\s\S]*?)<\/s>/g;
    let n;
    while ((n = reS.exec(m[2]))) {
      const off = atributo(n[1], 't');
      pedacos.push({ texto: decodificarEntidades(n[2].replace(/<[^>]+>/g, '')), ms: t0 + (off === null ? (pedacos.length ? NaN : 0) : Number(off)) });
    }
    const ps = palavrasReais(pedacos, fimMs, t);
    if (ps) fala.ps = ps;
    falas.push(fala);
  }
  return falas;
}

function lerFormato1(xml) {
  const falas = [];
  const re = /<text\b([^>]*)>([\s\S]*?)<\/text>/g;
  let m;
  while ((m = re.exec(xml))) {
    const s = Number(atributo(m[1], 'start'));
    const d = Number(atributo(m[1], 'dur'));
    // o formato 1 vem com entidades escapadas duas vezes (&amp;#39;)
    const t = limpar(decodificarEntidades(decodificarEntidades(m[2])).replace(/<[^>]+>/g, ''));
    if (!t || !Number.isFinite(s)) continue;
    falas.push({ s, e: s + (Number.isFinite(d) ? d : 0), t });
  }
  return falas;
}

/** Devolve { formato, falas: [{ s, e, t }] } ou { erro }. */
export function lerTimedText(texto) {
  const bruto = String(texto || '').replace(/^﻿/, '').trim();
  if (!bruto) return { erro: 'Resposta vazia (o YouTube não entregou o texto).' };
  try {
    if (bruto[0] === '{') {
      // corrigirSequencia: ordena, tira a rolagem da legenda automática e as sobreposições
      const falas = corrigirSequencia(lerJson3(JSON.parse(bruto)));
      return falas.length ? { formato: 'json3', falas } : { erro: 'JSON sem falas.' };
    }
    if (/^WEBVTT/.test(bruto)) {
      const r = lerLegenda(bruto);
      return r.erro ? { erro: r.erro } : { formato: 'vtt', falas: r.falas };
    }
    if (bruto[0] === '<') {
      let falas = lerSrv3(bruto);
      let formato = 'srv3';
      if (!falas.length) { falas = lerFormato1(bruto); formato = 'xml'; }
      return falas.length ? { formato, falas: corrigirSequencia(falas) } : { erro: 'XML sem falas.' };
    }
  } catch (e) {
    return { erro: `Não consegui ler: ${e.message}` };
  }
  return { erro: 'Formato desconhecido.' };
}

function tempoSrt(seg) {
  const ms = Math.max(0, Math.round(seg * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  const p = (n, k = 2) => String(n).padStart(k, '0');
  return `${p(h)}:${p(m)}:${p(s)},${p(r, 3)}`;
}

/** Monta um arquivo .srt (para conferir o que foi capturado). */
export function paraSrt(falas) {
  return falas.map((f, i) => `${i + 1}\n${tempoSrt(f.s)} --> ${tempoSrt(Math.max(f.e, f.s + 0.5))}\n${f.t}\n`).join('\n');
}

/** Lê os parâmetros úteis de uma URL de legenda: idioma, tradução, formato, automática, token. */
export function infoUrl(url) {
  try {
    const u = new URL(url, 'https://www.youtube.com');
    const q = u.searchParams;
    return {
      video: q.get('v') || '',
      idioma: q.get('lang') || '',
      traducao: q.get('tlang') || '',
      formato: q.get('fmt') || '',
      automatica: q.get('kind') === 'asr',
      token: q.has('pot'),
    };
  } catch {
    return { video: '', idioma: '', traducao: '', formato: '', automatica: false, token: false };
  }
}

// ---------------------------------------------------------------- escolha da faixa

/**
 * Faixa sugerida: a do idioma falado. A legenda automática do YouTube só existe no idioma do
 * áudio, então ela indica o idioma; se houver uma feita por pessoa nesse idioma, ela é melhor.
 */
export function faixaSugerida(faixas, idiomaAjuste = 'auto', idiomaAudio = '') {
  if (!faixas.length) return -1;
  const base = (c) => {
    const b = String(c || '').toLowerCase().split('-')[0];
    return { he: 'iw', jv: 'jw', fil: 'tl' }[b] || b;
  };
  // 1) O idioma do áudio original, quando o player (ou o título) informa: é o idioma falado.
  // 2) Sem isso, a automática: ela só existe no idioma do áudio... exceto em vídeos com dublagem
  //    automática, que têm uma automática para cada dublagem. Por isso o áudio vem antes.
  const asrs = faixas.filter((f) => f.kind === 'asr');
  let idioma = '';
  if (idiomaAudio && faixas.some((f) => base(f.languageCode) === base(idiomaAudio))) idioma = base(idiomaAudio);
  if (!idioma && asrs.length) idioma = base(asrs[0].languageCode);
  if (!idioma && idiomaAjuste !== 'auto' && faixas.some((f) => base(f.languageCode) === idiomaAjuste)) idioma = idiomaAjuste;
  if (!idioma) {
    const padrao = faixas.find((f) => f.is_default);
    idioma = padrao ? base(padrao.languageCode) : faixas.some((f) => base(f.languageCode) === 'en') ? 'en' : base(faixas[0].languageCode);
  }
  const doIdioma = faixas.map((f, i) => ({ f, i })).filter(({ f }) => base(f.languageCode) === idioma);
  const humana = doIdioma.find(({ f }) => f.kind !== 'asr');
  return (humana || doIdioma[0] || { i: 0 }).i;
}
