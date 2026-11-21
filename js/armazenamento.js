// armazenamento.js — IndexedDB (vídeos) e localStorage (ajustes). PLANO.md seção 11.
// Todo acesso fica em try/catch. Se o IndexedDB não abrir, guarda só na memória.

const BANCO = 'legenda-dupla';
const STORE = 'videos';
const CHAVE_AJUSTES = 'ld.ajustes';

export const AJUSTES_PADRAO = Object.freeze({
  versao: 1,
  idioma: 'en',
  tocarAoNavegar: true,
  preRolagem: 0.15,
  preRolagemFrases: 0.3,
  antecedencia: 0.1,
  pausaAuto: false,
  loop: false,
  loopVezes: 0, // 0 = ∞
  pausaEntreRepeticoes: 0,
  linha1: 'visivel', // visivel | borrada | oculta
  linha2: 'visivel',
  traducaoSoPausado: false,
  inverterOrdem: false,
  manterUltima: true,
  modoFrases: 'auto', // auto | ligado | desligado
  esconderMarcacoes: false,
  inverterArraste: false,
  legendaSobreEmPe: false,
  posicaoSobre: 'baixo', // baixo | cima
  opacidadeFundo: 60,
  fonteL1: 22,
  fonteL2: 18,
  velocidade: 1,
});

const OPCOES = {
  idioma: ['en', 'fr', 'es', 'it', 'de', 'auto'],
  linha1: ['visivel', 'borrada', 'oculta'],
  linha2: ['visivel', 'borrada', 'oculta'],
  modoFrases: ['auto', 'ligado', 'desligado'],
  posicaoSobre: ['baixo', 'cima'],
  loopVezes: [0, 1, 2, 3, 5],
  pausaEntreRepeticoes: [0, 0.5, 1, 2],
};
const FAIXAS = {
  preRolagem: [0, 0.5],
  preRolagemFrases: [0, 0.5],
  antecedencia: [0, 0.3],
  opacidadeFundo: [0, 100],
  fonteL1: [14, 40],
  fonteL2: [14, 40],
  velocidade: [0.25, 2],
};

/** Mistura ajustes salvos com os padrões, descartando tipos, opções e faixas inválidos. */
export function misturarAjustes(salvos) {
  const a = { ...AJUSTES_PADRAO };
  if (salvos && typeof salvos === 'object') {
    for (const k of Object.keys(AJUSTES_PADRAO)) {
      if (k === 'versao' || !(k in salvos)) continue;
      const v = salvos[k];
      if (typeof v !== typeof AJUSTES_PADRAO[k]) continue;
      if (typeof v === 'number' && !Number.isFinite(v)) continue;
      if (OPCOES[k] && !OPCOES[k].includes(v)) continue;
      if (FAIXAS[k] && (v < FAIXAS[k][0] || v > FAIXAS[k][1])) continue;
      a[k] = v;
    }
  }
  return a;
}

export function carregarAjustes() {
  try {
    const bruto = localStorage.getItem(CHAVE_AJUSTES);
    return misturarAjustes(bruto ? JSON.parse(bruto) : null);
  } catch {
    return { ...AJUSTES_PADRAO };
  }
}

export function salvarAjustes(ajustes) {
  try {
    localStorage.setItem(CHAVE_AJUSTES, JSON.stringify({ ...ajustes, versao: 1 }));
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- IndexedDB

let promessaBanco = null;
let soMemoria = false;
const memoria = new Map();
let pediuPersistencia = false;

function abrir() {
  if (promessaBanco) return promessaBanco;
  promessaBanco = new Promise((resolve) => {
    try {
      const req = indexedDB.open(BANCO, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { soMemoria = true; resolve(null); };
      req.onblocked = () => { soMemoria = true; resolve(null); };
    } catch {
      soMemoria = true;
      resolve(null);
    }
  });
  return promessaBanco;
}

/** true se o navegador não deixou usar o IndexedDB. */
export async function estaSoNaMemoria() {
  await abrir();
  return soMemoria;
}

function pedido(db, modo, fn) {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE, modo);
      const store = tx.objectStore(STORE);
      const req = fn(store);
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    } catch (e) {
      reject(e);
    }
  });
}

function pedirPersistencia() {
  if (pediuPersistencia) return;
  pediuPersistencia = true;
  try { navigator.storage?.persist?.().catch(() => {}); } catch { /* nada */ }
}

export async function salvarVideo(registro) {
  pedirPersistencia();
  const db = await abrir();
  if (!db) { memoria.set(registro.id, structuredClone(registro)); return true; }
  try {
    await pedido(db, 'readwrite', (s) => s.put(registro));
    return true;
  } catch {
    memoria.set(registro.id, structuredClone(registro));
    return false;
  }
}

export async function obterVideo(id) {
  const db = await abrir();
  if (!db) return memoria.get(id) || null;
  try {
    return (await pedido(db, 'readonly', (s) => s.get(id))) || memoria.get(id) || null;
  } catch {
    return memoria.get(id) || null;
  }
}

export async function listarVideos() {
  const db = await abrir();
  let lista = [];
  if (db) {
    try { lista = (await pedido(db, 'readonly', (s) => s.getAll())) || []; } catch { lista = []; }
  }
  const ids = new Set(lista.map((v) => v.id));
  for (const v of memoria.values()) if (!ids.has(v.id)) lista.push(v);
  lista.sort((a, b) => String(b.abertoEm || '').localeCompare(String(a.abertoEm || '')));
  return lista;
}

export async function apagarVideo(id) {
  memoria.delete(id);
  const db = await abrir();
  if (!db) return true;
  try { await pedido(db, 'readwrite', (s) => s.delete(id)); return true; } catch { return false; }
}

// ---------------------------------------------------------------- backup (11.3)

const RE_ID = /^[A-Za-z0-9_-]{11}$/;

function falasValidas(falas) {
  return Array.isArray(falas) && falas.every((f) => f && Number.isFinite(f.s) && Number.isFinite(f.e) && typeof f.t === 'string');
}

/** Confere a forma de um registro de vídeo. */
export function registroValido(v) {
  if (!v || typeof v !== 'object' || !RE_ID.test(v.id || '')) return false;
  if (!v.estudo || !falasValidas(v.estudo.falas) || !v.estudo.falas.length) return false;
  if (v.traducao != null && !falasValidas(v.traducao.falas)) return false;
  return true;
}

function limparRegistro(v) {
  return {
    id: v.id,
    titulo: typeof v.titulo === 'string' ? v.titulo : '',
    criadoEm: typeof v.criadoEm === 'string' ? v.criadoEm : new Date().toISOString(),
    abertoEm: typeof v.abertoEm === 'string' ? v.abertoEm : new Date(0).toISOString(),
    posicao: Number.isFinite(v.posicao) ? v.posicao : 0,
    estudo: { arquivo: String(v.estudo.arquivo || ''), falas: v.estudo.falas.map(({ s, e, t }) => ({ s, e, t })) },
    traducao: v.traducao ? { arquivo: String(v.traducao.arquivo || ''), falas: v.traducao.falas.map(({ s, e, t }) => ({ s, e, t })) } : null,
    ajusteEstudo: Number.isFinite(v.ajusteEstudo) ? v.ajusteEstudo : 0,
    ajusteTraducao: Number.isFinite(v.ajusteTraducao) ? v.ajusteTraducao : 0,
  };
}

export async function montarBackup(ajustes) {
  return {
    versao: 1,
    exportadoEm: new Date().toISOString(),
    ajustes: { ...ajustes, versao: 1 },
    videos: await listarVideos(),
  };
}

/**
 * Mescla um backup. Devolve { novos, existiam, invalidos, ajustes } ou lança Error com mensagem amigável.
 * Se o ID já existir, fica o registro com abertoEm mais recente.
 */
export async function importarBackup(dados) {
  if (!dados || typeof dados !== 'object' || dados.versao !== 1 || !Array.isArray(dados.videos)) {
    throw new Error('Esse arquivo não é um backup do Legenda Dupla.');
  }
  let novos = 0;
  let existiam = 0;
  let invalidos = 0;
  for (const bruto of dados.videos) {
    if (!registroValido(bruto)) { invalidos++; continue; }
    const v = limparRegistro(bruto);
    const atual = await obterVideo(v.id);
    if (atual) {
      existiam++;
      if (String(v.abertoEm) > String(atual.abertoEm || '')) await salvarVideo(v);
    } else {
      novos++;
      await salvarVideo(v);
    }
  }
  return { novos, existiam, invalidos, ajustes: dados.ajustes ? misturarAjustes(dados.ajustes) : null };
}
