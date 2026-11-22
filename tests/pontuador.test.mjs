// Testes da parte pura da pontuação melhorada (js/pontuador.js). O modelo de verdade é conferido
// no GitHub Actions (tests/pontuacao_ci/); aqui usamos um tokenizador pequeno treinado para teste.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  lerTokenizador, janelas, juntarJanelas, prepararEntrada, aplicarPrevisoes, palavraParaModelo, pacoteDoIdioma,
} from '../js/pontuador.js';

const IDS1 = [63, 77, 4, 26, 5, 31, 11, 30, 49, 9, 21, 67, 5, 43, 53, 33, 29, 10, 6];
const IDS2 = [4, 67, 26, 62, 84, 20, 5, 14, 39, 22, 22, 52, 5, 14, 66, 5];
const IDS3 = [4, 80, 18, 81, 4, 0, 23, 15, 58, 37, 23, 4, 0];
const tok = lerTokenizador(readFileSync(new URL('./fixtures/modelo/falso.spmodel', import.meta.url)));

test('tokenizador igual ao SentencePiece oficial (ids gerados com a biblioteca Python)', () => {
  assert.deepEqual([tok.bos, tok.eos, tok.pad, tok.unk], [1, 2, 3, 0]);
  const esperado = {
    'line one from youtube with words': IDS1,
    'bonjour  je m appelle marie': IDS2,
    'xyz ünknown 😀': IDS3,
  };
  for (const [t, ids] of Object.entries(esperado)) assert.deepEqual(tok.codificar(t), ids, t);
});

test('janelas com sobreposição: juntar devolve uma previsão por peça, na ordem', () => {
  const ids = Array.from({ length: 1000 }, (_, i) => i);
  const js = janelas(ids, 256, 16);
  assert.equal(js[0].ids.length, 254);
  assert.equal(js[1].inicio, 254 - 16);
  // previsão falsa: cada peça "prevê" o próprio id
  const res = js.map((j) => ({ antes: j.ids, depois: j.ids, maiusc: j.ids, fim: j.ids }));
  const junto = juntarJanelas(res, 16);
  assert.deepEqual(junto.antes, ids);
});

test('palavra para o modelo: minúsculas e sem pontuação nas pontas', () => {
  assert.equal(palavraParaModelo('"Hello,'), 'hello');
  assert.equal(palavraParaModelo("don't"), "don't");
  assert.equal(palavraParaModelo('...'), '');
});

test('aplicar previsões mantém o texto original e põe maiúscula, pontuação e fim de frase', () => {
  const palavras = ['hello', 'my', 'name', 'is', 'john'];
  const ent = prepararEntrada(tok, palavras, 'en');
  const n = ent.ids.length;
  const prev = { antes: Array(n).fill(null), depois: Array(n).fill(null), maiusc: Array.from({ length: n }, () => Array(16).fill(false)), fim: Array(n).fill(false) };
  const ultimaDe = (i) => ent.daPalavra.lastIndexOf(i);
  const primeiraDe = (i) => ent.daPalavra.indexOf(i);
  prev.depois[ultimaDe(0)] = ',';
  prev.maiusc[primeiraDe(0)][1] = true; // "▁h..." → H
  prev.maiusc[primeiraDe(4)][1] = true;
  prev.depois[ultimaDe(4)] = '.';
  prev.fim[ultimaDe(4)] = true;
  const r = aplicarPrevisoes(tok, palavras, ent, prev, 'en');
  assert.deepEqual(r.map((x) => x.w), ['Hello,', 'my', 'name', 'is', 'John.']);
  assert.deepEqual(r.map((x) => x.fim), [false, false, false, false, true]);
});

test('pacote certo para cada idioma', () => {
  assert.equal(pacoteDoIdioma('en-US').id, 'en');
  assert.equal(pacoteDoIdioma('fr').id, 'latinas');
  assert.equal(pacoteDoIdioma('pt-BR').id, 'latinas');
  assert.equal(pacoteDoIdioma('de'), null);
});
