// pontuador-worker.js — roda o modelo de pontuação fora da tela (Web Worker), para o app não travar.
// Lê o modelo, o tokenizador e o motor (onnxruntime-web) direto do cache do aparelho, onde o
// download do pacote os guardou (js/modelos.js). Mensagens:
//   entrada: { tipo: 'pontuar', id, cache, wasm, pacote: { id, modelo, sp }, palavras, idioma }
//   saída:   { tipo: 'progresso', id, feitas, total } | { tipo: 'pronto', id, resultado } | { tipo: 'erro', id, mensagem }

import * as ort from '../vendor/ort/ort.wasm.bundle.min.mjs';
import { lerTokenizador, janelas, juntarJanelas, lerSaidas, prepararEntrada, aplicarPrevisoes } from './pontuador.js';

let carregado = null; // { pacote, sessao, tok }
let motorPronto = false;

async function lerDoCache(nomeCache, url) {
  const c = await caches.open(nomeCache);
  const r = await c.match(url);
  if (!r) throw new Error(`Arquivo do pacote não está no aparelho: ${url.split('/').pop()}`);
  return r.arrayBuffer();
}

async function carregar(msg) {
  if (carregado?.pacote === msg.pacote.id) return carregado;
  if (carregado) {
    try { await carregado.sessao.release(); } catch { /* nada */ }
    carregado = null;
  }
  if (!motorPronto) {
    // Sem isolamento entre sites (o GitHub Pages não deixa ligar), o motor roda numa linha só.
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    ort.env.wasm.wasmBinary = await lerDoCache(msg.cache, msg.wasm);
    motorPronto = true;
  }
  const tok = lerTokenizador(await lerDoCache(msg.cache, msg.pacote.sp));
  let modelo = await lerDoCache(msg.cache, msg.pacote.modelo);
  const sessao = await ort.InferenceSession.create(new Uint8Array(modelo), {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });
  modelo = null; // o motor já copiou: libera a memória
  carregado = { pacote: msg.pacote.id, sessao, tok };
  return carregado;
}

async function pontuar(msg) {
  const { sessao, tok } = await carregar(msg);
  const entrada = prepararEntrada(tok, msg.palavras, msg.idioma);
  const lista = janelas(entrada.ids);
  const resultados = [];
  for (let k = 0; k < lista.length; k++) {
    const ids = [tok.bos, ...lista[k].ids, tok.eos];
    const tensor = new ort.Tensor('int64', BigInt64Array.from(ids, (v) => BigInt(v)), [1, ids.length]);
    const saidas = await sessao.run({ input_ids: tensor });
    resultados.push(lerSaidas(saidas, lista[k].ids.length));
    for (const t of Object.values(saidas)) t.dispose?.();
    postMessage({ tipo: 'progresso', id: msg.id, feitas: k + 1, total: lista.length });
  }
  return aplicarPrevisoes(tok, msg.palavras, entrada, juntarJanelas(resultados), msg.idioma);
}

// Um pedido por vez, na ordem em que chegam.
let fila = Promise.resolve();
self.onmessage = (ev) => {
  const msg = ev.data;
  if (!msg || msg.tipo !== 'pontuar') return;
  fila = fila.then(async () => {
    try {
      const resultado = await pontuar(msg);
      postMessage({ tipo: 'pronto', id: msg.id, resultado });
    } catch (e) {
      postMessage({ tipo: 'erro', id: msg.id, mensagem: String(e?.message || e) });
    }
  });
};
