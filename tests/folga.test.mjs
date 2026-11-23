// Folga antes da fala (versão 20): ao avançar, retroceder ou repetir, o destino fica no silêncio
// antes da fala, com margem depois do fim da fala anterior, entre a folga mínima e a máxima.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  tempoDestinoFolga, navegar, processar, lerArquivoLegenda, FOLGA_MARGEM, FOLGA_MIN, FOLGA_MIN_ESTIMADA, FOLGAS_MAX, FOLGA_MAX_PADRAO,
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

test('frases com início estimado: folga mínima maior', () => {
  const un = [{ s: 8, e: 10 }, { s: 10, e: 12 }];
  quase(tempoDestinoFolga(un, 1, { min: FOLGA_MIN_ESTIMADA }), 10 - FOLGA_MIN_ESTIMADA);
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

test('processar informa quando o início das frases é estimado', () => {
  const ler = (nome) => {
    const b = readFileSync(new URL(`./fixtures/${nome}`, import.meta.url));
    return lerArquivoLegenda(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  };
  // automática baixada (SRT): frases montadas sem o tempo de cada palavra → início estimado
  const auto = processar({ estudo: { falas: ler('auto_downsub.srt').falas } }, { modoFrases: 'auto' });
  assert.equal(auto.frases, true);
  assert.equal(auto.inicioEstimado, true);
  // feita por pessoa: falas como vieram
  const normal = processar({ estudo: { falas: ler('normal.srt').falas } }, { modoFrases: 'auto' });
  assert.equal(normal.inicioEstimado, false);
  // automática do app Android (json3, tempo de cada palavra) → início real
  const ev = [['so', 0], ['today', 0.3], ['we', 0.6], ['talk', 0.9], ['about', 1.2], ['music', 1.5]];
  const json3 = JSON.stringify({ wireMagic: 'pb3', events: [{ tStartMs: 0, dDurationMs: 3000, wWinId: 1,
    segs: ev.map(([w, s], k) => (k ? { utf8: ` ${w}`, tOffsetMs: s * 1000 } : { utf8: w })) }] });
  const r = processar({ estudo: { falas: lerTimedText(json3).falas, arquivo: '[English (auto-generated)] x', idioma: 'en' } }, {});
  assert.equal(r.frases, true);
  assert.equal(r.inicioEstimado, false);
});

test('ajuste folgaFala: padrão 0,45 s, só valores da lista', () => {
  assert.equal(AJUSTES_PADRAO.folgaFala, FOLGA_MAX_PADRAO);
  assert.equal(misturarAjustes({ versao: 3, folgaFala: 0.8 }).folgaFala, 0.8);
  assert.equal(misturarAjustes({ versao: 3, folgaFala: 5 }).folgaFala, 0.45);
  assert.equal(misturarAjustes({ versao: 3 }).folgaFala, 0.45);
});
