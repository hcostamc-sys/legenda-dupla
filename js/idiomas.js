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

// Nomes fixos (os do Google Tradutor). O Intl do Android (WebView) não tem o nome de vários idiomas
// pequenos e mostrava só o código ("Ps", "Qu", "Rw"); em português e inglês os nomes vêm daqui.
const NOMES_PT = {
  af: 'Africâner', sq: 'Albanês', am: 'Amárico', ar: 'Árabe', hy: 'Armênio', as: 'Assamês', ay: 'Aimará',
  az: 'Azerbaijano', bm: 'Bambara', eu: 'Basco', be: 'Bielorrusso', bn: 'Bengali', bho: 'Bhojpuri', bs: 'Bósnio',
  bg: 'Búlgaro', ca: 'Catalão', ceb: 'Cebuano', ny: 'Chichewa', 'zh-CN': 'Chinês (simplificado)',
  'zh-TW': 'Chinês (tradicional)', co: 'Corso', hr: 'Croata', cs: 'Tcheco', da: 'Dinamarquês', dv: 'Divehi',
  doi: 'Dogri', nl: 'Holandês', en: 'Inglês', eo: 'Esperanto', et: 'Estoniano', ee: 'Ewe', tl: 'Filipino',
  fi: 'Finlandês', fr: 'Francês', fy: 'Frísio', gl: 'Galego', ka: 'Georgiano', de: 'Alemão', el: 'Grego',
  gn: 'Guarani', gu: 'Guzerate', ht: 'Crioulo haitiano', ha: 'Hauçá', haw: 'Havaiano', iw: 'Hebraico', hi: 'Hindi',
  hmn: 'Hmong', hu: 'Húngaro', is: 'Islandês', ig: 'Igbo', ilo: 'Ilocano', id: 'Indonésio', ga: 'Irlandês',
  it: 'Italiano', ja: 'Japonês', jw: 'Javanês', kn: 'Canarês', kk: 'Cazaque', km: 'Khmer', rw: 'Kinyarwanda',
  gom: 'Konkani', ko: 'Coreano', kri: 'Krio', ku: 'Curdo (kurmanji)', ckb: 'Curdo (sorani)', ky: 'Quirguiz',
  lo: 'Laosiano', la: 'Latim', lv: 'Letão', ln: 'Lingala', lt: 'Lituano', lg: 'Luganda', lb: 'Luxemburguês',
  mk: 'Macedônio', mai: 'Maithili', mg: 'Malgaxe', ms: 'Malaio', ml: 'Malaiala', mt: 'Maltês', mi: 'Maori',
  mr: 'Marati', 'mni-Mtei': 'Meitei (manipuri)', lus: 'Mizo', mn: 'Mongol', my: 'Birmanês', ne: 'Nepalês',
  no: 'Norueguês', or: 'Oriá', om: 'Oromo', ps: 'Pashto', fa: 'Persa', pl: 'Polonês', pt: 'Português',
  'pt-PT': 'Português (Portugal)', pa: 'Punjabi', qu: 'Quíchua', ro: 'Romeno', ru: 'Russo', sm: 'Samoano',
  sa: 'Sânscrito', gd: 'Gaélico escocês', nso: 'Sepedi', sr: 'Sérvio', st: 'Sesoto', sn: 'Shona', sd: 'Sindi',
  si: 'Cingalês', sk: 'Eslovaco', sl: 'Esloveno', so: 'Somali', es: 'Espanhol', su: 'Sundanês', sw: 'Suaíli',
  sv: 'Sueco', tg: 'Tadjique', ta: 'Tâmil', tt: 'Tártaro', te: 'Télugo', th: 'Tailandês', ti: 'Tigrínia',
  ts: 'Tsonga', tr: 'Turco', tk: 'Turcomeno', ak: 'Twi', uk: 'Ucraniano', ur: 'Urdu', ug: 'Uigur', uz: 'Uzbeque',
  vi: 'Vietnamita', cy: 'Galês', xh: 'Xhosa', yi: 'Iídiche', yo: 'Iorubá', zu: 'Zulu',
};
const NOMES_EN = {
  af: 'Afrikaans', sq: 'Albanian', am: 'Amharic', ar: 'Arabic', hy: 'Armenian', as: 'Assamese', ay: 'Aymara',
  az: 'Azerbaijani', bm: 'Bambara', eu: 'Basque', be: 'Belarusian', bn: 'Bengali', bho: 'Bhojpuri', bs: 'Bosnian',
  bg: 'Bulgarian', ca: 'Catalan', ceb: 'Cebuano', ny: 'Chichewa', 'zh-CN': 'Chinese (Simplified)',
  'zh-TW': 'Chinese (Traditional)', co: 'Corsican', hr: 'Croatian', cs: 'Czech', da: 'Danish', dv: 'Dhivehi',
  doi: 'Dogri', nl: 'Dutch', en: 'English', eo: 'Esperanto', et: 'Estonian', ee: 'Ewe', tl: 'Filipino',
  fi: 'Finnish', fr: 'French', fy: 'Frisian', gl: 'Galician', ka: 'Georgian', de: 'German', el: 'Greek',
  gn: 'Guarani', gu: 'Gujarati', ht: 'Haitian Creole', ha: 'Hausa', haw: 'Hawaiian', iw: 'Hebrew', hi: 'Hindi',
  hmn: 'Hmong', hu: 'Hungarian', is: 'Icelandic', ig: 'Igbo', ilo: 'Ilocano', id: 'Indonesian', ga: 'Irish',
  it: 'Italian', ja: 'Japanese', jw: 'Javanese', kn: 'Kannada', kk: 'Kazakh', km: 'Khmer', rw: 'Kinyarwanda',
  gom: 'Konkani', ko: 'Korean', kri: 'Krio', ku: 'Kurdish (Kurmanji)', ckb: 'Kurdish (Sorani)', ky: 'Kyrgyz',
  lo: 'Lao', la: 'Latin', lv: 'Latvian', ln: 'Lingala', lt: 'Lithuanian', lg: 'Luganda', lb: 'Luxembourgish',
  mk: 'Macedonian', mai: 'Maithili', mg: 'Malagasy', ms: 'Malay', ml: 'Malayalam', mt: 'Maltese', mi: 'Maori',
  mr: 'Marathi', 'mni-Mtei': 'Meiteilon (Manipuri)', lus: 'Mizo', mn: 'Mongolian', my: 'Myanmar (Burmese)',
  ne: 'Nepali', no: 'Norwegian', or: 'Odia (Oriya)', om: 'Oromo', ps: 'Pashto', fa: 'Persian', pl: 'Polish',
  pt: 'Portuguese', 'pt-PT': 'Portuguese (Portugal)', pa: 'Punjabi', qu: 'Quechua', ro: 'Romanian', ru: 'Russian',
  sm: 'Samoan', sa: 'Sanskrit', gd: 'Scots Gaelic', nso: 'Sepedi', sr: 'Serbian', st: 'Sesotho', sn: 'Shona',
  sd: 'Sindhi', si: 'Sinhala', sk: 'Slovak', sl: 'Slovenian', so: 'Somali', es: 'Spanish', su: 'Sundanese',
  sw: 'Swahili', sv: 'Swedish', tg: 'Tajik', ta: 'Tamil', tt: 'Tatar', te: 'Telugu', th: 'Thai', ti: 'Tigrinya',
  ts: 'Tsonga', tr: 'Turkish', tk: 'Turkmen', ak: 'Twi', uk: 'Ukrainian', ur: 'Urdu', ug: 'Uyghur', uz: 'Uzbek',
  vi: 'Vietnamese', cy: 'Welsh', xh: 'Xhosa', yi: 'Yiddish', yo: 'Yoruba', zu: 'Zulu',
};

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
  let nome = ui === 'pt' ? NOMES_PT[c] : ui === 'en' ? NOMES_EN[c] : '';
  if (!nome) {
    try {
      const n = new Intl.DisplayNames([ui], { type: 'language', fallback: 'none' }).of(PARA_INTL[c] || c) || '';
      // O Intl sem o idioma devolve vazio ou o próprio código: não serve.
      if (n && n.toLowerCase() !== c.toLowerCase() && n.toLowerCase() !== String(PARA_INTL[c] || '').toLowerCase()) nome = n;
    } catch { /* Intl sem o idioma */ }
  }
  if (!nome) nome = NOMES_PT[c] && ui === 'pt' ? NOMES_PT[c] : NOMES_EN[c] || c;
  nome = nome.charAt(0).toLocaleUpperCase(ui) + nome.slice(1);
  cacheNomes.set(chave, nome);
  return nome;
}

/**
 * Nome de um código do YouTube ou do celular, com a região quando houver:
 * 'en-US' → "Inglês (Estados Unidos)", 'es-419' → "Espanhol (América Latina)", 'ps' → "Pashto".
 * Devolve '' se não conhecer o idioma.
 */
export function nomeCodigoIdioma(codigo, ui = idiomaInterface()) {
  const c = String(codigo || '').trim().replace(/_/g, '-');
  if (!c) return '';
  const trad = codigoTradutor(c);
  let nome = trad ? nomeIdioma(trad, ui) : '';
  if (!nome) {
    try {
      const n = new Intl.DisplayNames([ui], { type: 'language', fallback: 'none' }).of(c) || '';
      if (n && n.toLowerCase() !== c.toLowerCase()) return n.charAt(0).toLocaleUpperCase(ui) + n.slice(1);
    } catch { /* código que o Intl não conhece */ }
    return '';
  }
  // Região (US, BR, 419...). Chinês e pt-PT já trazem a variante no nome.
  if (trad === 'zh-CN' || trad === 'zh-TW' || trad === 'pt-PT') return nome;
  const regiao = c.split('-').slice(1).find((p) => /^([A-Za-z]{2}|\d{3})$/.test(p));
  if (regiao) {
    try {
      const r = new Intl.DisplayNames([ui], { type: 'region', fallback: 'none' }).of(regiao.toUpperCase()) || '';
      if (r && r.toUpperCase() !== regiao.toUpperCase()) nome += ` (${r})`;
    } catch { /* sem nome da região: fica só o idioma */ }
  }
  return nome;
}

/** [{ codigo, nome }] de todos os idiomas da tradução, em ordem alfabética no idioma da interface. */
export function listaIdiomas(ui = idiomaInterface()) {
  const lista = IDIOMAS_TRADUCAO.map((codigo) => ({ codigo, nome: nomeIdioma(codigo, ui) }));
  try {
    const col = new Intl.Collator(ui);
    lista.sort((a, b) => col.compare(a.nome, b.nome));
  } catch {
    lista.sort((a, b) => a.nome.localeCompare(b.nome));
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
