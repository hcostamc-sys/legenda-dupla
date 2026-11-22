// modelos.js — pacotes de pontuação melhorada: baixar, conferir, apagar e usar.
// Os arquivos ficam no cache do aparelho ("modelos-pontuacao-v1"), separados do cache do site:
// atualizar o app não apaga os pacotes. O modelo roda num Web Worker (js/pontuador-worker.js).

import { PACOTES, pacoteDoIdioma } from './pontuador.js';

export { PACOTES, pacoteDoIdioma };

export const CACHE_MODELOS = 'modelos-pontuacao-v1';
export const URL_WASM = new URL('../vendor/ort/ort-wasm-simd-threaded.wasm', import.meta.url).href;
export const BYTES_WASM = 14848852;

const suportado = () => typeof caches !== 'undefined' && typeof Worker !== 'undefined';

/** O aparelho consegue usar a pontuação melhorada? */
export function pontuacaoSuportada() {
  return suportado() && typeof WebAssembly === 'object';
}

/** Tamanho do download (bytes) de um pacote; inclui o motor se ele ainda não estiver no aparelho. */
export async function tamanhoDownload(id) {
  const p = PACOTES[id];
  let total = p.bytesModelo + p.bytesSp;
  if (!(await temArquivo(URL_WASM))) total += BYTES_WASM;
  return total;
}

async function temArquivo(url) {
  if (!suportado()) return false;
  try {
    const c = await caches.open(CACHE_MODELOS);
    return !!(await c.match(url));
  } catch {
    return false;
  }
}

/** 'pronto' quando os três arquivos (modelo, tokenizador e motor) estão no aparelho; senão 'ausente'. */
export async function estadoPacote(id) {
  const p = PACOTES[id];
  if (!p || !suportado()) return 'ausente';
  const [a, b, c] = await Promise.all([temArquivo(p.modelo), temArquivo(p.sp), temArquivo(URL_WASM)]);
  return a && b && c ? 'pronto' : 'ausente';
}

/**
 * Baixa um arquivo e grava direto no cache, sem juntar tudo na memória (o modelo tem até 210 MB):
 * os pedaços passam por um contador (progresso) a caminho do disco.
 */
async function baixarArquivo(cache, url, tamanho, aoBytes, sinal, chave = url) {
  const r = await fetch(url, { signal: sinal, credentials: 'omit', cache: 'no-store' });
  if (!r.ok) throw new Error(`O servidor respondeu ${r.status}.`);
  // Confere pelo tamanho conhecido do arquivo. O Content-Length não serve: quando o servidor manda
  // comprimido (o GitHub Pages faz isso com o motor .wasm), ele é o tamanho comprimido, menor que o
  // arquivo que chega aqui já descomprimido. Foi isso que dava "download incompleto" aos 12 MB.
  const esperado = tamanho || (r.headers.get('content-encoding') ? 0 : Number(r.headers.get('content-length')) || 0);
  let recebidos = 0;
  let corpo;
  if (r.body?.pipeThrough && typeof TransformStream === 'function') {
    corpo = r.body.pipeThrough(new TransformStream({
      transform(pedaco, ctrl) {
        recebidos += pedaco.byteLength;
        aoBytes(pedaco.byteLength);
        ctrl.enqueue(pedaco);
      },
    }));
  } else {
    corpo = await r.arrayBuffer();
    recebidos = corpo.byteLength;
    aoBytes(recebidos);
  }
  await cache.put(chave, new Response(corpo, { headers: { 'Content-Type': 'application/octet-stream' } }));
  if (esperado && recebidos !== esperado) {
    await cache.delete(chave);
    const e = new Error(`O download veio incompleto (${recebidos} de ${esperado} bytes).`);
    e.repetir = true;
    throw e;
  }
}

/**
 * Baixa um pacote. aoProgresso(feitos, total) em bytes. Cancela com o AbortSignal.
 * Se faltar espaço ou a internet cair, lança erro e não deixa arquivo pela metade.
 */
export async function baixarPacote(id, { aoProgresso = () => {}, sinal } = {}) {
  const p = PACOTES[id];
  if (!p) throw new Error('Pacote desconhecido.');
  if (!suportado()) throw new Error('Este aparelho não consegue guardar o pacote.');
  try { await navigator.storage?.persist?.(); } catch { /* nada: o pedido é só um reforço */ }
  const cache = await caches.open(CACHE_MODELOS);
  const lista = [];
  if (!(await cache.match(URL_WASM))) lista.push([URL_WASM, BYTES_WASM]);
  lista.push([p.sp, p.bytesSp], [p.modelo, p.bytesModelo]);
  const total = lista.reduce((s, [, n]) => s + n, 0);
  let feitos = 0;
  aoProgresso(0, total);
  try {
    for (const [url, tamanho] of lista) {
      // Internet instável: tenta o mesmo arquivo até 3 vezes antes de desistir.
      for (let tentativa = 1; ; tentativa++) {
        const antes = feitos;
        try {
          await baixarArquivo(cache, url, tamanho, (n) => { feitos += n; aoProgresso(Math.min(feitos, total), total); }, sinal);
          break;
        } catch (e) {
          feitos = antes;
          aoProgresso(feitos, total);
          const deRede = e?.repetir || e instanceof TypeError; // TypeError: a conexão caiu no meio
          if (e?.name === 'AbortError' || !deRede || tentativa >= 3) throw e;
          await new Promise((ok) => setTimeout(ok, 2000 * tentativa));
          if (sinal?.aborted) throw new DOMException('cancelado', 'AbortError');
        }
      }
    }
  } catch (e) {
    // Não deixa o pacote pela metade (o motor fica: serve para o outro pacote).
    await Promise.all([cache.delete(p.modelo), cache.delete(p.sp)]).catch(() => {});
    if (e?.name === 'AbortError') throw e;
    const semEspaco = e?.name === 'QuotaExceededError' || /quota/i.test(String(e?.message));
    throw new Error(semEspaco ? 'Falta espaço no celular para o pacote.' : e?.message || 'Não consegui baixar.');
  }
  aoProgresso(total, total);
}

/**
 * App Android 9+: o próprio Android baixa (continua com o app em segundo plano, com a barra de
 * progresso nas notificações). Esta é a lista que ele recebe: [{ url, bytes }], com o motor se faltar.
 */
export async function arquivosDoPacote(id) {
  const p = PACOTES[id];
  if (!p) throw new Error('Pacote desconhecido.');
  const lista = [];
  if (!(await temArquivo(URL_WASM))) lista.push({ url: URL_WASM, bytes: BYTES_WASM });
  lista.push({ url: p.sp, bytes: p.bytesSp }, { url: p.modelo, bytes: p.bytesModelo });
  return lista;
}

/**
 * Passa para o cache os arquivos que o Android já baixou. arquivos: [{ url, local, bytes }]; "local" é o
 * endereço pelo qual o app entrega o arquivo do celular. Fica guardado com o endereço original (url),
 * igual ao download feito pela página. Se algo falhar, não deixa o pacote pela metade.
 */
export async function instalarArquivosBaixados(id, arquivos, { aoProgresso = () => {}, sinal } = {}) {
  const p = PACOTES[id];
  if (!p) throw new Error('Pacote desconhecido.');
  if (!suportado()) throw new Error('Este aparelho não consegue guardar o pacote.');
  const validos = new Set([URL_WASM, p.sp, p.modelo]);
  const lista = (Array.isArray(arquivos) ? arquivos : []).filter((a) => a && validos.has(a.url) && typeof a.local === 'string');
  if (!lista.some((a) => a.url === p.modelo) || !lista.some((a) => a.url === p.sp)) throw new Error('O download veio incompleto.');
  try { await navigator.storage?.persist?.(); } catch { /* nada */ }
  const cache = await caches.open(CACHE_MODELOS);
  const total = lista.reduce((s, a) => s + (Number(a.bytes) || 0), 0);
  let feitos = 0;
  aoProgresso(0, total);
  try {
    for (const a of lista) {
      await baixarArquivo(cache, a.local, Number(a.bytes) || 0, (n) => { feitos += n; aoProgresso(Math.min(feitos, total), total); }, sinal, a.url);
    }
  } catch (e) {
    await Promise.all([cache.delete(p.modelo), cache.delete(p.sp)]).catch(() => {});
    if (e?.name === 'AbortError') throw e;
    const semEspaco = e?.name === 'QuotaExceededError' || /quota/i.test(String(e?.message));
    throw new Error(semEspaco ? 'Falta espaço no celular para o pacote.' : e?.message || 'Não consegui instalar o pacote.');
  }
  aoProgresso(total, total);
}

/** Apaga um pacote. O motor só sai quando não sobra nenhum pacote. */
export async function apagarPacote(id) {
  const p = PACOTES[id];
  if (!p || !suportado()) return;
  encerrarWorker();
  const cache = await caches.open(CACHE_MODELOS);
  await Promise.all([cache.delete(p.modelo), cache.delete(p.sp)]);
  const outros = await Promise.all(Object.keys(PACOTES).filter((k) => k !== id).map((k) => estadoPacote(k)));
  if (!outros.includes('pronto')) await cache.delete(URL_WASM);
}

// ---------------------------------------------------------------- uso (Web Worker)

let worker = null;
let timerOcioso = 0;
let proximoId = 1;
const pedidos = new Map();
const OCIOSO_MS = 60000; // o modelo ocupa bastante memória: solta um minuto depois do último uso

function encerrarWorker() {
  clearTimeout(timerOcioso);
  if (worker) worker.terminate();
  worker = null;
  for (const p of pedidos.values()) p.rejeitar(new Error('Pontuação interrompida.'));
  pedidos.clear();
}

function obterWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./pontuador-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (ev) => {
    const d = ev.data || {};
    const p = pedidos.get(d.id);
    if (!p) return;
    if (d.tipo === 'progresso') { p.aoProgresso?.(d.feitas, d.total); return; }
    pedidos.delete(d.id);
    if (d.tipo === 'pronto') p.resolver(d.resultado);
    else p.rejeitar(new Error(d.mensagem || 'Falha no modelo.'));
    agendarFim();
  };
  worker.onerror = (ev) => {
    // Erro sem resposta (memória insuficiente, por exemplo): derruba o worker e avisa todos.
    ev.preventDefault?.();
    const msg = ev.message || 'O modelo parou (talvez falta de memória).';
    const lista = [...pedidos.values()];
    pedidos.clear();
    if (worker) worker.terminate();
    worker = null;
    for (const p of lista) p.rejeitar(new Error(msg));
  };
  return worker;
}

function agendarFim() {
  clearTimeout(timerOcioso);
  timerOcioso = setTimeout(() => { if (!pedidos.size) encerrarWorker(); }, OCIOSO_MS);
}

/**
 * Pontua uma lista de palavras com o pacote do idioma. Devolve [{ w, fim }] do mesmo tamanho.
 * aoProgresso(feitas, total) em janelas de texto. Cancelar (AbortSignal) encerra o worker.
 */
export function pontuarPalavras(idPacote, palavras, idioma, { aoProgresso, sinal } = {}) {
  const p = PACOTES[idPacote];
  if (!p) return Promise.reject(new Error('Pacote desconhecido.'));
  clearTimeout(timerOcioso);
  return new Promise((resolver, rejeitar) => {
    const id = proximoId++;
    pedidos.set(id, { resolver, rejeitar, aoProgresso });
    sinal?.addEventListener('abort', () => {
      if (!pedidos.has(id)) return;
      pedidos.delete(id);
      encerrarWorker();
      rejeitar(new DOMException('cancelado', 'AbortError'));
    }, { once: true });
    obterWorker().postMessage({
      tipo: 'pontuar', id, cache: CACHE_MODELOS, wasm: URL_WASM,
      pacote: { id: p.id, modelo: p.modelo, sp: p.sp }, palavras, idioma,
    });
  });
}
