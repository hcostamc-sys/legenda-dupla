// Testes da parte pura de js/voz.js (voz mais clara): relógio do vídeo, sincronia do áudio tratado e textos.
// Uso: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  tempoDoRelogio, decidirSincronia, textoMinutos, descreverVideo, MARGENS, MARGEM_PADRAO,
  ZONA_MORTA, PULO, CORRECAO_MAX,
} from '../js/voz.js';

test('relógio: tocando, anda com a velocidade; parado ou esperando, fica', () => {
  const r = { t: 10, at: 1000, taxa: 1, pausado: false, esperando: false };
  assert.equal(tempoDoRelogio(r, 1000), 10);
  assert.ok(Math.abs(tempoDoRelogio(r, 1250) - 10.25) < 1e-9);
  assert.ok(Math.abs(tempoDoRelogio({ ...r, taxa: 0.75 }, 1200) - 10.15) < 1e-9);
  // previsão limitada a 0,5 s (relógio velho não empurra o áudio para longe)
  assert.ok(Math.abs(tempoDoRelogio(r, 5000) - 10.5) < 1e-9);
  assert.equal(tempoDoRelogio({ ...r, pausado: true }, 3000), 10);
  assert.equal(tempoDoRelogio({ ...r, esperando: true }, 3000), 10);
  assert.equal(tempoDoRelogio(null, 3000), null);
});

test('sincronia: vídeo parado pausa o áudio', () => {
  const d = decidirSincronia({ tAudio: 5, tVideo: 5, taxa: 1, deveTocar: false, audioPausado: false, audioBuscando: false });
  assert.equal(d.pausar, true);
  assert.equal(d.tocar, false);
  assert.equal(d.irPara, null);
  const d2 = decidirSincronia({ tAudio: 5, tVideo: 5, taxa: 1, deveTocar: false, audioPausado: true, audioBuscando: false });
  assert.equal(d2.pausar, false);
});

test('sincronia: diferença pequena não mexe', () => {
  const d = decidirSincronia({ tAudio: 5.02, tVideo: 5, taxa: 1.25, deveTocar: true, audioPausado: false, audioBuscando: false });
  assert.equal(d.irPara, null);
  assert.equal(d.taxa, 1.25);
  assert.equal(d.tocar, false);
});

test('sincronia: diferença média corrige pela velocidade, no sentido certo e com limite', () => {
  const atrasado = decidirSincronia({ tAudio: 4.9, tVideo: 5, taxa: 1, deveTocar: true, audioPausado: false, audioBuscando: false });
  assert.equal(atrasado.irPara, null);
  assert.ok(atrasado.taxa > 1 && atrasado.taxa <= 1 + CORRECAO_MAX + 1e-9, `taxa ${atrasado.taxa}`);
  const adiantado = decidirSincronia({ tAudio: 5.1, tVideo: 5, taxa: 0.8, deveTocar: true, audioPausado: false, audioBuscando: false });
  assert.ok(adiantado.taxa < 0.8 && adiantado.taxa >= 0.8 * (1 - CORRECAO_MAX) - 1e-9, `taxa ${adiantado.taxa}`);
  // logo acima da zona morta, correção pequena
  const leve = decidirSincronia({ tAudio: 5 - ZONA_MORTA - 0.005, tVideo: 5, taxa: 1, deveTocar: true, audioPausado: false, audioBuscando: false });
  assert.ok(leve.taxa > 1 && leve.taxa < 1.05);
});

test('sincronia: diferença grande pula; áudio parado volta no ponto certo', () => {
  const longe = decidirSincronia({ tAudio: 2, tVideo: 5, taxa: 1, deveTocar: true, audioPausado: false, audioBuscando: false });
  assert.equal(longe.irPara, 5);
  const justo = decidirSincronia({ tAudio: 5 + PULO + 0.01, tVideo: 5, taxa: 1, deveTocar: true, audioPausado: false, audioBuscando: false });
  assert.equal(justo.irPara, 5);
  const parado = decidirSincronia({ tAudio: 4.9, tVideo: 5, taxa: 1, deveTocar: true, audioPausado: true, audioBuscando: false });
  assert.equal(parado.irPara, 5);
  assert.equal(parado.tocar, true);
  const paradoPerto = decidirSincronia({ tAudio: 4.99, tVideo: 5, taxa: 1, deveTocar: true, audioPausado: true, audioBuscando: false });
  assert.equal(paradoPerto.irPara, null);
  assert.equal(paradoPerto.tocar, true);
  // nunca antes do começo
  assert.equal(decidirSincronia({ tAudio: 3, tVideo: -0.2, taxa: 1, deveTocar: true, audioPausado: false, audioBuscando: false }).irPara, 0);
});

test('sincronia: enquanto o áudio busca o ponto, não pede outro pulo', () => {
  const d = decidirSincronia({ tAudio: 1, tVideo: 9, taxa: 1, deveTocar: true, audioPausado: false, audioBuscando: true });
  assert.equal(d.irPara, null);
});

test('sincronia: o laço alcança o vídeo (simulação de 10 s a 60 quadros por segundo)', () => {
  let tAudio = 0;
  let tVideo = 0.12; // começa 120 ms atrasado (dentro do limite de pulo)
  let taxa = 1;
  for (let q = 0; q < 600; q++) {
    const d = decidirSincronia({ tAudio, tVideo, taxa: 1, deveTocar: true, audioPausado: false, audioBuscando: false });
    if (d.irPara !== null) tAudio = d.irPara;
    taxa = d.taxa;
    tAudio += taxa / 60;
    tVideo += 1 / 60;
  }
  assert.ok(Math.abs(tAudio - tVideo) <= ZONA_MORTA + 0.005, `diferença final ${tAudio - tVideo}`);
});

test('textos de tempo', () => {
  assert.equal(textoMinutos(30), 'menos de 1 min');
  assert.equal(textoMinutos(600), 'cerca de 10 min');
  assert.equal(textoMinutos(3900), 'cerca de 1 h 05');
  assert.equal(textoMinutos(7200), 'cerca de 2 h');
  assert.equal(textoMinutos(-1), '');
});

test('descrição do estado de um vídeo', () => {
  assert.equal(descreverVideo(null).estado, 'nada');
  assert.equal(descreverVideo({ estado: 'pronto' }).selo, 'Voz clara');
  const sep = descreverVideo({ estado: 'separando', progresso: 0.456, restante: 600 });
  assert.equal(sep.estado, 'trabalhando');
  assert.equal(sep.selo, 'Tratando 45%');
  assert.match(sep.texto, /faltam cerca de 10 min/);
  assert.match(descreverVideo({ estado: 'fila' }, { modelo: { estado: 'baixando' } }).texto, /modelo/);
  assert.equal(descreverVideo({ estado: 'erro', erro: 'Sem internet.' }).texto, 'Sem internet.');
  assert.ok(MARGENS.some((m) => m.db === MARGEM_PADRAO));
});
