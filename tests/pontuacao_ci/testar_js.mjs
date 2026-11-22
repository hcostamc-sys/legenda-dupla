// Roda no GitHub Actions depois de referencia.py: confere o código do app (js/pontuador.js com o
// motor em vendor/ort) com os modelos de verdade, baixados pelos MESMOS endereços que o app usa.
// Uso: node testar_js.mjs <pasta da referência>
import { readFileSync } from 'node:fs';
import * as ort from '../../vendor/ort/ort.wasm.bundle.min.mjs';
import { PACOTES, lerTokenizador, janelas, juntarJanelas, lerSaidas, prepararEntrada, aplicarPrevisoes } from '../../js/pontuador.js';

const pasta = process.argv[2];
const ORIGEM = 'https://hcostamc-sys.github.io';
ort.env.wasm.numThreads = 1; // igual ao celular (sem isolamento entre sites)
ort.env.wasm.wasmBinary = readFileSync(new URL('../../vendor/ort/ort-wasm-simd-threaded.wasm', import.meta.url)).buffer;

let falhas = 0;
const falhar = (...a) => { falhas++; console.log('FALHA:', ...a); };

async function baixar(url, esperado) {
  const r = await fetch(url, { headers: { Origin: ORIGEM } });
  const cors = r.headers.get('access-control-allow-origin');
  console.log(`  ${url.split('/').pop()}: HTTP ${r.status}, CORS "${cors}", endereço final ${new URL(r.url).host}`);
  if (!r.ok) falhar('download', url, r.status);
  if (cors !== '*' && cors !== ORIGEM) falhar('o navegador do app não poderia ler (CORS)', url, cors);
  const b = new Uint8Array(await r.arrayBuffer());
  if (b.byteLength !== esperado) falhar('tamanho', url, b.byteLength, 'esperado', esperado);
  return b;
}

const frasesDe = (r) => {
  const frases = [];
  let atual = [];
  for (const x of r) { atual.push(x.w); if (x.fim) { frases.push(atual.join(' ')); atual = []; } }
  if (atual.length) frases.push(atual.join(' '));
  return frases;
};

for (const [nomeRef, idPacote, idioma] of [['en', 'en', 'en'], ['romance', 'latinas', 'fr']]) {
  const p = PACOTES[idPacote];
  console.log(`===== ${p.nome}`);
  const sp = await baixar(p.sp, p.bytesSp);
  const modelo = await baixar(p.modelo, p.bytesModelo);
  const tok = lerTokenizador(sp);
  let t0 = performance.now();
  const sessao = await ort.InferenceSession.create(modelo, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  console.log(`  carregar o modelo: ${((performance.now() - t0) / 1000).toFixed(2)} s`);
  const ref = JSON.parse(readFileSync(`${pasta}/${nomeRef}.referencia.json`, 'utf8'));
  for (const caso of ref.casos) {
    const palavras = caso.texto.split(' ');
    const ent = prepararEntrada(tok, palavras, idioma);
    if (JSON.stringify(ent.ids) !== JSON.stringify(caso.ids)) falhar('ids diferentes', caso.texto.slice(0, 60));
    const lista = janelas(ent.ids);
    const res = [];
    t0 = performance.now();
    for (const j of lista) {
      const ids = [tok.bos, ...j.ids, tok.eos];
      const o = await sessao.run({ input_ids: new ort.Tensor('int64', BigInt64Array.from(ids, (v) => BigInt(v)), [1, ids.length]) });
      res.push(lerSaidas(o, j.ids.length));
    }
    const seg = (performance.now() - t0) / 1000;
    const frases = frasesDe(aplicarPrevisoes(tok, palavras, ent, juntarJanelas(res), idioma));
    // O app mantém o texto original onde a biblioteca escreve <unk> (ex.: o hífen em "est-ce").
    const oficial = caso.oficial.map((f) => f.replace(/<unk>/g, '-'));
    const igual = JSON.stringify(frases) === JSON.stringify(oficial);
    if (!igual) {
      const d = frases.findIndex((f, k) => f !== oficial[k]);
      falhar(`resultado diferente (${caso.longo ? 'texto longo' : caso.texto.slice(0, 40)})`, '\n    app:     ', frases[d], '\n    oficial: ', oficial[d]);
    }
    console.log(`  ${igual ? 'igual' : 'DIFERENTE'} · ${ent.ids.length} peças em ${lista.length} janela(s) · ${seg.toFixed(2)} s${caso.longo ? ' (texto longo)' : ''}`);
    if (!caso.longo) console.log('   ', JSON.stringify(frases));
  }
  await sessao.release();
}
console.log(falhas ? `${falhas} FALHA(S)` : 'TUDO CERTO: o app reproduz a biblioteca oficial.');
process.exit(falhas ? 1 : 0);
