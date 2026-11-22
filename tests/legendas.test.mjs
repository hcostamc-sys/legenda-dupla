// Testes de lógica (PLANO.md 12.1). Rodar com: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import {
  lerArquivoLegenda, lerLegenda, decodificar, lerLink, lerTempoLink, sugerirPapeis,
  ehAutomatica, montarFrases, processar, falaNoTempo, navegar, tempoDestino,
  esconderMarcacoes, ehMarcacao, normalizar, limparPalavra, formatarTempo, formatarNumero,
  parearPorFala, rotuloArquivo, MSG_SEM_LEGENDA, tituloDoArquivo, titulosParecidos, chaveTitulo,
} from '../js/legendas.js';

const fx = (nome) => readFileSync(new URL(`./fixtures/${nome}`, import.meta.url));
const ler = (nome) => {
  const b = fx(nome);
  return lerArquivoLegenda(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
const textos = (falas) => falas.map((f) => f.t);

// ---------------------------------------------------------------- leitura

test('SRT normal: número de falas, tempos com 3 casas e texto', () => {
  const { falas } = ler('normal.srt');
  assert.equal(falas.length, 3);
  assert.deepEqual(falas[1], { s: 4, e: 6.25, t: 'Hoje vamos falar de motores.' });
});

test('SRT com BOM e \\r\\n é igual ao normal', () => {
  assert.deepEqual(ler('bom_crlf.srt').falas, ler('normal.srt').falas);
});

test('SRT sem os números das falas', () => {
  assert.deepEqual(ler('sem_numeros.srt').falas, ler('normal.srt').falas);
});

test('SRT com milissegundos com ponto e com 1 ou 2 dígitos', () => {
  const { falas } = ler('ms_curto.srt');
  assert.deepEqual(falas.map((f) => [f.s, f.e]), [[1.5, 2.25], [3.7, 4.05]]);
});

test('SRT em Windows-1252 com acentos', () => {
  assert.deepEqual(textos(ler('cp1252.srt').falas), ['Atenção: não ligue.', 'Ação imediata.']);
});

test('SRT com <i>, <font>, {\\an8} e &amp;: texto limpo, fala vazia descartada', () => {
  assert.deepEqual(textos(ler('tags.srt').falas), [
    'Olá mundo', 'Rock & Roll', 'No topo é aqui segunda linha',
  ]);
});

test('VTT com cabeçalho, NOTE, STYLE, REGION e configurações depois do tempo', () => {
  const r = ler('normal.vtt');
  assert.equal(r.formato, 'vtt');
  assert.deepEqual(r.falas, [
    { s: 1, e: 3.5, t: 'Olá, tudo bem?' },
    { s: 4, e: 6, t: 'Tudo ótimo.' },
  ]);
});

test('VTT automático do YouTube: sem tags e sem repetição em rolagem', () => {
  const { falas } = ler('youtube_auto.vtt');
  assert.deepEqual(textos(falas), [
    'the motor starts slowly', 'and then speeds up', 'until it reaches full speed',
  ]);
  for (const f of falas) assert.ok(!/[<>]/.test(f.t));
});

test('Falas sobrepostas e fim menor que início são corrigidas', () => {
  const { falas } = ler('sobrepostas.srt');
  assert.deepEqual(falas.map((f) => [f.s, f.e, f.t]), [
    [1, 3, 'Primeira longa'],
    [3, 4, 'Segunda'],
    [5, 7, 'Terceira fora de ordem'],
    [8, 9, 'Fim menor que início'],
    [9, 11, 'Fim igual ao início'],
    [20, 21, 'Última'],
  ]);
});

test('Arquivo vazio e arquivo que não é legenda: erro amigável, sem exceção', () => {
  assert.equal(ler('vazio.srt').erro, MSG_SEM_LEGENDA);
  assert.equal(ler('nao_legenda.txt').erro, MSG_SEM_LEGENDA);
  assert.equal(lerLegenda(null).erro, MSG_SEM_LEGENDA);
  assert.equal(lerArquivoLegenda(new ArrayBuffer(6 * 1024 * 1024)).erro, 'Arquivo grande demais (limite de 5 MB).');
});

test('Arquivo sem linha vazia no fim: a última fala é lida', () => {
  const { falas } = ler('sem_linha_final.srt');
  assert.equal(falas.length, 3);
  assert.equal(falas[2].t, 'Primeiro, a segurança.');
});

test('decodificar remove BOM e troca \\r por \\n', () => {
  assert.equal(decodificar(new Uint8Array([0xef, 0xbb, 0xbf, 0x61, 0x0d, 0x62])), 'a\nb');
});

// ---------------------------------------------------------------- pareamento

const U = (lista) => lista.map(([s, e, texto], i) => ({ i, s, e, texto, trad: '' }));
const F = (lista) => lista.map(([s, e, t]) => ({ s, e, t }));

test('Pareamento com tempos iguais: um para um', () => {
  const r = processar({ estudo: { falas: F([[0, 2, 'a'], [2, 4, 'b']]) }, traducao: { falas: F([[0, 2, 'A'], [2, 4, 'B']]) } }, { modoFrases: 'desligado' });
  assert.deepEqual(r.unidades.map((u) => u.trad), ['A', 'B']);
});

test('Pareamento com cortes diferentes', () => {
  const unidades = U([[0, 4, 'um'], [4, 8, 'dois'], [8, 9, 'três']]);
  parearPorFala(unidades, F([
    [0, 1.8, 'T1'], [2, 3.9, 'T2'], // duas traduções na mesma unidade
    [4.5, 8.8, 'T3 longa'], // maior sobreposição com a unidade 1
  ]));
  assert.deepEqual(unidades.map((u) => u.trad), ['T1 T2', 'T3 longa', '']);
});

test('Pareamento: sem sobreposição vai para quem contém o meio ou o início mais próximo até 1,5 s', () => {
  const unidades = U([[0, 1, 'a'], [3, 4, 'b'], [10, 11, 'c']]);
  parearPorFala(unidades, F([[1.0, 1.0, 'meio dentro?'], [4.2, 4.6, 'perto de b'], [6.0, 7.0, 'longe']]));
  assert.deepEqual(unidades.map((u) => u.trad), ['meio dentro?', 'perto de b', '']);
});

test('Pareamento com ajuste de sincronia aplicado antes', () => {
  const r = processar({
    estudo: { falas: F([[10, 12, 'a'], [12, 14, 'b']]) },
    traducao: { falas: F([[11, 13, 'A'], [13, 15, 'B']]) },
    ajusteEstudo: 0, ajusteTraducao: -1,
  }, { modoFrases: 'desligado' });
  assert.deepEqual(r.unidades.map((u) => u.trad), ['A', 'B']);
  const r2 = processar({ estudo: { falas: F([[10, 12, 'a']]) }, ajusteEstudo: 0.5 }, { modoFrases: 'desligado' });
  assert.deepEqual([r2.unidades[0].s, r2.unidades[0].e], [10.5, 12.5]);
});

// ---------------------------------------------------------------- modo frases

test('Automática estilo DownSub: detecção, frases, >> e limites', () => {
  const { falas } = ler('auto_downsub.srt');
  assert.ok(ehAutomatica(falas, 'qualquer.srt'));
  const r = processar({ estudo: { falas, arquivo: 'x.srt' } }, { modoFrases: 'auto' });
  assert.ok(r.frases && r.automatica);
  const t = r.unidades.map((u) => u.texto);
  assert.deepEqual(t, [
    'so today we are going to talk about the old pump.',
    'it was installed many years ago and nobody checked the seals since then.',
    'really?',
    'nobody?',
    'yes, nobody at all.',
    // 87 caracteres: passa de 2 linhas de 42 e quebra antes do "and"
    '[clears throat] the first thing you need to do is turn off the power',
    'and lock the panel.',
    'then you can open the cover.',
    'Mr. Smith showed me this trick in the U.S. a long time ago.',
    'after that check the bearings and the shaft for any noise or',
  ]);
  for (const u of r.unidades) {
    assert.ok(!u.texto.includes('>>'));
    assert.ok(u.e - u.s <= 7 && u.texto.length <= 84, JSON.stringify(u));
    assert.ok(u.s >= 10 && u.e <= 40);
  }
  // tempo estimado por palavra dentro da fala original: "it" é a última palavra da fala 10–12 s
  assert.ok(r.unidades[1].s > 13 && r.unidades[1].s < 14, String(r.unidades[1].s));
});

test('Detecção pelo rótulo "(auto-generated)" no nome do arquivo', () => {
  const nome = '[English (auto-generated)] Teste [DownSub.com].srt';
  assert.equal(rotuloArquivo(nome), 'English (auto-generated)');
  assert.ok(ehAutomatica([{ s: 0, e: 1, t: 'a' }], nome));
});

test('Modo frases divide frase longa sem pontuação no padrão de filme (84 caracteres / 7 s)', () => {
  const { falas } = ler('auto_sem_pontuacao.srt');
  const fr = montarFrases(falas);
  assert.ok(fr.length >= 2);
  for (const u of fr) assert.ok(u.e - u.s <= 7 && u.texto.length <= 84, JSON.stringify(u));
  // quebra antes do "and" (começo de trecho), nunca depois de "the"
  for (const u of fr) assert.ok(!/\b(the|a|of|to)$/.test(u.texto), u.texto);
  // nenhuma palavra perdida
  assert.equal(fr.map((u) => u.texto).join(' '), falas.map((f) => f.t).join(' '));
});

test('Modo frases: frase longa quebra na vírgula, em pedaços equilibrados', () => {
  const texto = 'When we opened the main panel of the old machine last week, we found two loose terminals and a burned contactor.';
  const fr = montarFrases([{ s: 0, e: 6, t: texto }]);
  assert.deepEqual(fr.map((u) => u.texto), [
    'When we opened the main panel of the old machine last week,',
    'we found two loose terminals and a burned contactor.',
  ]);
  // tempos contínuos e proporcionais
  assert.equal(fr[0].s, 0);
  assert.equal(fr[1].e, 6);
  assert.ok(fr[0].e <= fr[1].s && fr[1].s - fr[0].e < 0.1);
});

test('Modo frases: frase curta e lenta (mais de 7 s) é dividida pelo tempo', () => {
  const fr = montarFrases([{ s: 0, e: 12, t: 'and then we waited for the operator to come back to the line.' }]);
  assert.equal(fr.length, 2);
  for (const u of fr) assert.ok(u.e - u.s <= 7.5, JSON.stringify(u));
});

test('Modo frases: frase curta e rápida fica inteira', () => {
  const fr = montarFrases([{ s: 0, e: 3, t: 'Turn off the power first.' }]);
  assert.equal(fr.length, 1);
});

test('Tradução de arquivo é dividida nos mesmos pontos da frase original', () => {
  const r = processar({
    estudo: { falas: F([[0, 6, 'When we opened the main panel of the old machine last week, we found two loose terminals and a burned contactor.']]) },
    traducao: { falas: F([[0, 6, 'Quando abrimos o painel principal da máquina velha na semana passada, encontramos dois bornes soltos e um contator queimado.']]) },
  }, { modoFrases: 'ligado' });
  assert.deepEqual(r.unidades.map((u) => u.trad), [
    'Quando abrimos o painel principal da máquina velha na semana passada,',
    'encontramos dois bornes soltos e um contator queimado.',
  ]);
});

test('Manual estilo TED: Automático fica desligado; ligado mantém (Laughter) sozinha', () => {
  const { falas } = ler('ted_manual.srt');
  assert.equal(falas[0].t, 'When I started working with machines,');
  assert.ok(!ehAutomatica(falas, 'ted.srt'));
  const auto = processar({ estudo: { falas } }, { modoFrases: 'auto' });
  assert.equal(auto.frases, false);
  assert.equal(auto.unidades.length, 6);
  const lig = processar({ estudo: { falas } }, { modoFrases: 'ligado' });
  assert.deepEqual(lig.unidades.map((u) => u.texto), [
    'When I started working with machines, I thought every fault had a single cause.',
    '(Laughter)',
    'My boss just said: [Nope!]',
    'and walked away.',
    '(Applause)',
    'So I learned to test before I guess.',
  ]);
  const esc = processar({ estudo: { falas } }, { modoFrases: 'desligado', esconderMarcacoes: true });
  const t = esc.unidades.map((u) => u.texto);
  assert.ok(!t.includes('(Laughter)'));
  assert.ok(t.includes('My boss just said: and walked away.') && !t.some((x) => x.includes('[')));
});

test('Esconder marcações: tira tudo que está entre colchetes, no meio ou sozinho', () => {
  const r = esconderMarcacoes(F([[0, 1, 'all. [clears throat] the first'], [1, 2, '[Music]'], [2, 3, 'said [Nope!] ok'],
    [3, 4, '[Applause] [Music]'], [4, 5, 'Olá [Música] mundo [Aplausos]']]));
  assert.deepEqual(textos(r), ['all. the first', 'said ok', 'Olá mundo']);
  assert.ok(ehMarcacao('(Laughter)') && ehMarcacao('[Música]') && !ehMarcacao('[Nope!] ok'));
});

test('Esconder marcações: mantém o tempo de cada palavra fora dos colchetes', () => {
  const ps = [{ w: 'so', s: 0, e: 0.2 }, { w: '[clears', s: 0.2, e: 0.4 }, { w: 'throat]', s: 0.4, e: 0.6 }, { w: 'yes', s: 0.6, e: 0.9 }];
  const [f] = esconderMarcacoes([{ s: 0, e: 1, t: 'so [clears throat] yes', ps }]);
  assert.equal(f.t, 'so yes');
  assert.deepEqual(f.ps.map((p) => [p.w, p.s]), [['so', 0], ['yes', 0.6]]);
});

test('Tradução pareada por palavra com o modo frases', () => {
  const est = ler('auto_downsub.srt').falas;
  const pt = ler('auto_downsub_pt.srt').falas;
  const r = processar({ estudo: { falas: est }, traducao: { falas: pt } }, { modoFrases: 'auto' });
  // o pedaço "antiga. ela foi instalada há muitos" (13–16 s) cobre o fim da frase 0 e o começo da 1
  assert.ok(r.unidades[0].trad.endsWith('antiga.'), r.unidades[0].trad);
  assert.ok(r.unidades[1].trad.startsWith('ela foi instalada'), r.unidades[1].trad);
  // todas as palavras traduzidas foram usadas uma vez
  const todas = r.unidades.map((u) => u.trad).filter(Boolean).join(' ').split(' ');
  assert.equal(todas.length, pt.map((f) => f.t).join(' ').split(' ').length);
});

// ---------------------------------------------------------------- fala atual e navegação

const UN = U([[1, 3, 'a'], [3, 5, 'b'], [6, 8, 'c']]);

test('falaNoTempo: antes, dentro, intervalo vazio, depois da última', () => {
  assert.deepEqual(falaNoTempo(UN, 0), { indice: -1, dentro: false });
  assert.deepEqual(falaNoTempo(UN, 0.96), { indice: 0, dentro: true });
  assert.deepEqual(falaNoTempo(UN, 2), { indice: 0, dentro: true });
  assert.deepEqual(falaNoTempo(UN, 4), { indice: 1, dentro: true });
  assert.deepEqual(falaNoTempo(UN, 5.5), { indice: 1, dentro: false });
  assert.deepEqual(falaNoTempo(UN, 9), { indice: 2, dentro: false });
});

test('Navegação: tabela de 7.4 inteira', () => {
  const nav = (t, a) => navegar(UN, t, a).indice;
  // dentro da fala c=1
  assert.equal(nav(4, 'voltar'), 0);
  assert.equal(nav(4, 'repetir'), 1);
  assert.equal(nav(4, 'avancar'), 2);
  // dentro da fala 0
  assert.equal(nav(2, 'voltar'), 0);
  // intervalo vazio depois de c=1
  assert.equal(nav(5.5, 'voltar'), 1);
  assert.equal(nav(5.5, 'repetir'), 1);
  assert.equal(nav(5.5, 'avancar'), 2);
  // antes da primeira
  assert.equal(nav(0, 'voltar'), 0);
  assert.equal(nav(0, 'repetir'), 0);
  assert.equal(nav(0, 'avancar'), 0);
  // na última fala ou depois
  assert.deepEqual(navegar(UN, 7, 'avancar'), { indice: null, aviso: 'Última fala' });
  assert.deepEqual(navegar(UN, 9, 'avancar'), { indice: null, aviso: 'Última fala' });
  assert.equal(nav(7, 'voltar'), 1);
  assert.equal(nav(9, 'voltar'), 2);
  assert.equal(nav(9, 'repetir'), 2);
});

test('Navegação: três "voltar" seguidos em menos de 800 ms voltam três falas', () => {
  const un = U([[0, 2, 'a'], [2, 4, 'b'], [4, 6, 'c'], [6, 8, 'd'], [8, 10, 'e']]);
  let mem = null;
  let agora = 1000;
  const tPlayer = 9; // o player ainda não andou
  for (const esperado of [3, 2, 1]) {
    const { indice } = navegar(un, tPlayer, 'voltar', mem, agora);
    assert.equal(indice, esperado);
    mem = { indice, quando: agora };
    agora += 300;
  }
  // depois de 800 ms volta a usar o tempo do player
  assert.equal(navegar(un, 9, 'voltar', mem, agora + 900).indice, 3);
});

test('Pré-rolagem nunca abaixo de 0', () => {
  assert.equal(tempoDestino({ s: 0.1 }, 0.15), 0);
  assert.equal(tempoDestino({ s: 5 }, 0.3), 4.7);
});

// ---------------------------------------------------------------- link

test('lerLink: todos os formatos', () => {
  const id = 'arj7oStGLkU';
  const casos = [
    `https://www.youtube.com/watch?v=${id}`,
    `youtube.com/watch?v=${id}&list=PL123&index=2`,
    `http://m.youtube.com/watch?feature=share&v=${id}`,
    `https://youtu.be/${id}`,
    `youtu.be/${id}?si=abc`,
    `https://www.youtube.com/shorts/${id}`,
    `https://youtube.com/live/${id}?feature=share`,
    `https://www.youtube.com/embed/${id}`,
    `https://www.youtube-nocookie.com/embed/${id}`,
    `https://music.youtube.com/watch?v=${id}`,
    id,
    `Assista "Vídeo legal" no YouTube: https://youtu.be/${id} 🔥`,
  ];
  for (const c of casos) assert.deepEqual(lerLink(c), { videoId: id, inicioSeg: 0 }, c);
});

test('lerLink: tempo t e start', () => {
  const id = 'arj7oStGLkU';
  assert.equal(lerLink(`https://youtu.be/${id}?t=90`).inicioSeg, 90);
  assert.equal(lerLink(`https://youtu.be/${id}?t=90s`).inicioSeg, 90);
  assert.equal(lerLink(`https://www.youtube.com/watch?v=${id}&t=1m30s`).inicioSeg, 90);
  assert.equal(lerLink(`https://www.youtube.com/embed/${id}?start=125`).inicioSeg, 125);
  assert.equal(lerTempoLink('1h2m3s'), 3723);
});

test('lerLink: inválidos', () => {
  for (const c of ['', 'abc', 'https://youtube.com/watch?v=curto', 'https://vimeo.com/123456789', 'https://www.youtube.com/@canal']) {
    assert.equal(lerLink(c), null, c);
  }
});

// ---------------------------------------------------------------- utilidades

test('sugerirPapeis pelo nome do arquivo', () => {
  assert.deepEqual(sugerirPapeis(['[Portuguese] X [DownSub.com].srt', '[English] X [DownSub.com].srt']), { estudo: 1, traducao: 0 });
  assert.deepEqual(sugerirPapeis(['[English] X.srt', '[Português (Brasil)] X.srt']), { estudo: 0, traducao: 1 });
  assert.deepEqual(sugerirPapeis(['video.pt-BR.srt', 'video.en.srt']), { estudo: 1, traducao: 0 });
  assert.deepEqual(sugerirPapeis(['a.srt', 'b.srt']), { estudo: 0, traducao: 1 });
});

test('Utilidades de texto e formato brasileiro', () => {
  assert.equal(normalizar('AÇÃO Única'), 'acao unica');
  assert.equal(limparPalavra('"don\'t,'), "don't");
  assert.equal(limparPalavra('(peut-être)'), 'peut-être');
  assert.equal(formatarTempo(65), '1:05');
  assert.equal(formatarTempo(3725), '1:02:05');
  assert.equal(formatarNumero(0.15), '0,15');
  assert.equal(formatarNumero(1.25), '1,25');
});

// ---------------------------------------------------------------- desempenho

test('Pareamento e modo frases com 4.000 falas em menos de 100 ms', () => {
  const est = [];
  const tr = [];
  for (let i = 0; i < 4000; i++) {
    est.push({ s: i * 2, e: i * 2 + 2, t: `word number ${i} goes here${i % 3 === 0 ? '.' : ''} and more` });
  }
  for (let i = 0; i < 2700; i++) tr.push({ s: i * 3, e: i * 3 + 3, t: `palavra ${i} vai aqui e mais um pouco` });
  processar({ estudo: { falas: est }, traducao: { falas: tr } }, { modoFrases: 'ligado' }); // aquecimento
  const t0 = performance.now();
  const r1 = processar({ estudo: { falas: est }, traducao: { falas: tr } }, { modoFrases: 'ligado' });
  const t1 = performance.now();
  const r2 = processar({ estudo: { falas: est }, traducao: { falas: tr } }, { modoFrases: 'desligado' });
  const t2 = performance.now();
  assert.ok(r1.unidades.length > 1000 && r2.unidades.length === 4000);
  assert.ok(t1 - t0 < 100, `modo frases: ${(t1 - t0).toFixed(1)} ms`);
  assert.ok(t2 - t1 < 100, `por fala: ${(t2 - t1).toFixed(1)} ms`);
});

// ---------------------------------------------------------------- título pelo nome do arquivo

test('tituloDoArquivo e comparação de títulos', () => {
  const nome = "[English (auto-generated)] Hype or reality Inside Anthropic's $1 trillion US IPO The Current [DownSub.com].srt";
  assert.equal(tituloDoArquivo(nome), "Hype or reality Inside Anthropic's $1 trillion US IPO The Current");
  assert.equal(tituloDoArquivo('[Portuguese] Aula de Física [DownSub.com].vtt'), 'Aula de Física');
  // o DownSub tira ? e |
  assert.ok(titulosParecidos("Hype or reality? Inside Anthropic's $1 trillion US IPO | The Current", tituloDoArquivo(nome)));
  assert.ok(!titulosParecidos('How to wire a VFD', tituloDoArquivo(nome)));
  assert.equal(chaveTitulo('Ação | Teste?'), 'acao teste');
  assert.ok(titulosParecidos('', 'qualquer'));
});

test('processar: códigos de formatação saem também de vídeos já salvos (estudo e tradução)', async () => {
  const { processar, tirarTags } = await import('../js/legendas.js');
  assert.equal(tirarTags('ALPHA: <i>Hello.</i>'), 'ALPHA: Hello.');
  assert.equal(tirarTags('&lt;i&gt;Olá&lt;/i&gt;'), 'Olá');
  assert.equal(tirarTags('2 < 3 e 5 > 4'), '2 < 3 e 5 > 4'); // sinais soltos ficam
  const r = processar({
    estudo: { arquivo: '[English] x', falas: [{ s: 1, e: 2, t: 'ALPHA: <i>Hello.</i>' }, { s: 3, e: 4, t: '<i></i>' }] },
    traducao: { arquivo: '[Portuguese] x', falas: [{ s: 1, e: 2, t: 'ALFA: <i>Olá.</i>' }] },
  }, { modoFrases: 'desligado', esconderMarcacoes: true });
  assert.deepEqual(r.unidades.map((u) => [u.texto, u.trad]), [['ALPHA: Hello.', 'ALFA: Olá.']]);
});
