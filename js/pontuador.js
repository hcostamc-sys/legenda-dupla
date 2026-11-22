// pontuador.js — pontuação por modelo (recurso extra que a pessoa baixa nos Ajustes ou na escolha do idioma).
// Parte pura, sem DOM e sem o motor do modelo: funciona no Node (testes) e no Web Worker do app.
//
// Modelos: "punctuation_fullstop_truecase" do autor 1-800-BAD-CODE no Hugging Face (licença Apache 2.0).
// Cada modelo recebe o texto em minúsculas e sem pontuação e devolve, para cada pedaço de palavra:
// pontuação antes (só "¿"), pontuação depois (. , ? ou sigla), maiúscula letra por letra e fim de frase.
// O formato foi conferido no GitHub Actions com a biblioteca oficial (tests/pontuacao_ci/).

const HF = 'https://huggingface.co';

/** Pacotes que a pessoa pode baixar. revisao: versão fixa no Hugging Face (o arquivo nunca muda). */
export const PACOTES = {
  en: {
    id: 'en',
    nome: 'Inglês',
    descricao: 'Inglês',
    idiomas: ['en'],
    modelo: `${HF}/1-800-BAD-CODE/punctuation_fullstop_truecase_english/resolve/b26fd1c40e88678859048898218ea4edcc24c84a/punct_cap_seg_en.onnx`,
    sp: `${HF}/1-800-BAD-CODE/punctuation_fullstop_truecase_english/resolve/b26fd1c40e88678859048898218ea4edcc24c84a/spe_32k_lc_en.model`,
    bytesModelo: 209532928,
    bytesSp: 587902,
  },
  latinas: {
    id: 'latinas',
    nome: 'Línguas latinas',
    descricao: 'Francês, espanhol, português, italiano, catalão e romeno',
    idiomas: ['es', 'fr', 'pt', 'it', 'ca', 'ro'],
    modelo: `${HF}/1-800-BAD-CODE/punctuation_fullstop_truecase_romance/resolve/1e8d395731a9e19471cee4b636f034e0cff7b405/model.onnx`,
    sp: `${HF}/1-800-BAD-CODE/punctuation_fullstop_truecase_romance/resolve/1e8d395731a9e19471cee4b636f034e0cff7b405/sp.model`,
    bytesModelo: 143996928,
    bytesSp: 593127,
  },
};

// Igual nos dois modelos (config.yaml de cada um).
export const MAX_PECAS = 256; // o modelo foi treinado com até 256 peças por vez (com o início e o fim)
export const SOBREPOSICAO = 16; // janelas seguidas repetem 16 peças, para não cortar o contexto
const ROTULOS_ANTES = [null, '¿'];
const ROTULOS_DEPOIS = [null, '<ACRONYM>', '.', ',', '?'];
export const LETRAS_POR_PECA = 16; // a saída de maiúsculas tem 16 posições por peça

/** Pacote que serve para um idioma ('en', 'fr-FR'...) ou null. */
export function pacoteDoIdioma(idioma) {
  const b = String(idioma || '').toLowerCase().split(/[-_]/)[0];
  return Object.values(PACOTES).find((p) => p.idiomas.includes(b)) || null;
}

// ---------------------------------------------------------------- leitura do sp.model (protobuf)

function lerVarint(buf, pos) {
  let v = 0;
  let mult = 1;
  for (;;) {
    const b = buf[pos++];
    v += (b & 0x7f) * mult;
    if (b < 0x80) return [v, pos];
    mult *= 128;
  }
}

/** Percorre os campos de uma mensagem protobuf: fn(numero, tipo, valor, inicio, fim). */
function campos(buf, ini, fim, fn) {
  let pos = ini;
  while (pos < fim) {
    let chave;
    [chave, pos] = lerVarint(buf, pos);
    const num = Math.floor(chave / 8);
    const tipo = chave & 7;
    if (tipo === 0) { let v; [v, pos] = lerVarint(buf, pos); fn(num, tipo, v); }
    else if (tipo === 1) { fn(num, tipo, null, pos, pos + 8); pos += 8; }
    else if (tipo === 5) { fn(num, tipo, new DataView(buf.buffer, buf.byteOffset + pos, 4).getFloat32(0, true), pos, pos + 4); pos += 4; }
    else if (tipo === 2) { let n; [n, pos] = lerVarint(buf, pos); fn(num, tipo, null, pos, pos + n); pos += n; }
    else throw new Error(`protobuf: tipo ${tipo} desconhecido`);
  }
}

const TIPO_NORMAL = 1;
const TIPO_DESCONHECIDA = 2;
const TIPO_DEFINIDA = 4;

/**
 * Lê o modelo SentencePiece (unigram, normalizador "identity", como os dois pacotes).
 * Devolve o tokenizador: { codificar(texto) -> ids, peca(id) -> texto, bos, eos, pad, unk }.
 */
export function lerTokenizador(bytes) {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dec = new TextDecoder();
  const pecas = [];
  const spec = { unk: 0, bos: 1, eos: 2, pad: -1, tipoModelo: 1, byteFallback: false };
  const norm = { nome: '', prefixo: true, espacos: true };
  campos(buf, 0, buf.length, (num, tipo, v, a, b) => {
    if (num === 1 && tipo === 2) {
      const p = { texto: '', pontos: 0, tipo: TIPO_NORMAL };
      campos(buf, a, b, (n2, t2, v2, a2, b2) => {
        if (n2 === 1) p.texto = dec.decode(buf.subarray(a2, b2));
        else if (n2 === 2) p.pontos = v2;
        else if (n2 === 3) p.tipo = v2;
      });
      pecas.push(p);
    } else if (num === 2 && tipo === 2) {
      campos(buf, a, b, (n2, t2, v2) => {
        if (n2 === 3) spec.tipoModelo = v2;
        else if (n2 === 35) spec.byteFallback = !!v2;
        else if (n2 === 40) spec.unk = v2;
        else if (n2 === 41) spec.bos = v2;
        else if (n2 === 42) spec.eos = v2;
        else if (n2 === 43) spec.pad = v2;
      });
    } else if (num === 3 && tipo === 2) {
      campos(buf, a, b, (n2, t2, v2, a2, b2) => {
        if (n2 === 1) norm.nome = dec.decode(buf.subarray(a2, b2));
        else if (n2 === 3) norm.prefixo = !!v2;
        else if (n2 === 4) norm.espacos = !!v2;
      });
    }
  });
  // O protobuf grava o pad_id como varint de 64 bits; -1 vira um número enorme.
  if (spec.pad > 2 ** 31) spec.pad = -1;
  if (spec.tipoModelo !== 1) throw new Error('Só o modelo unigram é suportado.');
  if (norm.nome && norm.nome !== 'identity') throw new Error(`Normalizador ${norm.nome} não suportado.`);

  const mapa = new Map();
  let menor = Infinity;
  let maxLetras = 1;
  pecas.forEach((p, id) => {
    if (p.tipo !== TIPO_NORMAL && p.tipo !== TIPO_DEFINIDA) return;
    const letras = Array.from(p.texto);
    mapa.set(p.texto, id);
    if (p.pontos < menor) menor = p.pontos;
    if (letras.length > maxLetras) maxLetras = letras.length;
  });
  const pontosDesconhecida = menor - 10; // a mesma penalidade do SentencePiece (kUnkPenalty)

  /** Viterbi do unigram: a divisão em peças com a maior soma de pontos. */
  function codificarTrecho(letras) {
    const n = letras.length;
    const melhor = new Float64Array(n + 1).fill(-Infinity);
    const de = new Int32Array(n + 1).fill(-1);
    const idPor = new Int32Array(n + 1).fill(-1);
    melhor[0] = 0;
    for (let i = 0; i < n; i++) {
      if (melhor[i] === -Infinity) continue;
      let umaLetra = false;
      let s = '';
      for (let k = i; k < Math.min(n, i + maxLetras); k++) {
        s += letras[k];
        const id = mapa.get(s);
        if (id === undefined) continue;
        if (k === i) umaLetra = true;
        const v = melhor[i] + pecas[id].pontos;
        if (v > melhor[k + 1]) { melhor[k + 1] = v; de[k + 1] = i; idPor[k + 1] = id; }
      }
      if (!umaLetra) {
        const v = melhor[i] + pontosDesconhecida;
        if (v > melhor[i + 1]) { melhor[i + 1] = v; de[i + 1] = i; idPor[i + 1] = spec.unk; }
      }
    }
    const ids = [];
    for (let j = n; j > 0; j = de[j]) ids.push(idPor[j]);
    ids.reverse();
    // Desconhecidas seguidas viram uma só (como o SentencePiece faz).
    return ids.filter((id, k) => !(id === spec.unk && k > 0 && ids[k - 1] === spec.unk));
  }

  function codificar(texto) {
    let t = String(texto);
    if (norm.espacos) t = t.replace(/ +/g, ' ').trim();
    if (!t) return [];
    t = (norm.prefixo ? ' ' : '') + t;
    return codificarTrecho(Array.from(t.replace(/ /g, '▁')));
  }

  return {
    codificar,
    peca: (id) => pecas[id]?.texto ?? '',
    bos: spec.bos,
    eos: spec.eos,
    pad: spec.pad,
    unk: spec.unk,
    tamanho: pecas.length,
  };
}

// ---------------------------------------------------------------- janelas (igual à biblioteca oficial)

/**
 * Divide os ids em janelas de até MAX_PECAS (com início e fim). Cada janela depois da primeira
 * recomeça SOBREPOSICAO peças antes, para o modelo ver o contexto. Devolve [{ ids, inicio }].
 */
export function janelas(ids, maxPecas = MAX_PECAS, sobreposicao = SOBREPOSICAO) {
  const max = maxPecas - 2;
  const lista = [];
  let inicio = 0;
  let k = 0;
  while (inicio < ids.length) {
    const ajustado = inicio - (k === 0 ? 0 : sobreposicao);
    const fim = ajustado + max;
    lista.push({ ids: ids.slice(ajustado, fim), inicio: ajustado });
    inicio = fim;
    k++;
  }
  return lista;
}

/**
 * Junta as previsões das janelas, descartando metade da sobreposição de cada lado.
 * resultados: [{ antes: [], depois: [], maiusc: [[bool x16]], fim: [] }] na ordem das janelas
 * (sem o início e o fim). Devolve um só objeto, do tamanho de ids.
 */
export function juntarJanelas(resultados, sobreposicao = SOBREPOSICAO) {
  const saida = { antes: [], depois: [], maiusc: [], fim: [] };
  const meio = Math.floor(sobreposicao / 2);
  resultados.forEach((r, i) => {
    const a = i > 0 ? meio : 0;
    const b = r.antes.length - (i < resultados.length - 1 ? meio : 0);
    for (const k of ['antes', 'depois', 'maiusc', 'fim']) saida[k].push(...r[k].slice(a, b));
  });
  return saida;
}

/**
 * Lê as saídas do modelo para uma janela (tensores do onnxruntime: pre_preds, post_preds, cap_preds,
 * seg_preds com o lote 1) e tira o início e o fim. n = número de ids da janela, sem início e fim.
 */
export function lerSaidas(saidas, n) {
  const pre = saidas.pre_preds.data;
  const post = saidas.post_preds.data;
  const cap = saidas.cap_preds.data;
  const seg = saidas.seg_preds.data;
  const r = { antes: [], depois: [], maiusc: [], fim: [] };
  for (let k = 1; k <= n; k++) {
    r.antes.push(ROTULOS_ANTES[Number(pre[k])] ?? null);
    r.depois.push(ROTULOS_DEPOIS[Number(post[k])] ?? null);
    const m = [];
    for (let c = 0; c < LETRAS_POR_PECA; c++) m.push(!!cap[k * LETRAS_POR_PECA + c]);
    r.maiusc.push(m);
    r.fim.push(!!seg[k]);
  }
  return r;
}

// ---------------------------------------------------------------- palavras de entrada e de saída

/** Palavra como o modelo espera: minúsculas, sem pontuação nas pontas e sem espaços. */
export function palavraParaModelo(w, idioma = '') {
  return String(w || '')
    .toLocaleLowerCase(idioma || undefined)
    .replace(/\s+/gu, '')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

/**
 * Prepara a entrada: ids de todas as palavras e, para cada id, o índice da palavra.
 * Palavras que ficam vazias (só símbolos) não vão para o modelo.
 */
export function prepararEntrada(tok, palavras, idioma = '') {
  const limpas = palavras.map((w) => palavraParaModelo(w, idioma));
  const ids = [];
  const daPalavra = [];
  limpas.forEach((w, i) => {
    if (!w) return;
    const pw = tok.codificar(w); // cada palavra começa com "▁" (o prefixo do SentencePiece)
    for (const id of pw) { ids.push(id); daPalavra.push(i); }
  });
  return { ids, daPalavra, limpas };
}

function temLetra(s) { return /\p{L}/u.test(s); }

/**
 * Aplica as previsões às palavras ORIGINAIS (o texto delas não muda, só ganha maiúsculas e pontuação).
 * Devolve [{ w, fim }] do tamanho de palavras: fim = o modelo disse que a frase termina ali.
 */
export function aplicarPrevisoes(tok, palavras, entrada, prev, idioma = '') {
  const { ids, daPalavra, limpas } = entrada;
  const saida = palavras.map((w) => ({ w: String(w), fim: false }));
  let k = 0;
  while (k < ids.length) {
    const i = daPalavra[k];
    let j = k;
    while (j < ids.length && daPalavra[j] === i) j++;
    // Letras do texto limpo, uma por uma, com a ordem de maiúscula da peça.
    const letrasMaiusc = [];
    let sigla = false;
    for (let x = k; x < j; x++) {
      const p = tok.peca(ids[x]);
      const comeco = p.startsWith('▁') ? 1 : 0;
      const letras = ids[x] === tok.unk ? null : Array.from(p);
      if (letras) for (let c = comeco; c < letras.length; c++) letrasMaiusc.push(!!prev.maiusc[x][c]);
      else letrasMaiusc.push({ desconhecida: true, m: !!prev.maiusc[x][0] }); // não se sabe quantas letras
      if (prev.depois[x] === '<ACRONYM>') sigla = true;
    }
    const limpa = limpas[i];
    const orig = saida[i].w;
    // Onde a parte limpa começa dentro da palavra original (pode ter aspas ou símbolos nas pontas).
    const ini = orig.toLocaleLowerCase(idioma || undefined).indexOf(limpa);
    let w = orig;
    const certas = letrasMaiusc.every((m) => typeof m === 'boolean');
    if (ini >= 0 && certas) {
      const letrasOrig = Array.from(orig);
      const iniLetra = Array.from(orig.slice(0, ini)).length;
      letrasMaiusc.forEach((m, c) => {
        if (m && letrasOrig[iniLetra + c]) letrasOrig[iniLetra + c] = letrasOrig[iniLetra + c].toLocaleUpperCase(idioma || undefined);
      });
      w = letrasOrig.join('');
    } else if (letrasMaiusc[0] === true || letrasMaiusc[0]?.m) {
      w = orig.replace(/\p{L}/u, (c) => c.toLocaleUpperCase(idioma || undefined));
    }
    if (sigla && ini >= 0 && /^\p{L}+$/u.test(limpa) && limpa.length <= 5) {
      // "usa" com sigla → "U.S.A."
      w = Array.from(w).map((c) => (temLetra(c) ? `${c}.` : c)).join('');
    }
    const antes = prev.antes[k];
    if (antes && temLetra(w)) w = antes + w;
    const depois = prev.depois[j - 1];
    if (depois && depois !== '<ACRONYM>' && !/[.,?!;:…]$/.test(w)) w += depois;
    const fim = !!prev.fim[j - 1];
    if (fim && !/[.?!…]["'”’»)\]]*$/.test(w)) w = w.replace(/[,;:]$/, '') + '.';
    saida[i] = { w, fim };
    k = j;
  }
  return saida;
}
