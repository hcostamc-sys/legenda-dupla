// i18n.js — interface no idioma do celular.
// Os textos do app são escritos em português. Com o celular em outro idioma, cada texto que aparece
// na tela (e os rótulos aria-label, title e placeholder) é traduzido pelo mesmo tradutor da legenda e
// guardado no aparelho: da segunda vez em diante a tradução é instantânea e funciona sem internet.
// Partes com translate="no" (legendas, títulos de vídeos, listas de idiomas) ficam como estão.
// Textos com números ("Traduzindo… 45%") viram um molde: a tradução vale para qualquer número.

import { codigoTradutor, idiomaInterface } from './idiomas.js';
import { traduzirLote } from './traducao.js';

const UI = idiomaInterface();
const PARA = codigoTradutor(navigator.language) || 'en';
const CHAVE = `ld.i18n.${PARA}.v1`;
const ATRIBUTOS = ['aria-label', 'title', 'placeholder'];
const RE_NUM = /\d+(?:[.,:]\d+)*/g;

/** true quando a interface precisa ser traduzida (celular em outro idioma que não o português). */
export const TRADUZIR_INTERFACE = (() => {
  try {
    const forcar = new URLSearchParams(location.search).get('ui'); // teste: ?ui=pt desliga
    if (forcar) return forcar !== 'pt';
  } catch { /* nada */ }
  return UI !== 'pt';
})();

let dic = {};
try { dic = JSON.parse(localStorage.getItem(CHAVE) || '{}') || {}; } catch { dic = {}; }
const produzidos = new Set(); // textos que nós mesmos pusemos na tela (não traduzir de novo)
const pendentes = new Set();
let timerPedido = 0;
let timerSalvar = 0;
let pedindo = false;
let falhas = 0;

function molde(texto) {
  const numeros = texto.match(RE_NUM) || [];
  let i = 0;
  return { molde: texto.replace(RE_NUM, () => `{${i++}}`), numeros };
}

function preencher(m, numeros) {
  return m.replace(/\{(\d+)\}/g, (x, i) => (numeros[Number(i)] ?? x));
}

/** Tradução já guardada do texto (ou null). */
function traducaoGuardada(texto) {
  const { molde: m, numeros } = molde(texto);
  const v = dic[m];
  return typeof v === 'string' ? preencher(v, numeros) : null;
}

/** Texto traduzido se já houver; se não, pede a tradução e devolve o português por enquanto. */
export function t(texto) {
  if (!TRADUZIR_INTERFACE || !texto || !/\p{L}/u.test(texto)) return texto;
  const g = traducaoGuardada(texto);
  if (g !== null) { produzidos.add(g); return g; }
  pedir(texto);
  return texto;
}

function pedir(texto) {
  pendentes.add(texto);
  clearTimeout(timerPedido);
  timerPedido = setTimeout(traduzirPendentes, 60);
}

async function traduzirPendentes() {
  if (pedindo || !pendentes.size || falhas > 3) return;
  pedindo = true;
  const lote = [...pendentes].slice(0, 60);
  lote.forEach((x) => pendentes.delete(x));
  try {
    const r = await traduzirLote(lote, 'pt', PARA);
    lote.forEach((orig, i) => {
      const trad = r[i];
      if (!trad) return;
      const a = molde(orig);
      const b = molde(trad);
      // O molde só vale se a tradução manteve os mesmos números (na mesma quantidade).
      if (a.numeros.length === b.numeros.length) dic[a.molde] = b.molde;
      else if (!a.numeros.length) dic[orig] = trad;
    });
    falhas = 0;
    clearTimeout(timerSalvar);
    timerSalvar = setTimeout(() => { try { localStorage.setItem(CHAVE, JSON.stringify(dic)); } catch { /* nada */ } }, 500);
    traduzirTudo();
  } catch {
    falhas++;
    lote.forEach((x) => pendentes.add(x));
  } finally {
    pedindo = false;
    liberarTela();
    if (pendentes.size) timerPedido = setTimeout(traduzirPendentes, falhas ? 3000 * falhas : 60);
  }
}

function ignorar(el) {
  return !el || !!el.closest?.('[translate="no"], script, style, noscript, [contenteditable="true"]');
}

function traduzirNo(no) {
  const bruto = no.data;
  if (!bruto || produzidos.has(bruto)) return;
  const texto = bruto.trim();
  if (!texto || !/\p{L}/u.test(texto) || ignorar(no.parentElement)) return;
  const g = traducaoGuardada(texto);
  if (g === null) { pedir(texto); return; }
  if (g === texto) return;
  const novo = bruto.replace(texto, g);
  produzidos.add(novo);
  no.data = novo;
}

function traduzirAtributos(el) {
  if (ignorar(el)) return;
  for (const a of ATRIBUTOS) {
    const v = el.getAttribute(a);
    if (!v || produzidos.has(v) || !/\p{L}/u.test(v)) continue;
    const g = traducaoGuardada(v.trim());
    if (g === null) { pedir(v.trim()); continue; }
    produzidos.add(g);
    if (g !== v) el.setAttribute(a, g);
  }
}

function traduzirArvore(raiz) {
  if (!raiz) return;
  if (raiz.nodeType === Node.TEXT_NODE) { traduzirNo(raiz); return; }
  if (raiz.nodeType !== Node.ELEMENT_NODE) return;
  if (ignorar(raiz)) return;
  traduzirAtributos(raiz);
  const andar = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n = andar.nextNode();
  while (n) {
    if (n.nodeType === Node.TEXT_NODE) traduzirNo(n);
    else traduzirAtributos(n);
    n = andar.nextNode();
  }
}

function traduzirTudo() {
  traduzirArvore(document.body);
  if (document.title && !produzidos.has(document.title)) {
    const g = traducaoGuardada(document.title);
    if (g) { produzidos.add(g); document.title = g; } else pedir(document.title);
  }
}

let telaPresa = false;
function liberarTela() {
  if (!telaPresa) return;
  telaPresa = false;
  document.documentElement.classList.remove('i18n-carregando');
}

/** Liga a tradução da interface (chamar uma vez, logo no início). */
export function iniciarI18n() {
  if (!TRADUZIR_INTERFACE) return;
  document.documentElement.lang = UI;
  // Primeira vez neste idioma: esconde a tela até chegar a primeira tradução (no máximo 3 s).
  if (!Object.keys(dic).length) {
    telaPresa = true;
    document.documentElement.classList.add('i18n-carregando');
    setTimeout(liberarTela, 3000);
  }
  traduzirTudo();
  const obs = new MutationObserver((lista) => {
    for (const m of lista) {
      if (m.type === 'characterData') traduzirNo(m.target);
      else if (m.type === 'attributes') traduzirAtributos(m.target);
      else m.addedNodes.forEach(traduzirArvore);
    }
  });
  obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATRIBUTOS });
}
