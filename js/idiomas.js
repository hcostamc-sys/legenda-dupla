// idiomas.js — idiomas da tradução automática (todos os do Google Tradutor), nomes no idioma do
// celular, idioma do sistema e endereço do dicionário. Sem DOM: funciona também no Node (testes).

/** Códigos aceitos pelo tradutor do Google (translate_a). Os nomes vêm do Intl, no idioma do celular. */
export const IDIOMAS_TRADUCAO = [
  'af', 'sq', 'am', 'ar', 'hy', 'as', 'ay', 'az', 'bm', 'eu', 'be', 'bn', 'bho', 'bs', 'bg', 'ca', 'ceb', 'ny',
  'zh-CN', 'zh-TW', 'co', 'hr', 'cs', 'da', 'dv', 'doi', 'nl', 'en', 'eo', 'et', 'ee', 'tl', 'fi', 'fr', 'fy',
  'gl', 'ka', 'de', 'el', 'gn', 'gu', 'ht', 'ha', 'haw', 'iw', 'hi', 'hmn', 'hu', 'is', 'ig', 'ilo', 'id', 'ga',
  'it', 'ja', 'jw', 'kn', 'kk', 'km', 'rw', 'gom', 'ko', 'kri', 'ku', 'ckb', 'ky', 'lo', 'la', 'lv', 'ln', 'lt',
  'lg', 'lb', 'mk', 'mai', 'mg', 'ms', 'ml', 'mt', 'mi', 'mr', 'mni-Mtei', 'lus', 'mn', 'my', 'ne', 'no', 'or',
  'om', 'ps', 'fa', 'pl', 'pt', 'pt-PT', 'pa', 'qu', 'ro', 'ru', 'sm', 'sa', 'gd', 'nso', 'sr', 'st', 'sn', 'sd',
  'si', 'sk', 'sl', 'so', 'es', 'su', 'sw', 'sv', 'tg', 'ta', 'tt', 'te', 'th', 'ti', 'ts', 'tr', 'tk', 'ak',
  'uk', 'ur', 'ug', 'uz', 'vi', 'cy', 'xh', 'yi', 'yo', 'zu',
];
const ACEITOS = new Set(IDIOMAS_TRADUCAO);

// O Google usa códigos antigos para alguns idiomas; o Intl (nomes) usa os atuais.
const PARA_INTL = { iw: 'he', jw: 'jv', tl: 'fil', 'mni-Mtei': 'mni', 'zh-CN': 'zh-Hans', 'zh-TW': 'zh-Hant' };
const SINONIMOS = { he: 'iw', jv: 'jw', fil: 'tl', nb: 'no', nn: 'no', mni: 'mni-Mtei', in: 'id', ji: 'yi' };

/**
 * Converte um código qualquer (do celular, do YouTube: 'pt-BR', 'en-US', 'zh-Hans', 'he', 'es-419')
 * para o código do tradutor. Devolve '' se o tradutor não tiver o idioma.
 */
export function codigoTradutor(codigo) {
  const c = String(codigo || '').trim().replace(/_/g, '-');
  if (!c) return '';
  if (ACEITOS.has(c)) return c;
  const partes = c.toLowerCase().split('-');
  const base = partes[0];
  if (base === 'zh') {
    return partes.some((p) => ['tw', 'hk', 'mo', 'hant'].includes(p)) ? 'zh-TW' : 'zh-CN';
  }
  if (base === 'pt' && partes.slice(1).includes('pt')) return 'pt-PT';
  if (base === 'mni') return 'mni-Mtei';
  const b = SINONIMOS[base] || base;
  return ACEITOS.has(b) ? b : '';
}

/** Mesmo idioma, sem olhar a região ('en' e 'en-US'; 'he' e 'iw'; 'pt-BR' e 'pt'). */
export function mesmoIdioma(a, b) {
  const base = (c) => {
    const x = String(c || '').toLowerCase().split(/[-_.]/)[0];
    return SINONIMOS[x] || x;
  };
  return !!a && !!b && base(a) === base(b);
}

/** Idioma do celular (o primeiro da lista do sistema), já no código do tradutor. Inglês se não houver. */
export function idiomaDoSistema(lista) {
  let langs = lista;
  if (!langs) {
    try { langs = (globalThis.navigator?.languages?.length ? navigator.languages : [navigator.language]); } catch { langs = []; }
  }
  for (const l of langs || []) {
    const c = codigoTradutor(l);
    if (c) return c;
  }
  return 'en';
}

/** Idioma da interface (só a parte principal: 'pt', 'en', 'es'...). */
export function idiomaInterface() {
  try { return String(navigator.language || 'pt').split('-')[0].toLowerCase() || 'pt'; } catch { return 'pt'; }
}

const cacheNomes = new Map();
/** Nome do idioma no idioma da interface, com a primeira letra maiúscula ("Inglês", "English"). */
export function nomeIdioma(codigo, ui = idiomaInterface()) {
  const c = String(codigo || '');
  if (!c) return '';
  const chave = `${ui}|${c}`;
  if (cacheNomes.has(chave)) return cacheNomes.get(chave);
  let nome = '';
  try {
    nome = new Intl.DisplayNames([ui, 'en'], { type: 'language', fallback: 'none' }).of(PARA_INTL[c] || c) || '';
  } catch { /* Intl sem o idioma */ }
  if (!nome || nome === c) {
    // Alguns idiomas pequenos não estão no Intl do aparelho: nomes em inglês.
    nome = { gom: 'Konkani', kri: 'Krio', lus: 'Mizo', ckb: 'Kurdish (Sorani)', 'mni-Mtei': 'Meiteilon (Manipuri)', doi: 'Dogri', bho: 'Bhojpuri', ilo: 'Ilocano', nso: 'Sepedi' }[c] || c;
  }
  nome = nome.charAt(0).toLocaleUpperCase(ui) + nome.slice(1);
  cacheNomes.set(chave, nome);
  return nome;
}

/** [{ codigo, nome }] de todos os idiomas da tradução, em ordem alfabética no idioma da interface. */
export function listaIdiomas(ui = idiomaInterface()) {
  const lista = IDIOMAS_TRADUCAO.map((codigo) => ({ codigo, nome: nomeIdioma(codigo, ui) }));
  try {
    const col = new Intl.Collator(ui);
    lista.sort((a, b) => col.compare(a.nome, b.nome));
  } catch {
    lista.sort((a, b) => (a.nome < b.nome ? -1 : 1));
  }
  return lista;
}

// Dicionários bilíngues do Cambridge a partir do inglês (endereço /search/direct, que acha a forma base:
// "earliest" abre "early").
const CAMBRIDGE = {
  pt: 'portuguese', 'pt-PT': 'portuguese', es: 'spanish', fr: 'french', de: 'german', it: 'italian', nl: 'dutch',
  pl: 'polish', ja: 'japanese', ko: 'korean', 'zh-CN': 'chinese-simplified', 'zh-TW': 'chinese-traditional',
  tr: 'turkish', ru: 'russian', ar: 'arabic', ca: 'catalan', cs: 'czech', da: 'danish', hi: 'hindi', id: 'indonesian',
  ms: 'malay', no: 'norwegian', sv: 'swedish', th: 'thai', uk: 'ukrainian', vi: 'vietnamese', bn: 'bengali',
  gu: 'gujarati', mr: 'marathi', ta: 'tamil', te: 'telugu', ur: 'urdu',
};

/**
 * Endereço do dicionário para a palavra: Cambridge (inglês → idioma do usuário) quando a palavra é
 * em inglês; nos outros idiomas, o Wikcionário no idioma do usuário.
 */
export function urlDicionario(palavra, de, para) {
  const p = String(palavra || '').trim().toLowerCase();
  const q = encodeURIComponent(p);
  if (mesmoIdioma(de, 'en')) {
    const par = CAMBRIDGE[para] ? `english-${CAMBRIDGE[para]}` : 'english';
    return `https://dictionary.cambridge.org/search/direct/?datasetsearch=${par}&q=${q}`;
  }
  const wiki = { 'zh-CN': 'zh', 'zh-TW': 'zh', 'pt-PT': 'pt', iw: 'he', jw: 'jv', tl: 'tl', no: 'no' }[para] || String(para || 'en').split('-')[0];
  return `https://${wiki}.wiktionary.org/wiki/Special:Search?search=${q}&go=Go`;
}
