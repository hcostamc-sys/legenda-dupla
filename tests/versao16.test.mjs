// Testes da versão 16: idioma do YouTube (hl) e retomada no ponto salvo sem passar por 00:00.
import test from 'node:test';
import assert from 'node:assert/strict';
import { idiomaYoutube, PlayerYouTube } from '../js/player.js';

test('idiomaYoutube: códigos da lista do YouTube', () => {
  const casos = {
    'pt-BR': 'pt', pt: 'pt', 'pt-PT': 'pt-PT', 'pt_BR': 'pt',
    'en-US': 'en', 'en-GB': 'en-GB', 'en-IN': 'en-IN', en: 'en',
    'es-ES': 'es', es: 'es', 'es-MX': 'es-419', 'es-419': 'es-419', 'es-US': 'es-US',
    'fr-FR': 'fr', 'fr-CA': 'fr-CA',
    'zh-CN': 'zh-CN', 'zh-TW': 'zh-TW', 'zh-HK': 'zh-HK', 'zh-Hant-TW': 'zh-TW', 'zh-Hans-CN': 'zh-CN', zh: 'zh-CN',
    'he-IL': 'iw', iw: 'iw', 'in-ID': 'id', 'nb-NO': 'no', 'tl-PH': 'fil', 'sr-Latn-RS': 'sr-Latn', 'sr-RS': 'sr',
    'de-DE': 'de', 'ja-JP': 'ja', 'ko-KR': 'ko', 'it-IT': 'it', 'ru-RU': 'ru', '': 'en', undefined: 'en',
  };
  for (const [tag, esperado] of Object.entries(casos)) {
    assert.equal(idiomaYoutube(tag === 'undefined' ? undefined : tag), esperado, tag);
  }
});

/** Player com o YouTube de mentira: getCurrentTime devolve o valor de "t". */
function playerFalso(inicio) {
  const classes = new Set(['yt-oculto']);
  const p = new PlayerYouTube({ appendChild() {}, querySelector() { return null; } });
  const estado = { t: undefined };
  p.yt = { getCurrentTime: () => estado.t };
  p.iframe = { classList: { remove: (c) => classes.delete(c), add: (c) => classes.add(c) } };
  p._oculto = true;
  p._base = inicio;
  p._aguardaInicio = { alvo: inicio, desde: 0 };
  return { p, estado, oculto: () => classes.has('yt-oculto') };
}

test('ponto salvo: o 0 s que chega depois do ponto salvo não aparece (gravação de 23/11/2026)', () => {
  const { p, estado, oculto } = playerFalso(593);
  // antes de tocar: o player já informa o ponto salvo...
  p._estado = 5;
  estado.t = 593;
  assert.ok(Math.abs(p.tempo() - 593) < 0.01);
  // ...e depois ainda manda 0 s (carregando): antes a barra ia para 00:00
  p._estado = 3;
  estado.t = 0;
  assert.equal(p.tempo(), 593);
  assert.ok(oculto(), 'a imagem continua escondida');
  // tocando, chega no ponto salvo e anda: aí sim acaba a espera e a imagem aparece
  p._estado = 1;
  estado.t = 593.02;
  assert.ok(Math.abs(p.tempo() - 593.02) < 0.6);
  assert.ok(oculto(), 'uma leitura só não basta');
  estado.t = 593.3;
  p.tempo();
  assert.equal(p._aguardaInicio, null);
  assert.ok(!oculto(), 'a imagem aparece com o vídeo andando no ponto certo');
});

test('ponto salvo: tocando em 0 s, vale o ponto salvo; depois de 4 s tocando, vale o player', async () => {
  const { p, estado, oculto } = playerFalso(120);
  p._estado = 1;
  estado.t = 0.2;
  assert.ok(Math.abs(p.tempo() - 120) < 0.01);
  p._aguardaInicio.desde = performance.now() - 4100; // o YouTube ignorou o start
  estado.t = 4.3;
  assert.ok(p.tempo() < 10);
  assert.equal(p._aguardaInicio, null);
  assert.ok(!oculto());
});

test('irPara mostra a imagem e encerra a espera', () => {
  const { p, oculto } = playerFalso(300);
  p.yt.seekTo = () => {};
  p.irPara(10);
  assert.equal(p._aguardaInicio, null);
  assert.ok(!oculto());
});
