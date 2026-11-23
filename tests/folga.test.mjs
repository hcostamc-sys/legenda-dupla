// Folga antes da fala (versão 20): ao avançar, retroceder ou repetir, o destino fica no silêncio
// antes da fala, com margem depois do fim da fala anterior, entre a folga mínima e a máxima.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  tempoDestinoFolga, navegar, processar, lerArquivoLegenda, FOLGA_MARGEM, FOLGA_MIN, FOLGA_MIN_FRASES, FOLGAS_MAX, FOLGA_MAX_PADRAO,
} from '../js/legendas.js';
import { lerTimedText } from '../js/timedtext.js';
import { misturarAjustes, AJUSTES_PADRAO } from '../js/armazenamento.js';

const quase = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test('silêncio curto: logo depois do fim da fala anterior (margem de 0,08 s)', () => {
  // fala anterior termina em 9,7; a de destino começa em 10 → silêncio 0,3 → folga 0,22
  const un = [{ s: 8, e: 9.7 }, { s: 10, e: 12 }];
  quase(tempoDestinoFolga(un, 1), 9.7 + FOLGA_MARGEM);
});

test('silêncio longo: só a folga máxima antes da fala', () => {
  const un = [{ s: 2, e: 4 }, { s: 10, e: 12 }];
  quase(tempoDestinoFolga(un, 1), 10 - FOLGA_MAX_PADRAO);
  quase(tempoDestinoFolga(un, 1, { max: 0.8 }), 9.2);
  quase(tempoDestinoFolga(un, 1, { max: 0.3 }), 9.7);
});

test('silêncio quase nulo ou fala sobreposta: folga mínima', () => {
  quase(tempoDestinoFolga([{ s: 8, e: 9.95 }, { s: 10, e: 12 }], 1), 10 - FOLGA_MIN);
  quase(tempoDestinoFolga([{ s: 8, e: 10.4 }, { s: 10, e: 12 }], 1), 10 - FOLGA_MIN); // legenda feita por pessoa, encostada
});

test('frases montadas (legenda automática): folga mínima maior', () => {
  const un = [{ s: 8, e: 10 }, { s: 10, e: 12 }];
  quase(tempoDestinoFolga(un, 1, { min: FOLGA_MIN_FRASES }), 10 - FOLGA_MIN_FRASES);
  // a máxima nunca fica abaixo da mínima
  quase(tempoDestinoFolga([{ s: 2, e: 4 }, { s: 10, e: 12 }], 1, { min: 0.3, max: 0.1 }), 9.7);
});

test('primeira fala: silêncio desde o começo do vídeo, nunca abaixo de 0', () => {
  quase(tempoDestinoFolga([{ s: 5, e: 6 }], 0), 5 - FOLGA_MAX_PADRAO);
  quase(tempoDestinoFolga([{ s: 0.3, e: 1 }], 0), 0.3 - (0.3 - FOLGA_MARGEM));
  assert.equal(tempoDestinoFolga([{ s: 0.05, e: 1 }], 0), 0);
  assert.equal(tempoDestinoFolga([], 0), 0);
});

test('o destino nunca cai dentro da fala anterior quando há silêncio maior que margem + mínima', () => {
  for (let sil = FOLGA_MARGEM + FOLGA_MIN; sil < 3; sil += 0.01) {
    const un = [{ s: 0, e: 5 }, { s: 5 + sil, e: 9 }];
    for (const max of FOLGAS_MAX) {
      const d = tempoDestinoFolga(un, 1, { max });
      assert.ok(d >= 5 + FOLGA_MARGEM - 1e-9, `silêncio ${sil}, máx ${max}: destino ${d}`);
      assert.ok(d <= un[1].s - FOLGA_MIN + 1e-9);
      assert.ok(un[1].s - d <= max + 1e-9);
    }
  }
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
  for (const max of FOLGAS_MAX) {
    const d = tempoDestinoFolga(r.unidades, i, { max, min: FOLGA_MIN_FRASES });
    assert.ok(d >= fimReal, `máx ${max}: destino ${d} dentro de "mystery"`);
    assert.ok(u.s - d >= Math.min(max, 0.4) - 1e-9, `máx ${max}: folga ${u.s - d} curta demais`);
  }
  // a máxima escolhida faz diferença quando há silêncio
  assert.ok(tempoDestinoFolga(r.unidades, i, { max: 0.6, min: FOLGA_MIN_FRASES }) < tempoDestinoFolga(r.unidades, i, { max: 0.3, min: FOLGA_MIN_FRASES }));
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

test('ajuste folgaFala: padrão 0,45 s, só valores da lista', () => {
  assert.equal(AJUSTES_PADRAO.folgaFala, FOLGA_MAX_PADRAO);
  assert.equal(misturarAjustes({ versao: 3, folgaFala: 0.8 }).folgaFala, 0.8);
  assert.equal(misturarAjustes({ versao: 3, folgaFala: 5 }).folgaFala, 0.45);
  assert.equal(misturarAjustes({ versao: 3 }).folgaFala, 0.45);
});
