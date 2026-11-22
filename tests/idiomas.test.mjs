import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IDIOMAS_TRADUCAO, codigoTradutor, mesmoIdioma, idiomaDoSistema, nomeIdioma, listaIdiomas, urlDicionario,
} from '../js/idiomas.js';
import { faixaSugerida } from '../js/timedtext.js';
import { lerSignificado } from '../js/traducao.js';
import { misturarAjustes } from '../js/armazenamento.js';

test('lista de idiomas da tradução: mais de 130, sem repetir', () => {
  assert.ok(IDIOMAS_TRADUCAO.length > 130);
  assert.equal(new Set(IDIOMAS_TRADUCAO).size, IDIOMAS_TRADUCAO.length);
  for (const c of ['pt', 'en', 'es', 'ja', 'zh-CN', 'zh-TW', 'iw', 'ko', 'ar', 'hi']) assert.ok(IDIOMAS_TRADUCAO.includes(c), c);
});

test('codigoTradutor: códigos do celular e do YouTube viram códigos do tradutor', () => {
  assert.equal(codigoTradutor('pt-BR'), 'pt');
  assert.equal(codigoTradutor('pt-PT'), 'pt-PT');
  assert.equal(codigoTradutor('en-US'), 'en');
  assert.equal(codigoTradutor('zh-Hant-TW'), 'zh-TW');
  assert.equal(codigoTradutor('zh-Hans'), 'zh-CN');
  assert.equal(codigoTradutor('zh'), 'zh-CN');
  assert.equal(codigoTradutor('he-IL'), 'iw');
  assert.equal(codigoTradutor('fil'), 'tl');
  assert.equal(codigoTradutor('nb-NO'), 'no');
  assert.equal(codigoTradutor('es-419'), 'es');
  assert.equal(codigoTradutor('xx-YY'), '');
  assert.equal(codigoTradutor(''), '');
});

test('idiomaDoSistema: primeiro idioma conhecido do celular; inglês se nenhum', () => {
  assert.equal(idiomaDoSistema(['pt-BR', 'en-US']), 'pt');
  assert.equal(idiomaDoSistema(['xx', 'de-DE']), 'de');
  assert.equal(idiomaDoSistema(['xx']), 'en');
  assert.equal(idiomaDoSistema(['ja-JP']), 'ja');
});

test('mesmoIdioma ignora a região e os códigos antigos', () => {
  assert.ok(mesmoIdioma('en', 'en-US'));
  assert.ok(mesmoIdioma('pt-BR', 'pt'));
  assert.ok(mesmoIdioma('he', 'iw'));
  assert.ok(!mesmoIdioma('en', 'de'));
  assert.ok(!mesmoIdioma('', 'en'));
});

test('nomes dos idiomas no idioma da interface, com maiúscula', () => {
  assert.equal(nomeIdioma('en', 'pt'), 'Inglês');
  assert.equal(nomeIdioma('de', 'en'), 'German');
  assert.equal(nomeIdioma('iw', 'pt'), 'Hebraico');
  const l = listaIdiomas('pt');
  assert.equal(l.length, IDIOMAS_TRADUCAO.length);
  assert.ok(l.findIndex((x) => x.codigo === 'de') < l.findIndex((x) => x.codigo === 'en'), 'Alemão antes de Inglês');
});

test('dicionário: Cambridge para palavras em inglês, Wikcionário para os outros idiomas', () => {
  assert.equal(urlDicionario('Earliest', 'en', 'pt'), 'https://dictionary.cambridge.org/search/direct/?datasetsearch=english-portuguese&q=earliest');
  assert.equal(urlDicionario('word', 'en-US', 'en'), 'https://dictionary.cambridge.org/search/direct/?datasetsearch=english&q=word');
  assert.equal(urlDicionario('maison', 'fr', 'pt'), 'https://pt.wiktionary.org/wiki/Special:Search?search=maison&go=Go');
  assert.equal(urlDicionario('Haus', 'de', 'zh-TW'), 'https://zh.wiktionary.org/wiki/Special:Search?search=haus&go=Go');
});

test('faixaSugerida: vídeo com dublagem automática escolhe o idioma do áudio original', () => {
  // o caso do print: vídeo em inglês com automática em alemão (dublagem) listada primeiro
  const f = [
    { languageCode: 'de', kind: 'asr' },
    { languageCode: 'en', kind: 'asr' },
    { languageCode: 'pt-BR', kind: '' },
  ];
  assert.equal(faixaSugerida(f), 0); // sem saber o áudio: a primeira automática (comportamento antigo)
  assert.equal(faixaSugerida(f, 'auto', 'en'), 1);
  assert.equal(faixaSugerida(f, 'auto', 'en-US'), 1);
  // a feita por pessoa no idioma do áudio vem antes da automática
  assert.equal(faixaSugerida([...f, { languageCode: 'en', kind: '' }], 'auto', 'en'), 3);
  // áudio num idioma sem legenda: segue a regra antiga
  assert.equal(faixaSugerida(f, 'auto', 'ja'), 0);
});

test('lerSignificado: tradução principal e até 3 sentidos', () => {
  const r = lerSignificado({
    sentences: [{ trans: 'mais cedo', orig: 'earliest' }],
    dict: [{ pos: 'adjetivo', terms: ['primeiro', 'mais antigo'] }, { pos: 'advérbio', terms: [] }],
    src: 'en',
  });
  assert.equal(r.principal, 'mais cedo');
  assert.deepEqual(r.sentidos, [{ classe: 'adjetivo', termos: ['primeiro', 'mais antigo'] }]);
  assert.equal(r.origem, 'en');
  assert.deepEqual(lerSignificado(null), { principal: '', sentidos: [], origem: '' });
});

test('ajustes aceitam qualquer idioma da lista na tradução', () => {
  assert.equal(misturarAjustes({ versao: 3, destino: 'ja' }).destino, 'ja');
  assert.equal(misturarAjustes({ versao: 3, destino: 'zz' }).destino, 'pt');
  assert.equal(misturarAjustes({ versao: 3, destinoManual: true }).destinoManual, true);
  assert.equal(misturarAjustes(null).destinoManual, false);
});
