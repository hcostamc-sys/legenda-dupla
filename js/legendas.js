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
        if (f.ps) {
          const tirar = f.t.length - resto.length;
          const n = f.t.slice(0, tirar).split(/\s+/).filter(Boolean).length;
          f.ps = f.ps.slice(n);
        }
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
  return semRolagem.map(({ s, e, t, ps }) => {
    const f = { s: arred(s), e: arred(e), t };
    if (ps && ps.length) {
      // Palavras com tempo (legenda automática em json3/srv3): dentro da fala, em ordem.
      f.ps = ps.map((p) => {
        const ps0 = Math.min(Math.max(p.s, s), e);
        return { w: p.w, s: arred(ps0), e: arred(Math.min(Math.max(p.e, ps0), e)) };
      });
    }
    return f;
  });
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
// Legenda dupla: um arquivo só, com os dois idiomas em cada fala (um em cima, outro embaixo)
// ---------------------------------------------------------------------------

export const MSG_NAO_DUPLA = 'Esse arquivo não tem dois idiomas em cada fala. Use o botão “Legenda do idioma que estou estudando”.';

// Palavras muito comuns e típicas de cada idioma (sem acento, como sai de normalizar).
// Ficaram de fora as que existem em mais de um deles com frequência alta (de, que, a, se, para, por, como...).
const PALAVRAS_IDIOMA = {
  pt: 'o os e em uma umas uns com nao voce voces isso isto ele ela eles elas eu muito muita tambem entao mas mais do da dos das na nas ao aos pelo pela seu sua meu minha sao foi tem ja so agora nosso nossa obrigado ola tudo nada ainda gente vou vai fazer coisa aqui sim bem onde quem depois',
  en: 'the and you to of is that it i what this we they was have with for are be not but my your he she just like know there can will would about one all an or going get think really people does did were been his her them our me if',
  es: 'el los las y en un una unos con pero muy eso esto lo le del al yo su sus ella ellos tambien entonces cuando donde hay es fue tiene hacer nosotros usted bueno aqui ahora todo nada gracias hola',
  fr: 'le les des et est je tu il elle nous vous ils elles pas ce cette une du au aux qui dans sur avec tres bien oui c j qu n ai sont fait faire mon ma mes ton ta tout rien merci bonjour',
  it: 'il lo gli che non di della delle sono questo questa anche molto perche ma ho hai ci sei io del nel alla tutto niente grazie ciao',
  de: 'der die das und ist ich nicht du ein eine zu mit sie wir auf den dem auch sich aber nein sehr hier noch wie danke',
};
const CONJ_IDIOMA = Object.fromEntries(Object.entries(PALAVRAS_IDIOMA).map(([k, v]) => [k, new Set(v.split(' '))]));
// Letras que só aparecem (ou quase só) num idioma: valem pontos extras.
const LETRAS_IDIOMA = { pt: /[ãõ]/g, es: /[ñ¿¡]/g, fr: /[èêëœ]|\b[cjldnm]['’]/g, de: /[ßäöü]/g };

export const NOMES_IDIOMAS = { pt: 'português', en: 'inglês', es: 'espanhol', fr: 'francês', it: 'italiano', de: 'alemão' };

/** Pontos de cada idioma para um texto: { pt: 0..1, en: ..., ... } (fração de palavras típicas). */
export function pontosIdioma(texto) {
  const bruto = String(texto || '').toLowerCase();
  const palavras = normalizar(bruto).match(/\p{L}+/gu) || [];
  const r = {};
  for (const k of Object.keys(CONJ_IDIOMA)) r[k] = 0;
  if (!palavras.length) return r;
  for (const w of palavras) for (const k in CONJ_IDIOMA) if (CONJ_IDIOMA[k].has(w)) r[k]++;
  for (const k in LETRAS_IDIOMA) r[k] += 2 * (bruto.match(LETRAS_IDIOMA[k]) || []).length;
  for (const k in r) r[k] /= palavras.length;
  return r;
}

/**
 * Idioma de uma legenda inteira, pelo texto (até ~600 falas espalhadas pelo arquivo).
 * Devolve 'pt', 'en', 'es', 'fr', 'it', 'de' ou '' (não reconhecido ou empate).
 */
export function detectarIdioma(falas) {
  const lista = Array.isArray(falas) ? falas : [];
  if (!lista.length) return '';
  const passo = Math.max(1, Math.floor(lista.length / 600));
  let texto = '';
  for (let i = 0; i < lista.length; i += passo) texto += ' ' + (lista[i].t ?? lista[i].texto ?? '');
  const p = pontosIdioma(texto);
  const ordem = Object.keys(p).sort((a, b) => p[b] - p[a]);
  const [primeiro, segundo] = ordem;
  // Precisa de um mínimo de palavras típicas e de vantagem clara sobre o segundo colocado.
  if (p[primeiro] < 0.08 || p[primeiro] < 1.5 * p[segundo]) return '';
  return primeiro;
}

/**
 * Decide qual legenda é a tradução, pelo conteúdo (o nome do arquivo só desempata).
 * a e b: { falas, arquivo }. alvo: idioma da tradução ('pt' por padrão).
 * estudoPreferido: idioma do vídeo escolhido nos ajustes ('auto' = não sabe).
 * Devolve { trocar, idiomaA, idiomaB, conflito }:
 *   trocar = true quando b deve ser a legenda estudada e a, a tradução;
 *   conflito = true quando as duas estão no mesmo idioma.
 */
export function decidirPapeis(a, b, alvo = 'pt', estudoPreferido = 'auto') {
  const idiomaA = detectarIdioma(a?.falas);
  const idiomaB = detectarIdioma(b?.falas);
  const base = { idiomaA, idiomaB, trocar: false, conflito: false };
  if (idiomaA && idiomaA === idiomaB) return { ...base, conflito: true };
  // 1) Uma delas está no idioma da tradução e a outra não.
  if (idiomaA === alvo && idiomaB !== alvo) return { ...base, trocar: true };
  if (idiomaB === alvo && idiomaA !== alvo) return base;
  // 1b) Tradução automática para outro idioma, mas um dos arquivos está em português.
  if (alvo !== 'pt') {
    if (idiomaA === 'pt' && idiomaB !== 'pt') return { ...base, trocar: true };
    if (idiomaB === 'pt' && idiomaA !== 'pt') return base;
  }
  // 2) O idioma do vídeo foi informado nos ajustes.
  if (estudoPreferido && estudoPreferido !== 'auto') {
    if (idiomaB === estudoPreferido && idiomaA !== estudoPreferido) return { ...base, trocar: true };
    if (idiomaA === estudoPreferido) return base;
  }
  // 3) O nome do arquivo do DownSub diz o idioma.
  if (pareceTraducao(a?.arquivo) && !pareceTraducao(b?.arquivo)) return { ...base, trocar: true };
  if (pareceTraducao(b?.arquivo)) return base;
  // 4) Qual tem mais cara do idioma da tradução.
  const pa = pontosIdioma((a?.falas || []).slice(0, 600).map((f) => f.t).join(' '))[alvo] || 0;
  const pb = pontosIdioma((b?.falas || []).slice(0, 600).map((f) => f.t).join(' '))[alvo] || 0;
  if (pa > 1.5 * pb && pa >= 0.04) return { ...base, trocar: true };
  return base;
}

/** Quanto o texto parece português (0 a ~1). Mantida por compatibilidade. */
export function pontuacaoPortugues(texto) {
  return pontosIdioma(texto).pt;
}

const palavrasDe = (t) => normalizar(t).match(/\p{L}+/gu) || [];

/**
 * Lê um arquivo com os dois idiomas na mesma fala.
 * Devolve { estudo: falas, traducao: falas } ou { erro }. Nunca lança exceção.
 * Quando a fala tem mais de duas linhas, o ponto de corte é escolhido pelas palavras
 * típicas de cada lado (aprendidas nas falas que têm exatamente duas linhas).
 */
export function lerLegendaDupla(texto, alvo = 'pt', estudoPreferido = 'auto') {
  try {
    if (typeof texto !== 'string') return { erro: MSG_SEM_LEGENDA };
    let t = texto;
    if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
    t = t.replace(/\r\n?/g, '\n');
    const ehVtt = /^\s*WEBVTT/.test(t);
    const blocos = [];
    for (const b of lerBlocos(t, ehVtt)) {
      const linhas = b.linhas.map((l) => limparTexto([l])).filter(Boolean);
      if (linhas.length && Number.isFinite(b.s) && Number.isFinite(b.e)) blocos.push({ s: b.s, e: b.e, linhas });
    }
    if (!blocos.length) return { erro: MSG_SEM_LEGENDA };
    const comDuasOuMais = blocos.filter((b) => b.linhas.length >= 2).length;
    if (comDuasOuMais < blocos.length * 0.5) return { erro: MSG_NAO_DUPLA };

    // Perfil de palavras de cada lado, a partir das falas com exatamente duas linhas.
    const perfil = () => ({ mapa: new Map(), total: 0 });
    const cima = perfil();
    const baixo = perfil();
    const somar = (p, linha) => { for (const w of palavrasDe(linha)) { p.mapa.set(w, (p.mapa.get(w) || 0) + 1); p.total++; } };
    const duas = blocos.filter((b) => b.linhas.length === 2);
    for (const b of duas) { somar(cima, b.linhas[0]); somar(baixo, b.linhas[1]); }
    const vocab = new Set([...cima.mapa.keys(), ...baixo.mapa.keys()]).size + 1;
    const lp = (p, w) => Math.log(((p.mapa.get(w) || 0) + 1) / (p.total + vocab));
    // > 0: a linha parece do lado de cima; < 0: do lado de baixo.
    const lado = (linha) => palavrasDe(linha).reduce((soma, w) => soma + lp(cima, w) - lp(baixo, w), 0);
    const temPerfil = duas.length >= 3;

    const falasCima = [];
    const falasBaixo = [];
    for (const b of blocos) {
      const n = b.linhas.length;
      let k;
      if (n === 1) k = !temPerfil || lado(b.linhas[0]) >= 0 ? 1 : 0;
      else if (n === 2 || !temPerfil) k = Math.ceil(n / 2);
      else {
        const notas = b.linhas.map(lado);
        let melhor = -Infinity;
        for (let c = 1; c < n; c++) {
          let soma = 0;
          for (let i = 0; i < n; i++) soma += i < c ? notas[i] : -notas[i];
          if (soma > melhor) { melhor = soma; k = c; }
        }
      }
      const de = b.linhas.slice(0, k).join(' ');
      const ate = b.linhas.slice(k).join(' ');
      if (de) falasCima.push({ s: b.s, e: b.e, t: de });
      if (ate) falasBaixo.push({ s: b.s, e: b.e, t: ate });
    }
    if (!falasCima.length || !falasBaixo.length) return { erro: MSG_NAO_DUPLA };
    const A = corrigirSequencia(falasCima);
    const B = corrigirSequencia(falasBaixo);
    // O lado que está no idioma da tradução (português, em geral) vira a tradução.
    const d = decidirPapeis({ falas: A }, { falas: B }, alvo, estudoPreferido);
    if (d.trocar) return { estudo: B, traducao: A, idiomaEstudo: d.idiomaB, idiomaTraducao: d.idiomaA };
    return { estudo: A, traducao: B, idiomaEstudo: d.idiomaA, idiomaTraducao: d.idiomaB };
  } catch {
    return { erro: MSG_SEM_LEGENDA };
  }
}

/** Mesmo que lerLegendaDupla, a partir dos bytes do arquivo. */
export function lerArquivoLegendaDupla(buffer, alvo = 'pt', estudoPreferido = 'auto') {
  try {
    const tamanho = buffer?.byteLength ?? 0;
    if (tamanho > LIMITE_BYTES) return { erro: 'Arquivo grande demais (limite de 5 MB).' };
    if (!tamanho) return { erro: MSG_SEM_LEGENDA };
    return lerLegendaDupla(decodificar(buffer), alvo, estudoPreferido);
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
    if (!t) continue;
    const g = { ...f, t };
    if (f.ps && t !== f.t) {
      const ps = f.ps.filter((p) => !RE_MARCA_INTEIRA.test(p.w));
      if (ps.map((p) => p.w).join(' ') === t) g.ps = ps; else delete g.ps;
    }
    saida.push(g);
  }
  return saida;
}

// ---------------------------------------------------------------------------
// 6 — Sincronia, modo frases e pareamento
// ---------------------------------------------------------------------------

export function aplicarAjuste(falas, deslocamento) {
  const d = Number(deslocamento) || 0;
  if (!d) return falas;
  return falas.map((f) => {
    const g = { ...f, s: arred(f.s + d), e: arred(f.e + d) };
    if (f.ps) g.ps = f.ps.map((p) => ({ w: p.w, s: arred(p.s + d), e: arred(p.e + d) }));
    return g;
  });
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

/**
 * Separa as palavras de uma fala. Usa o tempo real de cada palavra quando a legenda traz
 * (automática do YouTube); senão, tempo proporcional à posição do caractere.
 */
export function palavrasComTempo(fala) {
  const { s, e, t } = fala;
  if (Array.isArray(fala.ps) && fala.ps.length && fala.ps.map((p) => p.w).join(' ') === t) {
    return fala.ps.map((p) => ({ w: p.w, s: p.s, e: p.e }));
  }
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

// ---------------------------------------------------------------------------
// Quebra no padrão de legenda de filme (Netflix Timed Text Style Guide):
// até 42 caracteres por linha, no máximo 2 linhas (84) e no máximo 7 s na tela.
// ---------------------------------------------------------------------------

export const CAR_POR_LINHA = 42;
export const MAX_CAR_LEGENDA = 2 * CAR_POR_LINHA;
export const MAX_SEG_LEGENDA = 7;
const MIN_CAR_POR_TEMPO = 20; // dividir só pelo tempo não pode gerar pedaços menores que isto

// Antes de quebrar no padrão de filme, uma frase sem pontuação (comum na legenda automática)
// é cortada em blocos de até 20 s / 300 caracteres, para o pareamento e a conta não ficarem enormes.
const LIMITE_SEG = 20;
const LIMITE_CAR = 300;

const lista = (t) => new Set(t.split(' '));
// Palavras que começam um trecho novo: bom lugar para quebrar ANTES delas.
const CONJUNCOES = lista('and but or so because that which who whom whose when where while if although though unless until since after before then as than ' +
  'e mas ou porque que quando onde enquanto embora se entao depois antes ate como pois porem ' +
  'y pero o porque cuando donde mientras aunque si entonces despues antes hasta como ' +
  'et mais ou parce quand ou si alors pendant apres avant comme donc car ' +
  'und aber oder weil dass wenn als ma perche quando mentre se allora dopo prima come');
const PREPOSICOES = lista('to of in on at for with from by about into over under without through between during ' +
  'de do da dos das em no na nos nas para pra com por sem sobre entre ' +
  'en con sin para por sobre entre del al ' +
  'a au aux dans sur avec sans pour par chez ' +
  'zu mit von auf fur bei nach aus di in con su per tra fra');
// Palavras que não podem ficar no fim de uma legenda (artigos, preposições, possessivos...).
const FRACAS = lista('the a an to of in on at for with from by and or but my your his her its our their this these those some any no ' +
  'is are was were be been am will would can could should do does did have has had i you he she we they it ' +
  'o a os as um uma uns umas de do da dos das em no na nos nas e ou mas que para pra com por meu minha seu sua nosso nossa ' +
  'el la los las un una unos unas y del al en con mi tu su ' +
  'le la les un une des du au et de mon ma mes ton ta ses ce cette ' +
  'der die das ein eine und il lo gli i le un una di e');

const CACHE_LIMPA = new Map();
const limpa = (w) => {
  let r = CACHE_LIMPA.get(w);
  if (r === undefined) {
    r = normalizar(w).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    if (CACHE_LIMPA.size > 20000) CACHE_LIMPA.clear();
    CACHE_LIMPA.set(w, r);
  }
  return r;
};

const FECHA = new Set(['"', "'", '”', '’', '»', ')', ']']);

/** Custo de quebrar a legenda entre as palavras w e prox (menor = melhor lugar). */
export function custoQuebra(w, prox) {
  let k = w.length - 1;
  while (k > 0 && FECHA.has(w[k])) k--;
  const ult = w[k];
  let c;
  if (ult === '.' || ult === '?' || ult === '!' || ult === '…') c = 0;
  else if (ult === ';' || ult === ':') c = 30;
  else if (ult === ',' || ult === '—' || ult === '–') c = 60;
  else {
    const p = limpa(prox);
    if (CONJUNCOES.has(p)) c = 120;
    else if (PREPOSICOES.has(p)) c = 200;
    else c = 400;
  }
  if (c >= 120 && FRACAS.has(limpa(w))) c += 300;
  return c;
}

/**
 * Divide uma sequência de palavras em exatamente m pedaços, com o menor custo:
 * custo das quebras + desequilíbrio de tamanho + tempo acima do limite.
 * itens: [{ w, s?, e? }]. limite: caracteres por pedaço (Infinity = sem limite).
 * alvos (opcional): posição desejada (em caracteres) de cada quebra; com eles, a distância conta mais.
 * Devolve os índices finais de cada pedaço (o último é itens.length - 1) ou null se não couber.
 */
function particionar(itens, m, { limite = Infinity, alvos = null, comTempo = false } = {}) {
  const n = itens.length;
  if (m < 1 || m > n) return null;
  const fim = new Float64Array(n); // posição (caracteres) do fim de cada palavra
  let pos = 0;
  for (let i = 0; i < n; i++) { pos += itens[i].w.length; fim[i] = pos; pos += 1; }
  const total = fim[n - 1];
  const meta = total / m;
  const quebra = new Float64Array(n);
  for (let j = 0; j < n - 1; j++) quebra[j] = custoQuebra(itens[j].w, itens[j + 1].w);
  // melhor[k*n + j]: menor custo para pôr as palavras 0..j em k+1 pedaços
  const melhor = new Float64Array(m * n).fill(Infinity);
  const volta = new Int32Array(m * n).fill(-1);
  for (let k = 0; k < m; k++) {
    // o pedaço k termina em j; ainda precisam caber m-1-k pedaços depois dele
    for (let j = k; j <= n - m + k; j++) {
      let melhorC = Infinity;
      let melhorI = -1;
      // o primeiro pedaço sempre começa na palavra 0
      for (let i = k ? j : 0; i >= k; i--) {
        const t = fim[j] - (i ? fim[i - 1] + 1 : 0);
        if (t > limite && i < j) break;
        const antes = k ? melhor[(k - 1) * n + i - 1] : 0;
        if (antes === Infinity) continue;
        let c = antes;
        if (!alvos) c += 0.03 * (t - meta) * (t - meta);
        if (comTempo) {
          const excesso = itens[j].e - itens[i].s - MAX_SEG_LEGENDA;
          if (excesso > 0) c += 50 * excesso;
        }
        if (j < n - 1) {
          c += quebra[j];
          if (alvos) c += 4 * Math.abs(fim[j] - alvos[k]);
        }
        if (c < melhorC) { melhorC = c; melhorI = i - 1; }
      }
      melhor[k * n + j] = melhorC;
      volta[k * n + j] = melhorI;
    }
  }
  const custo = melhor[(m - 1) * n + n - 1];
  if (custo === Infinity) return null;
  const fins = [];
  let j = n - 1;
  for (let k = m - 1; k >= 0; k--) { fins.unshift(j); j = volta[k * n + j]; }
  fins.custo = custo;
  return fins;
}

/**
 * Quebra as palavras de uma frase em legendas no padrão de filme.
 * ps: [{ w, s, e }]. Devolve uma lista de pedaços (cada um, uma lista de palavras).
 */
export function quebrarEmLegendas(ps) {
  const n = ps.length;
  if (n < 2) return [ps];
  const total = ps.reduce((soma, p) => soma + p.w.length, 0) + n - 1;
  const dur = ps[n - 1].e - ps[0].s;
  const porTexto = Math.ceil(total / MAX_CAR_LEGENDA);
  const porTempo = dur > MAX_SEG_LEGENDA ? Math.min(Math.ceil(dur / MAX_SEG_LEGENDA), Math.max(1, Math.floor(total / MIN_CAR_POR_TEMPO))) : 1;
  const m0 = Math.min(n, Math.max(porTexto, porTempo));
  if (m0 <= 1) return [ps];
  // O menor número de legendas costuma ser o melhor, mas uma legenda a mais vale a pena
  // quando deixa todos os cortes em lugares naturais (cada legenda extra custa 150).
  let fins = null;
  let melhorCusto = Infinity;
  for (let m = m0, achou = 0; m <= n && achou < 3; m++) {
    if (melhorCusto <= 150 * (m - m0)) break; // mais legendas já não teriam como sair mais baratas
    const f = particionar(ps, m, { limite: MAX_CAR_LEGENDA, comTempo: true });
    if (!f) continue;
    achou++;
    const c = f.custo + 150 * (m - m0);
    if (c < melhorCusto) { melhorCusto = c; fins = f; }
  }
  if (!fins) return [ps];
  const pedacos = [];
  let ini = 0;
  for (const f of fins) { pedacos.push(ps.slice(ini, f + 1)); ini = f + 1; }
  return pedacos;
}

/**
 * Divide a tradução de uma frase em tantos pedaços quanto a frase original foi dividida,
 * nos pontos proporcionais (pelo número de caracteres), ajustados para a quebra mais natural por perto.
 * fracoes: fim de cada pedaço original como fração do texto (0..1), sem o último.
 */
export function dividirTraducao(texto, fracoes) {
  const m = fracoes.length + 1;
  const palavras = String(texto || '').split(/\s+/).filter(Boolean);
  if (m === 1) return [palavras.join(' ')];
  if (!palavras.length) return new Array(m).fill('');
  const itens = palavras.map((w) => ({ w }));
  const total = palavras.join(' ').length;
  const alvos = fracoes.map((f) => f * total);
  let fins = null;
  if (palavras.length >= m) {
    // Um pedaço da tradução raramente passa do dobro do tamanho médio: limita a busca (mais rápido).
    fins = particionar(itens, m, { alvos, limite: Math.max(2 * (total / m), total / m + 40) })
      || particionar(itens, m, { alvos });
  }
  if (!fins) {
    // Menos palavras que pedaços: cada palavra vai para o pedaço do seu ponto proporcional.
    const saida = new Array(m).fill(null).map(() => []);
    let pos = 0;
    for (const w of palavras) {
      const meio = (pos + w.length / 2) / total;
      let k = 0;
      while (k < fracoes.length && meio > fracoes[k]) k++;
      saida[k].push(w);
      pos += w.length + 1;
    }
    return saida.map((x) => x.join(' '));
  }
  const saida = [];
  let ini = 0;
  for (const f of fins) { saida.push(palavras.slice(ini, f + 1).join(' ')); ini = f + 1; }
  return saida;
}

/**
 * Corta blocos grandes demais (frases sem pontuação) no melhor ponto do terço central.
 * Conta linear por nível (uma legenda automática inteira sem pontuação pode ter 20 mil palavras).
 */
function dividirFrase(ps) {
  const n = ps.length;
  if (n < 2) return [ps];
  let total = n - 1;
  for (const p of ps) total += p.w.length;
  const dur = ps[n - 1].e - ps[0].s;
  if (dur <= LIMITE_SEG && total <= LIMITE_CAR) return [ps];
  let corte = -1;
  let melhor = Infinity;
  let pos = 0;
  for (let j = 0; j < n - 1; j++) {
    pos += ps[j].w.length;
    const f = pos / total;
    if (f >= 1 / 3 && f <= 2 / 3) {
      const c = custoQuebra(ps[j].w, ps[j + 1].w) + 800 * Math.abs(f - 0.5);
      if (c < melhor) { melhor = c; corte = j; }
    }
    pos += 1;
  }
  if (corte < 0) corte = Math.floor(n / 2) - 1;
  return [...dividirFrase(ps.slice(0, corte + 1)), ...dividirFrase(ps.slice(corte + 1))];
}

// ---------------------------------------------------------------------------
// Pontuação aproximada da legenda automática do YouTube (vem sem pontos, vírgulas e maiúsculas).
// Usa as pausas da fala (tempo real de cada palavra): pausa longa = ponto; pausa média = vírgula.
// É uma aproximação: não entende o sentido das frases.
// ---------------------------------------------------------------------------

const PAUSA_PONTO = 0.6; // segundos de silêncio além do tempo normal da palavra
const PAUSA_PONTO_CERTO = 1.2;
const PAUSA_VIRGULA = 0.35;
// Depois destas palavras a frase não termina nem leva vírgula (artigos, preposições, conjunções...).
const NAO_TERMINA = lista('the a an of to with from by and or but my your his her our their its ' +
  'o a os as um uma de do da dos das e ou mas com meu minha seu sua ' +
  'el la los las un una y del al mi tu su le les une des du et mon ma ses ' +
  'der die das ein eine und il lo gli i');
// Antes destas a fala continua: sem vírgula (pausa de hesitação, como em "eu vi... o carro").
const CONTINUA = new Set([...PREPOSICOES, ...lista('the a an my your his her our their o os as um uma umas uns el la los las un une les der die das ein eine')]);
const APOIO_EN = lista('so and but okay ok well now oh yeah alright right');
const AUX_EN = lista('do does did is are was were can could would will should shall have has had am may might');
const PRONOMES_EN = lista('you i we they he she it there that this');
const QU_EN = lista('what why how where when who which');

const temPontuacao = (w) => /[.,!?;:…]["'”’»)\]]*$/.test(w);

/** A legenda já tem pontuação (ponto, interrogação ou exclamação em pelo menos 1 de cada 40 palavras)? */
export function legendaPontuada(falas) {
  let palavras = 0;
  let fins = 0;
  for (const f of falas || []) {
    for (const w of String(f.t || '').split(/\s+/)) {
      if (!w) continue;
      palavras++;
      if (/[.?!…]["'”’»)\]]*$/.test(w)) fins++;
    }
  }
  return palavras > 0 && fins * 40 >= palavras;
}

/** A legenda tem o tempo real de cada palavra (automática do YouTube em json3/srv3)? */
export function temTempoDePalavra(falas) {
  let com = 0;
  for (const f of falas || []) if (f.ps?.length) com++;
  return com > 0 && com * 2 >= (falas || []).length;
}

/** Pergunta em inglês: "do you…", "is it…", "what is…", "how did…" (depois de "so", "and", "okay"…). */
function perguntaIngles(palavras) {
  let k = 0;
  while (k < palavras.length - 1 && APOIO_EN.has(limpa(palavras[k]))) k++;
  const a = limpa(palavras[k] || '');
  const b = limpa(palavras[k + 1] || '');
  if (AUX_EN.has(a) && PRONOMES_EN.has(b)) return true;
  if (QU_EN.has(a) && AUX_EN.has(b)) return true;
  // "what's", "where're", "how'd" (com ou sem o ponto que o app acabou de pôr)
  return /^(what|why|how|where|when|who)['’](s|re|d)[.,]?$/.test(String(palavras[k] || '').toLowerCase());
}

function maiuscula(w, idioma) {
  const m = /\p{L}/u.exec(w);
  if (!m) return w;
  const i = m.index;
  return w.slice(0, i) + w[i].toLocaleUpperCase(idioma || undefined) + w.slice(i + 1);
}

/**
 * Pontua palavras com tempo real. itens: sequência de { p: {w,s,e} } e de limites ({ marca } ou
 * { troca }: marcação de som ou troca de quem fala). Altera p.w.
 */
export function pontuarItens(itens, idioma = '') {
  const ingles = String(idioma || '').toLowerCase().split('-')[0] === 'en';
  // Ritmo da pessoa: tempo de uma palavra ≈ BASE + ritmo × letras. O ritmo é a mediana, então as
  // poucas pausas não pesam. A pausa é o que sobra entre o começo de uma palavra e o da seguinte.
  const BASE = 0.1;
  const ritmos = [];
  for (let k = 0; k + 1 < itens.length; k++) {
    const a = itens[k].p;
    const b = itens[k + 1].p;
    if (!a || !b) continue;
    const d = b.s - a.s;
    if (d > 0 && d < 2) ritmos.push(Math.max(0, d - BASE) / Math.max(1, a.w.length));
  }
  ritmos.sort((x, y) => x - y);
  const ritmo = ritmos.length ? ritmos[ritmos.length >> 1] : 0.06;
  const tempoNormal = (w) => BASE + ritmo * Math.max(1, w.length);

  // 1) pontos e vírgulas pelas pausas
  let desdePonto = 0; // palavras desde o último ponto
  for (let k = 0; k < itens.length; k++) {
    const p = itens[k].p;
    if (!p) { desdePonto = 0; continue; }
    desdePonto++;
    if (temPontuacao(p.w)) { if (/[.?!…]["'”’»)\]]*$/.test(p.w)) desdePonto = 0; continue; }
    const prox = itens[k + 1];
    const w = limpa(p.w);
    if (!prox || !prox.p) {
      // fim da legenda, troca de quem fala ou marcação de som: termina a frase
      if (!NAO_TERMINA.has(w)) { p.w += '.'; desdePonto = 0; }
      continue;
    }
    if (NAO_TERMINA.has(w)) continue;
    const pausa = prox.p.s - p.s - tempoNormal(p.w);
    if (pausa >= PAUSA_PONTO_CERTO || (pausa >= PAUSA_PONTO && desdePonto >= 3)) {
      p.w += '.';
      desdePonto = 0;
    } else if (pausa >= PAUSA_VIRGULA && !CONTINUA.has(limpa(prox.p.w))) {
      p.w += ',';
    }
  }

  // 2) maiúscula no começo das frases, "I" em inglês e interrogação nas perguntas em inglês
  let frase = [];
  let comeco = true;
  const fecharFrase = () => {
    if (ingles && frase.length >= 2) {
      const ult = frase[frase.length - 1];
      if (/\.$/.test(ult.w) && !/\.\.$/.test(ult.w) && perguntaIngles(frase.map((p) => p.w))) ult.w = ult.w.slice(0, -1) + '?';
    }
    frase = [];
  };
  for (const it of itens) {
    const p = it.p;
    if (!p) { fecharFrase(); comeco = true; continue; }
    if (ingles && /^i(['’](m|ll|ve|d))?[.,?!]?$/i.test(p.w)) p.w = 'I' + p.w.slice(1);
    if (comeco) { p.w = maiuscula(p.w, idioma); comeco = false; }
    frase.push(p);
    if (/[.?!…]["'”’»)\]]*$/.test(p.w)) { fecharFrase(); comeco = true; }
  }
  fecharFrase();
  return itens;
}

/**
 * 6.2: junta as falas em frases completas (sem a quebra de filme). Devolve [{s, e, texto, ps, marca?}].
 * opcoes.pontuar: pontua pelas pausas (legenda automática com tempo de cada palavra); opcoes.idioma.
 */
export function montarFrasesInteiras(falas, opcoes = {}) {
  // 1) sequência de palavras e de limites (marcação de som, troca de quem fala: ">>")
  const itens = [];
  for (const f of falas) {
    if (ehMarcacao(f.t)) {
      itens.push({ marca: f });
      continue;
    }
    for (const p of palavrasComTempo(f)) {
      if (p.w.startsWith('>>')) {
        itens.push({ troca: true });
        p.w = p.w.replace(/^>+/, '');
        if (!p.w) continue;
      }
      itens.push({ p });
    }
  }
  if (opcoes.pontuar) pontuarItens(itens, opcoes.idioma);

  // 2) frases
  const unidades = [];
  let atual = [];
  const fechar = () => {
    if (!atual.length) return;
    for (const parte of dividirFrase(atual)) unidades.push({ ...unidadeDePalavras(parte), ps: parte });
    atual = [];
  };
  for (const it of itens) {
    if (it.marca) {
      fechar();
      unidades.push({ s: it.marca.s, e: it.marca.e, texto: it.marca.t, marca: true });
      continue;
    }
    if (it.troca) { fechar(); continue; }
    atual.push(it.p);
    if (fechaFrase(it.p.w)) fechar();
  }
  fechar();
  return unidades;
}

/**
 * Quebra frases inteiras em legendas no padrão de filme. Se a frase já tem tradução (trad),
 * ela é dividida nos pontos equivalentes. Devolve [{s, e, texto, trad?, marca?}].
 */
export function quebrarFrases(frases) {
  const saida = [];
  for (const f of frases) {
    if (f.marca || !f.ps) {
      const { ps, ...resto } = f;
      saida.push(resto);
      continue;
    }
    const pedacos = quebrarEmLegendas(f.ps);
    let trads = null;
    if (typeof f.trad === 'string') {
      if (pedacos.length === 1) trads = [f.trad];
      else {
        const total = f.texto.length;
        const fracoes = [];
        let pos = 0;
        for (let k = 0; k < pedacos.length - 1; k++) {
          pos += pedacos[k].map((p) => p.w).join(' ').length + 1;
          fracoes.push(pos / total);
        }
        trads = dividirTraducao(f.trad, fracoes);
      }
    }
    pedacos.forEach((parte, k) => {
      const u = unidadeDePalavras(parte);
      if (trads) u.trad = trads[k];
      saida.push(u);
    });
  }
  for (const u of saida) { u.s = arred(u.s); u.e = arred(u.e); }
  return saida;
}

/** 6.2: transforma falas em frases completas, já quebradas no padrão de filme. Devolve [{s, e, texto, marca?}]. */
export function montarFrases(falas) {
  return quebrarFrases(montarFrasesInteiras(falas));
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
 * Devolve { unidades: [{i,s,e,texto,trad,marca?}], frases: bool, automatica: bool, pontuada: bool }
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
  let pontuada = false;
  if (frases) {
    // Pareia a tradução com a frase inteira e só depois quebra as duas no padrão de filme:
    // assim cada pedaço da tradução corresponde ao pedaço da frase original.
    // Legenda automática com o tempo de cada palavra e sem pontuação: o app pontua pelas pausas.
    const pontuar = automatica && opcoes.pontuarAuto !== false && temTempoDePalavra(estudo) && !legendaPontuada(estudo);
    const inteiras = montarFrasesInteiras(estudo, { pontuar, idioma: entrada.estudo?.idioma || '' });
    pontuada = pontuar;
    if (trad.length) parearPorPalavra(inteiras, trad);
    unidades = quebrarFrases(inteiras);
  } else {
    unidades = [];
    for (const f of estudo) {
      const texto = limparSetas(f.t);
      if (texto) unidades.push({ s: f.s, e: f.e, texto, ...(ehMarcacao(texto) ? { marca: true } : {}) });
    }
    unidades.forEach((u) => { u.trad = ''; });
    if (trad.length) parearPorFala(unidades, trad.map((f) => ({ ...f, t: limparSetas(f.t) })).filter((f) => f.t));
  }
  unidades.forEach((u, i) => { u.i = i; if (typeof u.trad !== 'string') u.trad = ''; });
  return { unidades, frases, automatica, pontuada };
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
