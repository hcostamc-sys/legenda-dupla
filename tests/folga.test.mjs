// Folga antes da fala (versão 22): ao avançar, retroceder ou repetir, o destino é o início da fala
// menos a folga escolhida nos Ajustes, qualquer que seja o silêncio antes dela.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  tempoDestinoFolga, navegar, processar, lerArquivoLegenda, FOLGA_MIN_FRASES, FOLGAS_MAX, FOLGA_MAX_PADRAO,
} from '../js/legendas.js';
import { lerTimedText } from '../js/timedtext.js';
import { misturarAjustes, AJUSTES_PADRAO } from '../js/armazenamento.js';

const quase = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test('versão 22: o destino é sempre o início da fala menos a folga escolhida', () => {
  // silêncio curto, longo, quase nulo e fala sobreposta: o ajuste vale em todos
  for (const ant of [{ s: 8, e: 9.7 }, { s: 2, e: 4 }, { s: 8, e: 9.95 }, { s: 8, e: 10.4 }]) {
    const un = [ant, { s: 10, e: 12 }];
    quase(tempoDestinoFolga(un, 1), 10 - FOLGA_MAX_PADRAO);
    for (const max of FOLGAS_MAX) quase(tempoDestinoFolga(un, 1, { max, min: FOLGA_MIN_FRASES }), 10 - max);
  }
});

test('cada valor do ajuste dá um destino diferente, mesmo com pausa curta (caso do usuário)', () => {
  const un = [{ s: 8, e: 9.9 }, { s: 10, e: 12 }]; // 0,1 s de silêncio
  const destinos = FOLGAS_MAX.map((max) => tempoDestinoFolga(un, 1, { max, min: FOLGA_MIN_FRASES }));
  assert.equal(new Set(destinos).size, FOLGAS_MAX.length, destinos.join(' '));
});

test('a folga nunca fica abaixo da mínima', () => {
  quase(tempoDestinoFolga([{ s: 2, e: 4 }, { s: 10, e: 12 }], 1, { min: 0.3, max: 0.1 }), 9.7);
});

test('primeira fala e começo do vídeo: nunca abaixo de 0', () => {
  quase(tempoDestinoFolga([{ s: 5, e: 6 }], 0), 5 - FOLGA_MAX_PADRAO);
  assert.equal(tempoDestinoFolga([{ s: 0.3, e: 1 }], 0, { max: 0.8 }), 0);
  assert.equal(tempoDestinoFolga([], 0), 0);
});

test('navegação a partir do destino (no silêncio, antes da fala): com a fala na tela como atual', () => {
  const un = [{ s: 0, e: 2 }, { s: 3, e: 5 }, { s: 6, e: 8 }];
  const t = tempoDestinoFolga(un, 1); // 2,55: antes da fala 1, depois da 0
  // Sem a fala de destino como atual, avançar repetiria a mesma fala (o que app.js evita)
  assert.equal(navegar(un, t, 'avancar').indice, 1);
  // app.js passa a fala de destino como memória enquanto o vídeo não chega nela
  const mem = { indice: 1, quando: 1000 };
  assert.equal(navegar(un, t, 'avancar', mem, 1000).indice, 2);
  assert.equal(navegar(un, t, 'voltar', mem, 1000).indice, 0);
});

test('legenda automática: o silêncio é medido pelo fim estimado da fala, não pelo fim folgado da legenda', () => {
  // Caso do usuário (23/11/2026): "...a mystery. However ..." com 0,7 s de pausa real. Antes, o fim de
  // "mystery" vinha da legenda (0,88 s depois do início), o silêncio dava quase 0 e a folga ficava na
  // mínima, qualquer que fosse a máxima: o começo de "However" era comido.
  const ev = [];
  let t = 0;
  for (const x of 'and to this day the case remains a mystery 0.7 however no one has ever found the answer'.split(' ')) {
    if (/^\d/.test(x)) { t += Number(x); continue; }
    ev.push([x, Math.round(t * 1000) / 1000]);
    t += 0.12 + 0.05 * x.length; // duração real de cada palavra
  }
  const json3 = JSON.stringify({ wireMagic: 'pb3', events: [{ tStartMs: 0, dDurationMs: Math.round(t * 1000) + 500, wWinId: 1,
    segs: ev.map(([w, s], k) => (k ? { utf8: ` ${w}`, tOffsetMs: Math.round(s * 1000) } : { utf8: w })) }] });
  const r = processar({ estudo: { falas: lerTimedText(json3).falas, arquivo: '[English (auto-generated)] x', idioma: 'en' } }, {});
  const i = r.unidades.findIndex((u) => /^However/.test(u.texto));
  assert.equal(i, 1, r.unidades.map((u) => u.texto).join(' | '));
  const [mystery] = ev.filter(([w]) => w === 'mystery');
  const fimReal = mystery[1] + 0.12 + 0.05 * 7;
  const ant = r.unidades[0];
  assert.ok(ant.fimFala >= fimReal, `fim estimado ${ant.fimFala} antes do fim real ${fimReal}`);
  assert.ok(ant.fimFala < ant.e, 'mais justo que o fim da legenda');
  const u = r.unidades[i];
  for (const max of FOLGAS_MAX) quase(tempoDestinoFolga(r.unidades, i, { max, min: FOLGA_MIN_FRASES }), Math.round((u.s - max) * 1000) / 1000);
});

test('sem o tempo de cada palavra não há fimFala (usa o fim da legenda)', () => {
  const ler = (nome) => {
    const b = readFileSync(new URL(`./fixtures/${nome}`, import.meta.url));
    return lerArquivoLegenda(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  };
  for (const nome of ['auto_downsub.srt', 'normal.srt']) {
    const r = processar({ estudo: { falas: ler(nome).falas } }, { modoFrases: 'auto' });
    assert.ok(r.unidades.every((u) => u.fimFala === undefined), nome);
  }
});

test('ajuste folgaFala (P01): opções 0,18 / 0,3 / 0,45, padrão 0,3, só valores da lista', () => {
  assert.deepEqual(FOLGAS_MAX, [0.18, 0.3, 0.45]);
  assert.equal(FOLGA_MAX_PADRAO, 0.3);
  assert.equal(AJUSTES_PADRAO.folgaFala, FOLGA_MAX_PADRAO);
  assert.equal(misturarAjustes({ versao: 4, folgaFala: 0.18 }).folgaFala, 0.18);
  assert.equal(misturarAjustes({ versao: 4, folgaFala: 0.45 }).folgaFala, 0.45);
  assert.equal(misturarAjustes({ versao: 4, folgaFala: 0.8 }).folgaFala, 0.3);
  assert.equal(misturarAjustes({ versao: 4, folgaFala: 5 }).folgaFala, 0.3);
  assert.equal(misturarAjustes({ versao: 4 }).folgaFala, 0.3);
});

test('migração P01: a folga salva antes da versão 4 volta uma vez ao padrão 0,3', () => {
  for (const v of [0.3, 0.45, 0.6, 0.8]) assert.equal(misturarAjustes({ versao: 3, folgaFala: v }).folgaFala, 0.3);
  // os outros ajustes da versão 3 continuam
  assert.equal(misturarAjustes({ versao: 3, folgaFala: 0.45, velocidade: 1.25 }).velocidade, 1.25);
});

test('a menor opção da folga vale também nas frases da legenda automática', () => {
  const un = [{ s: 2, e: 4 }, { s: 10, e: 12 }];
  quase(tempoDestinoFolga(un, 1, { max: Math.min(...FOLGAS_MAX), min: FOLGA_MIN_FRASES }), 10 - Math.min(...FOLGAS_MAX));
});
