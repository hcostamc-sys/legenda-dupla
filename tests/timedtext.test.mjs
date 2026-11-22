import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerTimedText, paraSrt, infoUrl, faixaSugerida } from '../js/timedtext.js';

const semPs = (falas) => falas.map(({ s, e, t }) => ({ s, e, t }));

test('json3: junta os pedaços de cada evento e ignora eventos sem texto', () => {
  const json = JSON.stringify({
    events: [
      { tStartMs: 0, dDurationMs: 5000, id: 1 },
      { tStartMs: 1200, dDurationMs: 2300, segs: [{ utf8: 'Hello' }, { utf8: ' world', tOffsetMs: 400 }] },
      { tStartMs: 3500, dDurationMs: 10, aAppend: 1, segs: [{ utf8: '\n' }] },
      { tStartMs: 4000, dDurationMs: 1500, segs: [{ utf8: 'ação' }] },
    ],
  });
  const r = lerTimedText(json);
  assert.equal(r.formato, 'json3');
  assert.deepEqual(semPs(r.falas), [{ s: 1.2, e: 3.5, t: 'Hello world' }, { s: 4, e: 5.5, t: 'ação' }]);
  // tempo real de cada palavra (a última vai no máximo até a duração normal de uma palavra)
  assert.deepEqual(r.falas[0].ps, [{ w: 'Hello', s: 1.2, e: 1.6 }, { w: 'world', s: 1.6, e: 2.3 }]);
  assert.equal(r.falas[1].ps, undefined); // um pedaço só: sem tempo por palavra
});

test('srv3: <p t= d=> com <s> e entidades', () => {
  const xml = '<?xml version="1.0" encoding="utf-8" ?><timedtext format="3"><body>'
    + '<p t="1000" d="2000"><s>It&#39;s</s><s t="300"> fine</s></p>'
    + '<p t="3500" d="1000">A &amp; B<br/>C</p><p t="5000" d="10"></p></body></timedtext>';
  const r = lerTimedText(xml);
  assert.equal(r.formato, 'srv3');
  assert.deepEqual(semPs(r.falas), [{ s: 1, e: 3, t: "It's fine" }, { s: 3.5, e: 4.5, t: 'A & B C' }]);
  assert.deepEqual(r.falas[0].ps, [{ w: "It's", s: 1, e: 1.3 }, { w: 'fine', s: 1.3, e: 1.91 }]);
});

test('formato 1: <text start= dur=> com entidades escapadas duas vezes', () => {
  const xml = '<?xml version="1.0" encoding="utf-8" ?><transcript>'
    + '<text start="0.5" dur="1.5">don&amp;#39;t stop</text><text start="2" dur="1">não</text></transcript>';
  const r = lerTimedText(xml);
  assert.equal(r.formato, 'xml');
  assert.deepEqual(r.falas, [{ s: 0.5, e: 2, t: "don't stop" }, { s: 2, e: 3, t: 'não' }]);
});

test('vtt usa o leitor de legendas do app', () => {
  const r = lerTimedText('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nOlá\n');
  assert.equal(r.formato, 'vtt');
  assert.equal(r.falas.length, 1);
});

test('resposta vazia (sem token) vira erro claro', () => {
  assert.match(lerTimedText('').erro, /vazia/);
  assert.ok(lerTimedText('lixo').erro);
});

test('paraSrt e infoUrl', () => {
  assert.equal(paraSrt([{ s: 1.2, e: 3.5, t: 'Oi' }]), '1\n00:00:01,200 --> 00:00:03,500\nOi\n');
  const i = infoUrl('https://www.youtube.com/api/timedtext?v=abc&lang=en&kind=asr&tlang=pt&fmt=json3&pot=XYZ');
  assert.deepEqual(i, { video: 'abc', idioma: 'en', traducao: 'pt', formato: 'json3', automatica: true, token: true });
  assert.equal(infoUrl('/api/timedtext?v=abc&lang=fr').token, false);
});

test('json3 da legenda automática: janelas sobrepostas viram falas em sequência', () => {
  const json = JSON.stringify({
    events: [
      { tStartMs: 0, dDurationMs: 4000, segs: [{ utf8: 'so today' }, { utf8: ' we talk', tOffsetMs: 600 }] },
      { tStartMs: 2000, dDurationMs: 10, aAppend: 1, segs: [{ utf8: '\n' }] },
      { tStartMs: 2010, dDurationMs: 4000, segs: [{ utf8: 'about' }, { utf8: ' creativity', tOffsetMs: 500 }] },
    ],
  });
  const r = lerTimedText(json);
  assert.deepEqual(semPs(r.falas), [{ s: 0, e: 2.01, t: 'so today we talk' }, { s: 2.01, e: 6.01, t: 'about creativity' }]);
  // pedaço com duas palavras: o tempo é dividido pelo tamanho
  assert.deepEqual(r.falas[0].ps.map((p) => p.w), ['so', 'today', 'we', 'talk']);
  assert.ok(r.falas[0].ps.every((p, i, l) => p.s <= p.e && (i === 0 || l[i - 1].s <= p.s)));
});

test('faixaSugerida: idioma da legenda automática, preferindo a feita por pessoa', () => {
  const f = [
    { languageCode: 'pt-BR', kind: '' },
    { languageCode: 'fr', kind: 'asr' },
    { languageCode: 'fr-CA', kind: '' },
    { languageCode: 'en', kind: '' },
  ];
  assert.equal(faixaSugerida(f), 2);
  assert.equal(faixaSugerida([{ languageCode: 'en', kind: 'asr' }]), 0);
  // sem automática: idioma dos ajustes, depois inglês, depois a primeira
  const g = [{ languageCode: 'af' }, { languageCode: 'en' }, { languageCode: 'fr' }];
  assert.equal(faixaSugerida(g, 'fr'), 2);
  assert.equal(faixaSugerida(g), 1);
  assert.equal(faixaSugerida([{ languageCode: 'de' }]), 0);
  assert.equal(faixaSugerida([]), -1);
});

test('legenda enviada pelo autor: códigos <i>…</i>, <b>, <font> e {\\an8} não aparecem como texto', () => {
  const json = JSON.stringify({
    events: [
      { tStartMs: 1000, dDurationMs: 1500, segs: [{ utf8: 'ALPHA: <i>Hello.</i>' }] },
      { tStartMs: 3000, dDurationMs: 2000, segs: [{ utf8: 'LOVE: Can you help me write code?' }] },
      { tStartMs: 5000, dDurationMs: 2000, segs: [{ utf8: 'ALPHA: <i>I was trained</i>\n<i>to answer questions,</i>' }] },
      { tStartMs: 7000, dDurationMs: 1000, segs: [{ utf8: '<font color="#ffff00">{\\an8}<b>Yes</b></font>' }] },
      { tStartMs: 8000, dDurationMs: 1000, segs: [{ utf8: '<i></i>' }] },
    ],
  });
  const r = lerTimedText(json);
  assert.deepEqual(r.falas.map((f) => f.t), [
    'ALPHA: Hello.', 'LOVE: Can you help me write code?', 'ALPHA: I was trained to answer questions,', 'Yes',
  ]);
  // srv3 com o código escapado (&lt;i&gt;)
  const xml = '<timedtext format="3"><body><p t="0" d="900">&lt;i&gt;Hi there&lt;/i&gt;</p></body></timedtext>';
  assert.deepEqual(lerTimedText(xml).falas.map((f) => f.t), ['Hi there']);
});
