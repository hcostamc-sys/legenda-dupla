// Testes da legenda dupla, da tradução automática (partes sem rede) e dos ajustes v2.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerLegendaDupla, pontuacaoPortugues, processar, MSG_NAO_DUPLA, detectarIdioma, decidirPapeis, dividirTraducao } from '../js/legendas.js';
import { dividirEmLotes, textosPendentes, aplicarMapa, lerResposta } from '../js/traducao.js';
import { misturarAjustes, AJUSTES_PADRAO } from '../js/armazenamento.js';

const srt = (blocos) => blocos.map(([s, e, linhas], i) => `${i + 1}\n00:00:${String(s).padStart(2, '0')},000 --> 00:00:${String(e).padStart(2, '0')},000\n${linhas.join('\n')}\n`).join('\n');

test('legenda dupla: inglês em cima e português embaixo', () => {
  const r = lerLegendaDupla(srt([
    [1, 3, ['Hello, how are you?', 'Olá, como você está?']],
    [4, 6, ['I am fine, thanks.', 'Estou bem, obrigado.']],
    [7, 9, ['The motor is running.', 'O motor está funcionando.']],
  ]));
  assert.deepEqual(r.estudo.map((f) => f.t), ['Hello, how are you?', 'I am fine, thanks.', 'The motor is running.']);
  assert.deepEqual(r.traducao.map((f) => f.t), ['Olá, como você está?', 'Estou bem, obrigado.', 'O motor está funcionando.']);
  assert.deepEqual(r.estudo.map((f) => [f.s, f.e]), r.traducao.map((f) => [f.s, f.e]));
});

test('legenda dupla: português em cima vira tradução (troca sozinho)', () => {
  const r = lerLegendaDupla(srt([
    [1, 3, ['Olá, como você está?', 'Hello, how are you?']],
    [4, 6, ['Estou bem, obrigado.', 'I am fine, thanks.']],
  ]));
  assert.equal(r.estudo[0].t, 'Hello, how are you?');
  assert.equal(r.traducao[0].t, 'Olá, como você está?');
});

test('legenda dupla: fala com 3 linhas é cortada no ponto certo', () => {
  const r = lerLegendaDupla(srt([
    [1, 2, ['the cat is on the table', 'o gato está na mesa']],
    [3, 4, ['the dog is in the house', 'o cachorro está na casa']],
    [5, 6, ['the car is in the street', 'o carro está na rua']],
    [7, 9, ['the man is on the', 'table in the house', 'o homem está na mesa da casa']],
  ]));
  assert.equal(r.estudo[3].t, 'the man is on the table in the house');
  assert.equal(r.traducao[3].t, 'o homem está na mesa da casa');
});

test('legenda dupla: arquivo de um idioma só dá erro claro', () => {
  const r = lerLegendaDupla(srt([[1, 2, ['Only one line']], [3, 4, ['Another line']]]));
  assert.equal(r.erro, MSG_NAO_DUPLA);
});

test('pontuacaoPortugues separa português de inglês', () => {
  assert.ok(pontuacaoPortugues('Não sei o que fazer com isso.') > pontuacaoPortugues('I do not know what to do with this.'));
});

// ---------------------------------------------------------------- idioma de cada arquivo

const falas = (texto) => texto.split('|').map((t, i) => ({ s: i, e: i + 1, t }));
const EN = falas("so today we are going to talk about the old pump|it was installed many years ago and nobody checked the seals|you should be rewarding them for how much they earn for you|I don't know what to do with this");
const PT = falas('então hoje vamos falar sobre a bomba antiga|ela foi instalada há muitos anos e ninguém verificou as vedações|você deveria recompensá-los pelo quanto eles ganham para você|não sei o que fazer com isso');
const ES = falas('entonces hoy vamos a hablar de la bomba vieja|fue instalada hace muchos años y nadie revisó los sellos|deberías recompensarlos por lo mucho que ganan para ti|no sé qué hacer con esto');
const FR = falas("alors aujourd'hui on va parler de la vieille pompe|elle a été installée il y a des années et personne n'a vérifié|tu devrais les récompenser pour ce qu'ils gagnent|je ne sais pas quoi faire avec ça");

test('detectarIdioma reconhece inglês, português, espanhol e francês', () => {
  assert.equal(detectarIdioma(EN), 'en');
  assert.equal(detectarIdioma(PT), 'pt');
  assert.equal(detectarIdioma(ES), 'es');
  assert.equal(detectarIdioma(FR), 'fr');
  assert.equal(detectarIdioma([]), '');
  assert.equal(detectarIdioma(falas('12345|67890')), '');
});

test('decidirPapeis: a tradução é a do idioma de destino, em qualquer ordem e com qualquer nome', () => {
  assert.equal(decidirPapeis({ falas: PT, arquivo: 'a.srt' }, { falas: EN, arquivo: 'b.srt' }).trocar, true);
  assert.equal(decidirPapeis({ falas: EN, arquivo: 'a.srt' }, { falas: PT, arquivo: 'b.srt' }).trocar, false);
  // o nome do arquivo engana, o conteúdo decide
  assert.equal(decidirPapeis({ falas: EN, arquivo: '[Portuguese] X.srt' }, { falas: PT, arquivo: '[English] X.srt' }).trocar, false);
  // espanhol estudado, português como tradução
  assert.equal(decidirPapeis({ falas: PT }, { falas: ES }).trocar, true);
  // destino inglês (estudando português)
  assert.equal(decidirPapeis({ falas: EN }, { falas: PT }, 'en').trocar, true);
  // mesmo idioma nos dois
  assert.equal(decidirPapeis({ falas: EN }, { falas: EN }).conflito, true);
  // nenhum no idioma de destino: vale o idioma do vídeo informado nos ajustes
  assert.equal(decidirPapeis({ falas: EN }, { falas: FR }, 'pt', 'fr').trocar, true);
});

test('dividirTraducao quebra no ponto proporcional, preferindo pontuação', () => {
  assert.deepEqual(dividirTraducao('Quando abrimos o painel, achamos dois bornes soltos.', [0.45]), ['Quando abrimos o painel,', 'achamos dois bornes soltos.']);
  const poucas = dividirTraducao('um dois', [0.33, 0.66]); // menos palavras que pedaços
  assert.equal(poucas.length, 3);
  assert.equal(poucas.filter(Boolean).join(' '), 'um dois');
  assert.deepEqual(dividirTraducao('', [0.5]), ['', '']);
  assert.deepEqual(dividirTraducao('texto inteiro', []), ['texto inteiro']);
});

test('dividirEmLotes respeita tamanho e quantidade e mantém a ordem', () => {
  const textos = Array.from({ length: 10 }, (_, i) => 'x'.repeat(40) + i);
  const lotes = dividirEmLotes(textos, 100, 3);
  assert.deepEqual(lotes.flat(), textos);
  assert.ok(lotes.every((l) => l.length <= 3 && l.join('').length <= 100 || l.length === 1));
});

test('textosPendentes começa pela fala atual, sem repetir e sem marcações', () => {
  const U = [
    { texto: 'a' }, { texto: '[Music]', marca: true }, { texto: 'b' }, { texto: 'a' }, { texto: 'c' },
  ];
  assert.deepEqual(textosPendentes(U, {}, 2), ['b', 'a', 'c']);
  assert.deepEqual(textosPendentes(U, { b: 'B' }, 0), ['a', 'c']);
});

test('aplicarMapa coloca a tradução exata em cada unidade (sincronia 1 para 1)', () => {
  const { unidades } = processar({ estudo: { falas: [{ s: 1, e: 2, t: 'Hi.' }, { s: 3, e: 4, t: 'Bye.' }] } });
  aplicarMapa(unidades, { 'Hi.': 'Oi.', 'Bye.': 'Tchau.' });
  assert.deepEqual(unidades.map((u) => [u.s, u.e, u.trad]), [[1, 2, 'Oi.'], [3, 4, 'Tchau.']]);
});

test('lerResposta entende os formatos do tradutor', () => {
  assert.deepEqual(lerResposta(['Olá', 'Tchau'], 2), ['Olá', 'Tchau']);
  assert.deepEqual(lerResposta([['Olá', 'en'], ['Tchau', 'en']], 2), ['Olá', 'Tchau']);
  assert.deepEqual(lerResposta(['Olá', 'en'], 1), ['Olá']);
  assert.deepEqual(lerResposta('Olá', 1), ['Olá']);
  assert.deepEqual(lerResposta(null, 2), ['', '']);
});

test('ajustes antigos (v1): letra grande volta ao padrão, idioma é mantido', () => {
  const a = misturarAjustes({ versao: 1, fonteL1: 22, idioma: 'fr', pausaAuto: true, velocidade: 1.25 });
  assert.equal(a.fonteL1, AJUSTES_PADRAO.fonteL1);
  assert.equal(a.idioma, 'fr');
  assert.equal(a.velocidade, 1.25);
  assert.equal('pausaAuto' in a, false);
  assert.equal(misturarAjustes({ versao: 2, fonteL1: 24 }).fonteL1, 24);
});
