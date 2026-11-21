// legendas.js — módulo PURO (sem DOM). Lê SRT/VTT, limpa, monta frases,
// pareia a tradução, acha a fala atual, calcula a navegação e lê links.
// Seções do PLANO.md: 5, 6 e 7.4.

export const LIMITE_BYTES = 5 * 1024 * 1024;
export const MSG_SEM_LEGENDA = 'Esse arquivo não tem legendas que eu consiga ler.';
export const MSG_LINK_INVALIDO = 'Não reconheci esse link do YouTube.';

const arred = (x) => Math.round(x * 1000) / 1000;

// ---------------------------------------------------------------------------
// 5.1 Link do YouTube
// ---------------------------------------------------------------------------

const RE_ID = /^[A-Za-z0-9_-]{11}$/;
const RE_URL = /(?:https?:\/\/)?(?:(?:www|m|music)\.)?(?:youtube\.com|youtube-nocookie\.com|youtu\.be)\/[^\s<>"'`]*/gi;

/** Converte "90", "90s", "1m30s", "1h2m3s" em segundos. Devolve 0 se não entender. */
export function lerTempoLink(valor) {
  if (valor == null) return 0;
  const v = String(valor).trim().toLowerCase();
  if (/^\d+(\.\d+)?s?$/.test(v)) return Math.floor(parseFloat(v));
  const m = v.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (m && (m[1] || m[2] || m[3])) {
    return (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0));
  }
  return 0;
}

function idDaUrl(url) {
  const host = url.hostname.replace(/^(www|m|music)\./, '');
  const partes = url.pathname.split('/').filter(Boolean);
  let id = null;
  if (host === 'youtu.be') id = partes[0];
  else if (partes[0] === 'watch') id = url.searchParams.get('v');
  else if (['shorts', 'live', 'embed', 'v'].includes(partes[0])) id = partes[1];
  if (id && RE_ID.test(id)) return id;
  return null;
}

/**
 * Procura um link do YouTube dentro de qualquer texto.
 * Devolve { videoId, inicioSeg } ou null.
 */
export function lerLink(texto) {
  if (typeof texto !== 'string') return null;
  const achados = texto.match(RE_URL) || [];
  for (let bruto of achados) {
    bruto = bruto.replace(/[).,;!?\]]+$/, '');
    let url;
    try {
      url = new URL(/^https?:\/\//i.test(bruto) ? bruto : 'https://' + bruto);
    } catch {
      continue;
    }
    const videoId = idDaUrl(url);
    if (!videoId) continue;
    const t = url.searchParams.get('t') ?? url.searchParams.get('start');
    return { videoId, inicioSeg: lerTempoLink(t) };
  }
  const puro = texto.trim();
  if (RE_ID.test(puro)) return { videoId: puro, inicioSeg: 0 };
  return null;
}

// ---------------------------------------------------------------------------
// 5.2 Nome dos arquivos (só sugestão de papel)
// ---------------------------------------------------------------------------

/** Texto dentro dos primeiros colchetes do nome do arquivo, ou ''. */
export function rotuloArquivo(nome) {
  const m = String(nome || '').match(/\[([^\]]*)\]/);
  return m ? m[1].trim() : '';
}

export function pareceTraducao(nome) {
  const r = rotuloArquivo(nome).toLowerCase();
  return r.startsWith('portuguese') || r.startsWith('português') || /pt-br/i.test(String(nome || ''));
}

/** Título do vídeo a partir do nome do arquivo do DownSub: "[English] Título [DownSub.com].srt" → "Título". */
export function tituloDoArquivo(nome) {
  return String(nome || '')
    .replace(/\.(srt|vtt|txt)$/i, '')
    .replace(/^\s*\[[^\]]*\]\s*/, '')
    .replace(/\s*\[DownSub\.com\]\s*$/i, '')
    .trim();
}

/** Chave para comparar títulos: sem acentos, sem maiúsculas e sem pontuação. */
export function chaveTitulo(texto) {
  return normalizar(texto).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/** true se os dois títulos parecem ser do mesmo vídeo (o DownSub tira símbolos como ? e |). */
export function titulosParecidos(a, b) {
  const A = chaveTitulo(a);
  const B = chaveTitulo(b);
  if (!A || !B) return true; // sem dados para comparar: não acusa
  if (A === B || A.includes(B) || B.includes(A)) return true;
  const pa = new Set(A.split(' '));
  const pb = B.split(' ');
  const comuns = pb.filter((w) => pa.has(w)).length;
  return comuns / Math.max(pa.size, pb.length) >= 0.6;
}

/** Recebe dois nomes e devolve { estudo, traducao } com os índices sugeridos. */
export function sugerirPapeis(nomes) {
  if (nomes.length < 2) return { estudo: 0, traducao: -1 };
  const p0 = pareceTraducao(nomes[0]);
  const p1 = pareceTraducao(nomes[1]);
  if (p0 && !p1) return { estudo: 1, traducao: 0 };
  return { estudo: 0, traducao: 1 };
}

// ---------------------------------------------------------------------------
// 5.3 Leitura do texto
// ---------------------------------------------------------------------------

/** Decodifica bytes: UTF-8 estrito; se falhar, Windows-1252. Remove BOM e normaliza quebras. */
export function decodificar(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let texto;
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    texto = new TextDecoder('windows-1252').decode(bytes);
  }
  if (texto.charCodeAt(0) === 0xfeff) texto = texto.slice(1);
  return texto.replace(/\r\n?/g, '\n');
}

const RE_TEMPO = /^\s*((?:\d{1,2}:)?\d{1,2}:\d{2}[,.]\d{1,3})\s*-->\s*((?:\d{1,2}:)?\d{1,2}:\d{2}[,.]\d{1,3})/;

function segundos(txt) {
  const [hms, msBruto] = txt.split(/[,.]/);
  const partes = hms.split(':').map(Number);
  while (partes.length < 3) partes.unshift(0);
  const ms = Number((msBruto + '00').slice(0, 3));
  return partes[0] * 3600 + partes[1] * 60 + partes[2] + ms / 1000;
}

/** Lê as falas brutas (texto ainda com marcas). Serve para SRT e VTT. */
function lerBlocos(texto, ehVtt) {
  const linhas = texto.split('\n');
  const brutas = [];
  let atual = null;
  let pularBloco = false;
  let inicioDeBloco = true;
  const fechar = () => {
    if (atual) brutas.push(atual);
    atual = null;
  };
  for (const linha of linhas) {
    // No VTT do YouTube a fala pode começar com uma linha só com espaço: ela não separa falas.
    const vazia = ehVtt ? linha === '' : linha.trim() === '';
    if (vazia) {
      fechar();
      pularBloco = false;
      inicioDeBloco = true;
      continue;
    }
    if (ehVtt && inicioDeBloco && !atual && /^(WEBVTT|NOTE|STYLE|REGION)\b/.test(linha.trim())) {
      pularBloco = true;
    }
    inicioDeBloco = false;
    if (pularBloco) continue;
    const m = linha.match(RE_TEMPO);
    if (m) {
      if (atual) {
        // Sem linha vazia entre falas: a última linha só com número é o número da próxima fala.
        if (!ehVtt && atual.linhas.length && /^\s*\d+\s*$/.test(atual.linhas[atual.linhas.length - 1])) {
          atual.linhas.pop();
        }
        fechar();
      }
      atual = { s: segundos(m[1]), e: segundos(m[2]), linhas: [] };
      continue;
    }
    if (atual) atual.linhas.push(linha);
  }
  fechar();
  return brutas;
}

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

/** Limpa o texto de uma fala (5.3, itens 1 a 3). */
export function limparTexto(linhas) {
  let t = Array.isArray(linhas) ? linhas.join('\n') : String(linhas);
  t = t.replace(/\{\\[^}]*\}/g, ''); // códigos ASS {\an8}
  t = t.replace(/<\d{1,2}:\d{2}(?::\d{2})?[.,]\d{1,3}>/g, ''); // tempos internos
  t = t.replace(/<\/?[a-zA-Z][^>]*>/g, ''); // tags HTML e VTT (<i>, <c.cor>, <v Nome>)
  t = t.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (todo, nome) => {
    const n = nome.toLowerCase();
    if (n.startsWith('#x')) return String.fromCodePoint(parseInt(n.slice(2), 16));
    if (n.startsWith('#')) return String.fromCodePoint(parseInt(n.slice(1), 10));
    return ENTIDADES[n] ?? todo;
  });
  t = t.replace(/ /g, ' ');
  return t.split('\n').map((l) => l.trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

/** Remove a repetição em "rolagem" das legendas automáticas do YouTube. */
function tirarRolagem(falas) {
  const saida = [];
  let anterior = null; // { original, reduzido }
  for (const f of falas) {
    if (anterior) {
      let resto = null;
      for (const prefixo of [anterior.original, anterior.reduzido]) {
        if (prefixo && f.t.startsWith(prefixo)) {
          const prox = f.t.charAt(prefixo.length);
          if (prox === '' || prox === ' ') {
            resto = f.t.slice(prefixo.length).trim();
            break;
          }
        }
      }
      if (resto !== null) {
        if (resto === '') continue; // descarta B
        const original = f.t;
        f.t = resto;
        saida.push(f);
        anterior = { original, reduzido: resto };
        continue;
      }
    }
    saida.push(f);
    anterior = { original: f.t, reduzido: f.t };
  }
  return saida;
}

/** Correções da sequência (5.3): ordenar, rolagem, sobreposição e fim inválido. */
export function corrigirSequencia(falas) {
  const lista = falas.map((f, i) => ({ ...f, _o: i }));
  lista.sort((a, b) => a.s - b.s || a._o - b._o);
  const semRolagem = tirarRolagem(lista);
  for (let i = 0; i < semRolagem.length; i++) {
    const f = semRolagem[i];
    const prox = semRolagem[i + 1];
    if (prox && f.e > prox.s) f.e = prox.s;
    if (f.e <= f.s) {
      let proxInicio = Infinity;
      for (let j = i + 1; j < semRolagem.length; j++) {
        if (semRolagem[j].s > f.s) { proxInicio = semRolagem[j].s; break; }
      }
      f.e = Math.min(proxInicio, f.s + 2);
    }
  }
  return semRolagem.map(({ s, e, t }) => ({ s: arred(s), e: arred(e), t }));
}

/**
 * Lê o texto de uma legenda. Devolve { falas } ou { erro } — nunca lança exceção.
 */
export function lerLegenda(texto) {
  try {
    if (typeof texto !== 'string') return { erro: MSG_SEM_LEGENDA };
    let t = texto;
    if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
    t = t.replace(/\r\n?/g, '\n');
    const ehVtt = /^\s*WEBVTT/.test(t);
    const brutas = lerBlocos(t, ehVtt);
    const limpas = [];
    for (const b of brutas) {
      const txt = limparTexto(b.linhas);
      if (txt && Number.isFinite(b.s) && Number.isFinite(b.e)) limpas.push({ s: b.s, e: b.e, t: txt });
    }
    const falas = corrigirSequencia(limpas);
    if (!falas.length) return { erro: MSG_SEM_LEGENDA };
    return { falas, formato: ehVtt ? 'vtt' : 'srt' };
  } catch {
    return { erro: MSG_SEM_LEGENDA };
  }
}

/** Lê bytes de um arquivo (ArrayBuffer). Devolve { falas } ou { erro }. */
export function lerArquivoLegenda(buffer) {
  try {
    const tamanho = buffer?.byteLength ?? 0;
    if (tamanho > LIMITE_BYTES) return { erro: 'Arquivo grande demais (limite de 5 MB).' };
    if (!tamanho) return { erro: MSG_SEM_LEGENDA };
    return lerLegenda(decodificar(buffer));
  } catch {
    return { erro: MSG_SEM_LEGENDA };
  }
}

// ---------------------------------------------------------------------------
// 5.3 item 5 — Marcações de som
// ---------------------------------------------------------------------------

const RE_MARCA_INTEIRA = /^(?:\s*(?:\[[^\[\]]*\]|\([^()]*\))\s*)+$/;
const RE_MARCA_MEIO = /\[\p{Ll}+(?:[ '’-]\p{Ll}+){0,2}\]/gu;

export function ehMarcacao(texto) {
  return RE_MARCA_INTEIRA.test(texto);
}

/** Opção "Esconder marcações de som". */
export function esconderMarcacoes(falas) {
  const saida = [];
  for (const f of falas) {
    if (ehMarcacao(f.t)) continue;
    const t = f.t.replace(RE_MARCA_MEIO, ' ').replace(/\s+/g, ' ').trim();
    if (t) saida.push({ ...f, t });
  }
  return saida;
}

// ---------------------------------------------------------------------------
// 6 — Sincronia, modo frases e pareamento
// ---------------------------------------------------------------------------

export function aplicarAjuste(falas, deslocamento) {
  const d = Number(deslocamento) || 0;
  if (!d) return falas;
  return falas.map((f) => ({ ...f, s: arred(f.s + d), e: arred(f.e + d) }));
}

/** 6.2: a legenda é automática? */
export function ehAutomatica(falas, nomeArquivo = '') {
  if (/\(auto-generated\)\s*$/i.test(rotuloArquivo(nomeArquivo))) return true;
  if (!falas || falas.length < 2) return false;
  let contiguas = 0;
  for (let i = 0; i < falas.length - 1; i++) {
    if (Math.abs(falas[i].e - falas[i + 1].s) <= 0.010 + 1e-9) contiguas++;
  }
  return contiguas / (falas.length - 1) >= 0.8;
}

/** Separa as palavras de uma fala com tempo proporcional à posição do caractere. */
export function palavrasComTempo(fala) {
  const { s, e, t } = fala;
  const total = t.length || 1;
  const dur = e - s;
  const lista = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(t))) {
    lista.push({
      w: m[0],
      s: s + (dur * m.index) / total,
      e: s + (dur * (m.index + m[0].length)) / total,
    });
  }
  return lista;
}

const ABREVIACOES = new Set([
  'mr.', 'mrs.', 'ms.', 'dr.', 'st.', 'jr.', 'sr.', 'vs.', 'etc.', 'e.g.', 'i.e.',
  'u.s.', 'a.m.', 'p.m.', 'prof.', 'sra.',
]);

export function fechaFrase(palavra) {
  if (!/(\.\.\.|…|[.?!])["'”’»)\]]*$/.test(palavra)) return false;
  const base = palavra.replace(/^["'“‘«(\[]+/, '').replace(/["'”’»)\]]+$/, '').toLowerCase();
  return !ABREVIACOES.has(base);
}

function unidadeDePalavras(ps) {
  return { s: ps[0].s, e: ps[ps.length - 1].e, texto: ps.map((p) => p.w).join(' ') };
}

const LIMITE_SEG = 15;
const LIMITE_CAR = 220;

function dividirFrase(ps) {
  const texto = ps.map((p) => p.w).join(' ');
  const dur = ps[ps.length - 1].e - ps[0].s;
  if ((dur <= LIMITE_SEG && texto.length <= LIMITE_CAR) || ps.length < 2) return [ps];
  // posição (em caracteres) do fim de cada palavra
  const fins = [];
  let pos = 0;
  for (let i = 0; i < ps.length; i++) {
    pos += ps[i].w.length;
    fins.push(pos);
    pos += 1;
  }
  const total = texto.length;
  const meio = total / 2;
  let corte = -1;
  let melhor = Infinity;
  for (let i = 0; i < ps.length - 1; i++) {
    if (!/[,;:]["'”’»)\]]*$/.test(ps[i].w)) continue;
    const p = fins[i];
    if (p < total / 3 || p > (2 * total) / 3) continue;
    const dist = Math.abs(p - meio);
    if (dist < melhor) { melhor = dist; corte = i; }
  }
  if (corte < 0) corte = Math.floor(ps.length / 2) - 1;
  return [...dividirFrase(ps.slice(0, corte + 1)), ...dividirFrase(ps.slice(corte + 1))];
}

/** 6.2: transforma falas em frases completas. Devolve [{s, e, texto, marca?}]. */
export function montarFrases(falas) {
  const unidades = [];
  let atual = [];
  const fechar = () => {
    if (!atual.length) return;
    for (const parte of dividirFrase(atual)) unidades.push(unidadeDePalavras(parte));
    atual = [];
  };
  for (const f of falas) {
    if (ehMarcacao(f.t)) {
      fechar();
      unidades.push({ s: f.s, e: f.e, texto: f.t, marca: true });
      continue;
    }
    for (const p of palavrasComTempo(f)) {
      let w = p.w;
      if (w.startsWith('>>')) {
        fechar();
        w = w.replace(/^>+/, '');
        if (!w) continue;
        p.w = w;
      }
      atual.push(p);
      if (fechaFrase(w)) fechar();
    }
  }
  fechar();
  return unidades.map((u) => ({ ...u, s: arred(u.s), e: arred(u.e) }));
}

/** Tira o ">>" do texto quando o modo frases está desligado (troca de quem fala). */
function limparSetas(t) {
  return t.replace(/(^|\s)>>+\s*/g, '$1').replace(/\s+/g, ' ').trim();
}

/** Última unidade com s <= t (busca binária). -1 se nenhuma. */
function ultimaComInicioAte(unidades, t) {
  let lo = 0;
  let hi = unidades.length - 1;
  let r = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (unidades[m].s <= t) { r = m; lo = m + 1; } else hi = m - 1;
  }
  return r;
}

/** Unidade com início mais próximo de t, se a distância for de até 1,5 s. */
function maisProxima(unidades, t) {
  const k = ultimaComInicioAte(unidades, t);
  let melhor = -1;
  let dist = Infinity;
  for (const j of [k, k + 1]) {
    if (j < 0 || j >= unidades.length) continue;
    const d = Math.abs(unidades[j].s - t);
    if (d < dist) { dist = d; melhor = j; }
  }
  return dist <= 1.5 + 1e-9 ? melhor : -1;
}

function contendo(unidades, t) {
  const k = ultimaComInicioAte(unidades, t);
  if (k >= 0 && t < unidades[k].e) return k;
  return -1;
}

/** 6.1: pareamento por fala. Altera unidades[].trad. */
export function parearPorFala(unidades, traducao) {
  const partes = unidades.map(() => []);
  for (const T of traducao) {
    // primeira unidade que termina depois do início de T
    let lo = 0;
    let hi = unidades.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (unidades[m].e > T.s) hi = m; else lo = m + 1;
    }
    let melhor = -1;
    let maior = 0;
    for (let j = lo; j < unidades.length && unidades[j].s < T.e; j++) {
      const U = unidades[j];
      const sob = Math.max(0, Math.min(T.e, U.e) - Math.max(T.s, U.s));
      if (sob > maior + 1e-9) { maior = sob; melhor = j; }
    }
    if (melhor < 0) {
      const meio = (T.s + T.e) / 2;
      melhor = contendo(unidades, meio);
      if (melhor < 0) melhor = maisProxima(unidades, meio);
    }
    if (melhor >= 0) partes[melhor].push(T.t);
  }
  unidades.forEach((u, i) => { u.trad = partes[i].join(' '); });
  return unidades;
}

/** 6.1 com modo frases: pareamento por palavra. */
export function parearPorPalavra(unidades, traducao) {
  const partes = unidades.map(() => []);
  for (const T of traducao) {
    if (ehMarcacao(T.t)) {
      // marcações inteiras não são quebradas em palavras
      const meio = (T.s + T.e) / 2;
      let k = contendo(unidades, meio);
      if (k < 0) k = maisProxima(unidades, meio);
      if (k >= 0) partes[k].push(T.t);
      continue;
    }
    for (const p of palavrasComTempo({ ...T, t: limparSetas(T.t) })) {
      const meio = (p.s + p.e) / 2;
      let k = contendo(unidades, meio);
      if (k < 0) k = maisProxima(unidades, meio);
      if (k >= 0) partes[k].push(p.w);
    }
  }
  unidades.forEach((u, i) => { u.trad = partes[i].join(' '); });
  return unidades;
}

/**
 * Pipeline completo (ordem da seção 6).
 * entrada: { estudo: {falas, arquivo}, traducao: {falas, arquivo} | null,
 *            ajusteEstudo, ajusteTraducao }
 * opcoes:  { modoFrases: 'auto'|'ligado'|'desligado', esconderMarcacoes: bool }
 * Devolve { unidades: [{i,s,e,texto,trad,marca?}], frases: bool, automatica: bool }
 */
export function processar(entrada, opcoes = {}) {
  const modo = opcoes.modoFrases || 'auto';
  const brutasEstudo = entrada.estudo?.falas || [];
  const automatica = ehAutomatica(brutasEstudo, entrada.estudo?.arquivo || '');
  const frases = modo === 'ligado' || (modo === 'auto' && automatica);

  let estudo = aplicarAjuste(brutasEstudo, entrada.ajusteEstudo);
  let trad = entrada.traducao?.falas ? aplicarAjuste(entrada.traducao.falas, entrada.ajusteTraducao) : [];
  if (opcoes.esconderMarcacoes) {
    estudo = esconderMarcacoes(estudo);
    trad = esconderMarcacoes(trad);
  }

  let unidades;
  if (frases) {
    unidades = montarFrases(estudo);
  } else {
    unidades = [];
    for (const f of estudo) {
      const texto = limparSetas(f.t);
      if (texto) unidades.push({ s: f.s, e: f.e, texto, ...(ehMarcacao(texto) ? { marca: true } : {}) });
    }
  }
  unidades.forEach((u, i) => { u.i = i; u.trad = ''; });
  if (trad.length) {
    if (frases) parearPorPalavra(unidades, trad);
    else parearPorFala(unidades, trad.map((f) => ({ ...f, t: limparSetas(f.t) })).filter((f) => f.t));
  }
  return { unidades, frases, automatica };
}

// ---------------------------------------------------------------------------
// 6.3 Fala atual e 7.4 Navegação
// ---------------------------------------------------------------------------

/** { indice, dentro }: última unidade com s <= t + 0,05. */
export function falaNoTempo(unidades, t) {
  const indice = ultimaComInicioAte(unidades, t + 0.05);
  if (indice < 0) return { indice: -1, dentro: false };
  return { indice, dentro: t < unidades[indice].e };
}

/** Índice para a lógica de pausa e loop: última unidade com s <= t (sem antecipação). */
export function indiceLogico(unidades, t) {
  return ultimaComInicioAte(unidades, t);
}

export const JANELA_NAVEGACAO_MS = 800;

/**
 * 7.4: calcula o índice de destino.
 * acao: 'voltar' | 'repetir' | 'avancar'
 * memoria: { indice, quando } da última navegação, ou null
 * Devolve { indice } ou { indice: null, aviso }.
 */
export function navegar(unidades, t, acao, memoria = null, agora = 0) {
  const n = unidades.length;
  if (!n) return { indice: null, aviso: '' };
  let c;
  let dentro;
  if (memoria && memoria.indice != null && agora - memoria.quando < JANELA_NAVEGACAO_MS) {
    c = memoria.indice;
    dentro = true;
  } else {
    ({ indice: c, dentro } = falaNoTempo(unidades, t));
  }
  if (c < 0) return { indice: 0 };
  if (acao === 'avancar') {
    if (c >= n - 1) return { indice: null, aviso: 'Última fala' };
    return { indice: c + 1 };
  }
  if (acao === 'repetir') return { indice: c };
  if (acao === 'voltar') return { indice: dentro ? Math.max(0, c - 1) : c };
  return { indice: null, aviso: '' };
}

/** Tempo de destino com pré-rolagem, nunca abaixo de 0. */
export function tempoDestino(unidade, preRolagem) {
  return Math.max(0, unidade.s - (Number(preRolagem) || 0));
}

// ---------------------------------------------------------------------------
// Utilidades de texto e exibição
// ---------------------------------------------------------------------------

/** Para busca: sem acentos e sem diferença de maiúsculas. */
export function normalizar(texto) {
  return String(texto || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/** 9.3: limpa a pontuação das pontas da palavra; apóstrofo e hífen internos ficam. */
export function limparPalavra(w) {
  return String(w || '').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

/** "1:05" ou "1:02:05". */
export function formatarTempo(seg) {
  const s = Math.max(0, Math.floor(Number(seg) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const dd = (x) => String(x).padStart(2, '0');
  return h ? `${h}:${dd(m)}:${dd(r)}` : `${m}:${dd(r)}`;
}

/** Número no padrão brasileiro: 0,15 · 1,25 · 2. */
export function formatarNumero(x, casas = 2) {
  const n = Number(x) || 0;
  return n.toLocaleString('pt-BR', { maximumFractionDigits: casas, minimumFractionDigits: 0 });
}
