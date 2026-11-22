// timedtext.js — lê a legenda no formato que o player do YouTube baixa (/api/timedtext):
// json3, srv3 (XML com <p t= d=>), formato 1 (XML com <text start= dur=>) ou WebVTT.
// Usado pelo protótipo do app Android (prototipo.html). Sem DOM: funciona também no Node (testes).

import { lerLegenda } from './legendas.js';

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

function lerJson3(obj) {
  const falas = [];
  for (const ev of obj.events || []) {
    if (!Array.isArray(ev.segs)) continue;
    const t = limpar(ev.segs.map((s) => s.utf8 || '').join(''));
    if (!t) continue;
    const s = (Number(ev.tStartMs) || 0) / 1000;
    const e = s + (Number(ev.dDurationMs) || 0) / 1000;
    falas.push({ s, e, t });
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
    falas.push({ s: t0 / 1000, e: (t0 + (Number.isFinite(d) ? d : 0)) / 1000, t });
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
      const falas = lerJson3(JSON.parse(bruto));
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
      return falas.length ? { formato, falas } : { erro: 'XML sem falas.' };
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
