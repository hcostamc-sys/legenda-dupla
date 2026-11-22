import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerTimedText } from '../js/timedtext.js';
import { processar, legendaPontuada, temTempoDePalavra, palavrasComTempo, aplicarAjuste } from '../js/legendas.js';

/**
 * Monta um json3 de legenda automática: cada evento é uma lista de [palavra, segundos].
 * Como no YouTube: tStartMs do evento = 1ª palavra; tOffsetMs nas seguintes; duração até o próximo evento.
 */
function json3(eventos) {
  const events = [];
  eventos.forEach((ev, i) => {
    const t0 = Math.round(ev[0][1] * 1000);
    const ultima = Math.round(ev[ev.length - 1][1] * 1000);
    const prox = eventos[i + 1] ? Math.round(eventos[i + 1][0][1] * 1000) : ultima + 1000;
    events.push({
      tStartMs: t0,
      dDurationMs: prox - t0 + 1500, // janelas sobrepostas, como na automática
      wWinId: 1,
      segs: ev.map(([w, s], k) => (k === 0 ? { utf8: w, acAsrConf: 0 } : { utf8: ` ${w}`, tOffsetMs: Math.round(s * 1000) - t0, acAsrConf: 0 })),
    });
  });
  return JSON.stringify({ wireMagic: 'pb3', events });
}

/** Fala contínua: cada palavra dura 0,12 s + 0,05 s por letra; um número entre as palavras = pausa extra (segundos). */
function fala(texto, inicio = 0) {
  const ev = [];
  let t = inicio;
  for (const x of texto.split(' ')) {
    if (/^\d+(\.\d+)?$/.test(x)) { t += Number(x); continue; }
    ev.push([x, Math.round(t * 1000) / 1000]);
    t += 0.12 + 0.05 * x.length;
  }
  return ev;
}

function textoFinal(eventos, idioma = 'en') {
  const r = lerTimedText(json3(eventos));
  const out = processar({ estudo: { falas: r.falas, arquivo: '[English (auto-generated)] teste', idioma } }, {});
  return { texto: out.unidades.map((u) => u.texto).join(' '), unidades: out.unidades, falas: r.falas };
}

test('pausa longa vira ponto e a frase seguinte começa com maiúscula', () => {
  const ev = fala('so today we are going to talk about music 1.0 it is a really big topic');
  const { texto } = textoFinal([ev.slice(0, 5), ev.slice(5, 9), ev.slice(9)]);
  assert.equal(texto, 'So today we are going to talk about music. It is a really big topic.');
});

test('pausa média vira vírgula; hesitação antes de artigo não', () => {
  const ev = fala('okay 0.4 so I went to 0.5 the store and 0.45 then I came back home');
  const { texto } = textoFinal([ev]);
  assert.equal(texto, 'Okay, so I went to the store and then I came back home.');
});

test('perguntas em inglês ganham interrogação; "i" vira "I"', () => {
  const ev = fala("do you know what i mean 1.0 i'm not sure 1.0 so what is the answer 1.0 what i mean is this");
  const { texto } = textoFinal([ev]);
  assert.equal(texto, "Do you know what I mean? I'm not sure. So what is the answer? What I mean is this.");
});

test('troca de quem fala (>>) e marcação de som fecham a frase', () => {
  const ev = fala('i love this song >> me too');
  const musica = [['[Music]', 6]];
  const depois = fala('welcome back everyone', 8);
  const { unidades } = textoFinal([ev, musica, depois]);
  assert.deepEqual(unidades.map((u) => u.texto), ['I love this song.', 'Me too.', '[Music]', 'Welcome back everyone.']);
});

test('frase não termina em artigo ou preposição, mesmo com pausa longa', () => {
  const ev = fala('we went to the 1.5 beach yesterday');
  const { texto } = textoFinal([ev]);
  assert.equal(texto, 'We went to the beach yesterday.');
});

test('sincronia: cada legenda começa na 1ª palavra falada (tempo real, não proporcional)', () => {
  // evento longo: 4 palavras rápidas e, depois de uma pausa, a frase seguinte no mesmo evento
  const ev = fala('hello there my friend 2.0 how are you doing today', 10);
  const { unidades } = textoFinal([ev]);
  assert.equal(unidades.length, 2);
  assert.equal(unidades[0].s, 10);
  assert.equal(unidades[1].texto, 'How are you doing today?');
  // 10 + (0,12 × 4 + 0,05 × 18 letras) + 2,0 = 13,38
  assert.equal(unidades[1].s, 13.38);
  assert.ok(unidades[0].e <= 12, `fim da 1ª legenda logo depois da última palavra (${unidades[0].e})`);
});

test('legenda já pontuada (feita por pessoa ou automática nova) não é mexida', () => {
  const ev = fala('this is fine. 1.0 really fine.');
  const r = lerTimedText(json3([ev]));
  assert.ok(legendaPontuada(r.falas));
  const out = processar({ estudo: { falas: r.falas, arquivo: '[English (auto-generated)] x', idioma: 'en' } }, {});
  assert.equal(out.unidades.map((u) => u.texto).join(' '), 'this is fine. really fine.');
});

test('sem tempo por palavra (arquivo .srt do DownSub): continua como antes, sem pontuar', () => {
  const falas = [{ s: 0, e: 2, t: 'so today we are' }, { s: 2, e: 4, t: 'going to talk' }];
  assert.ok(!temTempoDePalavra(falas));
  const out = processar({ estudo: { falas, arquivo: '[English (auto-generated)] x' } }, {});
  assert.equal(out.unidades.map((u) => u.texto).join(' '), 'so today we are going to talk');
});

test('ajuste de sincronia move também o tempo de cada palavra', () => {
  const r = lerTimedText(json3([fala('one two three', 5)]));
  const [f] = aplicarAjuste(r.falas, 1.5);
  assert.deepEqual(palavrasComTempo(f).map((p) => p.s), [6.5, 6.77, 7.04]);
});

test('outros idiomas: pontos, vírgulas e maiúsculas (sem regras de pergunta)', () => {
  const ev = fala('bonjour à tous 1.0 aujourd’hui on parle de musique');
  const r = lerTimedText(json3([ev]));
  const out = processar({ estudo: { falas: r.falas, arquivo: '[French (auto-generated)] x', idioma: 'fr' } }, {});
  assert.equal(out.unidades.map((u) => u.texto).join(' '), 'Bonjour à tous. Aujourd’hui on parle de musique.');
});
