import { test } from 'node:test';
import assert from 'node:assert/strict';
import { montarSp, urlBusca, misturarFiltros } from '../js/busca.js';

test('sp: valores conhecidos do YouTube', () => {
  assert.equal(montarSp({}), 'EgIQAQ=='); // só vídeos
  assert.equal(montarSp({ ordem: 2 }), 'CAISAhAB'); // data de envio + vídeos
  assert.equal(montarSp({ legendas: true }), 'EgQQASgB'); // vídeos com legendas
  assert.equal(montarSp({ data: 3, duracao: 2, ordem: 3, legendas: true }), 'CAMSCAgDEAEYAigB');
});

test('urlBusca: termo codificado; vazio abre a página inicial', () => {
  assert.equal(urlBusca('ação & café', { legendas: true }), 'https://m.youtube.com/results?search_query=a%C3%A7%C3%A3o%20%26%20caf%C3%A9&sp=EgQQASgB');
  assert.equal(urlBusca('  '), 'https://m.youtube.com/');
});

test('misturarFiltros descarta valores inválidos', () => {
  assert.deepEqual(misturarFiltros({ data: 9, duracao: 3, ordem: '2', legendas: 'sim' }), { data: 0, duracao: 3, ordem: 0, legendas: false });
});
