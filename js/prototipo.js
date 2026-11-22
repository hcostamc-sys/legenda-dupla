// prototipo.js — página de teste do app Android (prototipo.html).
// Pergunta ao player do YouTube quais legendas o vídeo tem, pede uma (com ou sem tradução do
// próprio YouTube) e mostra a cópia que o gancho do app Android capturou (android/.../gancho.js).

import { lerLink, formatarTempo } from './legendas.js';
import { lerTimedText, infoUrl } from './timedtext.js';
import { traduzirLote } from './traducao.js';

export const VERSAO_TESTE = 2;

const $ = (sel) => document.querySelector(sel);
const P = new URLSearchParams(location.search);
const NO_APP = P.get('app') === 'android';
const TESTE = P.get('teste') === '1'; // testes automáticos: aceita mensagens de qualquer origem
const VIDEO_PADRAO = 'https://www.youtube.com/watch?v=iG9CE55wbtY'; // palestra TED com muitas legendas

const estado = {
  player: null,
  videoId: '',
  faixas: [],
  traducoes: [],
  capturas: [],
  vistos: [],
  pedidosAndroid: new Map(),
  esperando: null,
  jaTocou: false,
};
const registro = [];

// ------------------------------------------------------------ registro e relatório

function log(msg) {
  const hora = new Date().toLocaleTimeString('pt-BR');
  registro.push(`${hora}  ${msg}`);
  atualizarRelatorio();
}

function resumoCaptura(c) {
  const i = c.info;
  const partes = [
    c.anuncio ? `ANÚNCIO (vídeo ${i.video})` : `vídeo ${i.video || '?'}`,
    `idioma ${i.idioma || '?'}${i.automatica ? ' (automática)' : ''}`,
    i.traducao ? `tradução ${i.traducao}` : 'sem tradução',
    `formato ${c.r.formato || i.formato || '?'}`,
    c.r.falas && c.status === 200 ? `${c.r.falas.length} falas` : `ERRO: ${c.status !== 200 ? 'recusado pelo YouTube' : c.r.erro}`,
    `HTTP ${c.status}`,
    `${c.tamanho} caracteres`,
    `token ${i.token ? 'sim' : 'não'}`,
    `via ${c.origem}`,
  ];
  return partes.join(' · ');
}

function atualizarRelatorio() {
  const linhas = [
    `Relatório do protótipo — Legenda Dupla (app Android) · versão do teste ${VERSAO_TESTE}`,
    `Data: ${new Date().toLocaleString('pt-BR')}`,
    `No app Android: ${NO_APP ? 'sim' : 'não'} · gancho: ${P.get('gancho') || '?'} · ponte: ${P.get('ponte') || '?'} · WebView: ${P.get('wv') || '?'}`,
    `Navegador: ${navigator.userAgent}`,
    `Vídeo: ${$('#campo-link')?.value || ''} (id carregado: ${estado.videoId || '—'})`,
    `Faixas de legenda informadas pelo player: ${estado.faixas.length}${estado.faixas.length ? ` (${estado.faixas.map(nomeFaixa).join('; ')})` : ''}`,
    `Idiomas de tradução informados: ${estado.traducoes.length}`,
    `Pedidos de legenda vistos pelo Android: ${estado.vistos.length}`,
    `Capturas: ${estado.capturas.length}`,
    ...estado.capturas.map((c, k) => `  ${k + 1}. ${resumoCaptura(c)}${c.r.falas?.length ? ` · 1ª fala: ${formatarTempo(c.r.falas[0].s)} “${c.r.falas[0].t.slice(0, 60)}”` : ''}`),
    '',
    'Registro:',
    ...registro,
  ];
  const area = $('#relatorio');
  if (area) area.value = linhas.join('\n');
}

async function copiarRelatorio() {
  atualizarRelatorio();
  const texto = $('#relatorio').value;
  try {
    await navigator.clipboard.writeText(texto);
    $('#btn-copiar').textContent = 'Copiado ✓';
  } catch {
    const area = $('#relatorio');
    area.focus();
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* nada */ }
    $('#btn-copiar').textContent = ok ? 'Copiado ✓' : 'Selecione o texto e copie';
  }
  setTimeout(() => { $('#btn-copiar').textContent = 'Copiar relatório'; }, 2500);
}

// ------------------------------------------------------------ player do YouTube

let promessaApi = null;
function carregarApi() {
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (promessaApi) return promessaApi;
  promessaApi = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    const limite = setTimeout(() => { promessaApi = null; reject(new Error('tempo esgotado')); }, 15000);
    window.onYouTubeIframeAPIReady = () => { clearTimeout(limite); resolve(); };
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { clearTimeout(limite); promessaApi = null; reject(new Error('não carregou')); };
    document.head.appendChild(s);
  });
  return promessaApi;
}

const NOMES_ESTADO = { '-1': 'não iniciado', 0: 'terminou', 1: 'tocando', 2: 'pausado', 3: 'carregando', 5: 'pronto' };
const ERROS = { 2: 'link inválido', 5: 'erro do player HTML5', 100: 'vídeo não encontrado', 101: 'o dono não deixa tocar fora do YouTube', 150: 'o dono não deixa tocar fora do YouTube', 153: 'falta o Referer' };

async function carregar() {
  const link = lerLink($('#campo-link').value);
  if (!link) { log('Link não reconhecido.'); return; }
  try {
    await carregarApi();
  } catch (e) {
    log(`Não consegui carregar a API do YouTube (${e.message}). Confira a internet.`);
    return;
  }
  try { estado.player?.destroy(); } catch { /* nada */ }
  estado.faixas = [];
  estado.traducoes = [];
  estado.jaTocou = false;
  mostrarFaixas();
  const host = $('#player-host');
  host.textContent = '';
  const div = document.createElement('div');
  div.id = 'yt-teste';
  host.appendChild(div);
  estado.videoId = link.videoId;
  log(`Carregando o vídeo ${link.videoId}…`);
  estado.player = new window.YT.Player('yt-teste', {
    videoId: link.videoId,
    // Sem cc_load_policy: a legenda só é pedida quando o botão "Pegar" mandar (menos pedidos ao YouTube).
    playerVars: { playsinline: 1, rel: 0, iv_load_policy: 3 },
    events: {
      onReady: () => {
        let titulo = '';
        try { titulo = estado.player.getVideoData().title || ''; } catch { /* nada */ }
        log(`Player pronto${titulo ? `: “${titulo}”` : ''}. Tocando sem som.`);
        try { estado.player.mute(); estado.player.playVideo(); } catch { /* nada */ }
      },
      onStateChange: (e) => {
        log(`Estado do player: ${NOMES_ESTADO[e.data] ?? e.data}`);
        if (e.data === 1 && !estado.jaTocou) {
          estado.jaTocou = true;
          setTimeout(lerFaixas, 1500);
        }
      },
      onApiChange: () => {
        let mods = [];
        try { mods = estado.player.getOptions() || []; } catch { /* nada */ }
        log(`Módulos do player: ${JSON.stringify(mods)}`);
        if (mods.includes('captions')) lerFaixas();
      },
      onError: (e) => log(`Erro do player ${e.data}: ${ERROS[e.data] || 'desconhecido'}`),
    },
  });
}

function nomeFaixa(t) {
  const nome = t.languageName || t.displayName || t.name || t.languageCode || '?';
  return `${nome} [${t.languageCode || '?'}]${t.kind === 'asr' ? ' (automática)' : ''}`;
}

function lerFaixas() {
  const p = estado.player;
  if (!p) return;
  try { p.loadModule('captions'); } catch { /* nada */ }
  let lista = null;
  let trad = null;
  try { lista = p.getOption('captions', 'tracklist'); } catch (e) { log(`getOption tracklist falhou: ${e.message}`); }
  try { trad = p.getOption('captions', 'translationLanguages'); } catch (e) { log(`getOption translationLanguages falhou: ${e.message}`); }
  if (!Array.isArray(lista) || !lista.length) {
    log(`O player ainda não informou as legendas (resposta: ${JSON.stringify(lista)}). Toque em “Ler a lista de novo” em alguns segundos.`);
    mostrarFaixas();
    return;
  }
  estado.faixas = lista;
  estado.traducoes = Array.isArray(trad) ? trad : [];
  log(`Legendas do vídeo (${lista.length}): ${lista.map(nomeFaixa).join('; ')}`);
  log(`1ª faixa, como o player informa: ${JSON.stringify(lista[0]).slice(0, 400)}`);
  log(`Idiomas de tradução do YouTube: ${estado.traducoes.length}${estado.traducoes.length ? ` (ex.: ${JSON.stringify(estado.traducoes[0])})` : ''}`);
  mostrarFaixas();
}

function mostrarFaixas() {
  const sf = $('#sel-faixa');
  const st = $('#sel-trad');
  sf.textContent = '';
  st.textContent = '';
  const tem = estado.faixas.length > 0;
  sf.disabled = !tem;
  st.disabled = !tem;
  $('#btn-pegar').disabled = !tem;
  $('#msg-faixas').textContent = tem
    ? `${estado.faixas.length} legenda(s). Escolha uma e, se quiser, a tradução do YouTube.`
    : 'Aparecem aqui depois que o vídeo começar a tocar.';
  estado.faixas.forEach((t, i) => {
    const o = document.createElement('option');
    o.value = String(i);
    o.textContent = nomeFaixa(t);
    sf.appendChild(o);
  });
  const sem = document.createElement('option');
  sem.value = '';
  sem.textContent = 'Sem tradução (legenda original)';
  st.appendChild(sem);
  const lista = estado.traducoes.slice().sort((a, b) => (a.languageCode === 'pt' ? -1 : b.languageCode === 'pt' ? 1 : 0));
  for (const t of lista) {
    const o = document.createElement('option');
    o.value = t.languageCode;
    o.textContent = `Traduzir para: ${t.languageName || t.languageCode} [${t.languageCode}]`;
    st.appendChild(o);
  }
  atualizarRelatorio();
}

function pegar() {
  const p = estado.player;
  const t = estado.faixas[Number($('#sel-faixa').value)];
  if (!p || !t) return;
  const destino = $('#sel-trad').value;
  const pedido = { ...t };
  if (destino) {
    const tr = estado.traducoes.find((x) => x.languageCode === destino);
    pedido.translationLanguage = tr ? { ...tr } : { languageCode: destino };
  }
  try { p.loadModule('captions'); } catch { /* nada */ }
  try {
    p.setOption('captions', 'track', pedido);
  } catch (e) {
    log(`setOption track falhou: ${e.message}`);
    return;
  }
  const antes = estado.capturas.length;
  let idNoPlayer = '';
  try { idNoPlayer = p.getVideoData().video_id || ''; } catch { /* nada */ }
  if (idNoPlayer && estado.videoId && idNoPlayer !== estado.videoId) {
    log(`Atenção: o player está mostrando outro vídeo (${idNoPlayer}), provavelmente um anúncio.`);
  }
  log(`Pedi a legenda ${nomeFaixa(t)}${destino ? `, traduzida para ${destino}` : ''}.`);
  clearTimeout(estado.esperando);
  estado.esperando = setTimeout(() => {
    if (estado.capturas.length === antes) {
      log('Nenhuma legenda nova capturada em 10 s. Se o vídeo estiver pausado, toque nele; depois toque em “Pegar esta legenda” de novo.');
    }
  }, 10000);
}

// ------------------------------------------------------------ capturas

function registrarCaptura(url, texto, status, origem) {
  const info = infoUrl(url);
  const c = {
    url,
    info,
    r: lerTimedText(texto),
    status: Number(status) || status || '?',
    tamanho: String(texto || '').length,
    origem,
    // A legenda de um anúncio vem com o id de outro vídeo.
    anuncio: !!(info.video && estado.videoId && info.video !== estado.videoId),
  };
  estado.capturas.push(c);
  log(`Captura ${estado.capturas.length}: ${resumoCaptura(c)}`);
  mostrarCaptura(c);
}

function mostrarCaptura(c) {
  $('#msg-capturas').textContent = `${estado.capturas.length} captura(s).`;
  const caixa = document.createElement('div');
  const recusado = c.status !== 200;
  const boa = !!c.r.falas?.length && !recusado && !c.anuncio;
  caixa.className = `captura ${boa ? 'boa' : 'vazia'}`;
  const h = document.createElement('h3');
  if (boa) h.textContent = '✅ Legenda capturada';
  else if (recusado) h.textContent = `⛔ O YouTube recusou este pedido (HTTP ${c.status})`;
  else if (c.anuncio) h.textContent = '📺 Legenda de um anúncio, não do vídeo. Espere o anúncio acabar e peça de novo.';
  else h.textContent = '⚠ Pedido capturado, mas sem texto';
  const p = document.createElement('p');
  p.className = 'info';
  p.textContent = resumoCaptura(c);
  caixa.append(h, p);
  if (boa) {
    const ul = document.createElement('ul');
    ul.className = 'falas';
    const mostrar = (n) => {
      ul.textContent = '';
      for (const f of c.r.falas.slice(0, n)) {
        const li = document.createElement('li');
        const t = document.createElement('span');
        t.className = 't';
        t.textContent = formatarTempo(f.s);
        li.append(t, document.createTextNode(f.t));
        ul.appendChild(li);
      }
    };
    mostrar(6);
    caixa.appendChild(ul);
    if (c.r.falas.length > 6) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn-link';
      b.textContent = `Mostrar todas as ${c.r.falas.length} falas`;
      b.addEventListener('click', () => { mostrar(c.r.falas.length); b.remove(); });
      caixa.appendChild(b);
    }
    // Teste da tradução pelo tradutor do app (o mesmo da tradução automática de hoje).
    const bt = document.createElement('button');
    bt.type = 'button';
    bt.className = 'btn';
    bt.textContent = 'Traduzir 8 falas com o tradutor do app';
    const saida = document.createElement('ul');
    saida.className = 'falas';
    bt.addEventListener('click', async () => {
      bt.disabled = true;
      const amostra = c.r.falas.slice(0, 8);
      try {
        const trad = await traduzirLote(amostra.map((f) => f.t), 'auto', 'pt');
        saida.textContent = '';
        amostra.forEach((f, k) => {
          const li = document.createElement('li');
          li.textContent = `${formatarTempo(f.s)}  ${f.t}  →  ${trad[k] || '(vazio)'}`;
          saida.appendChild(li);
        });
        log(`Tradutor do app: ${trad.filter(Boolean).length} de ${amostra.length} falas traduzidas. Ex.: “${trad[0] || ''}”`);
      } catch (e) {
        log(`Tradutor do app falhou: ${e.message}`);
      }
      bt.disabled = false;
    });
    caixa.append(bt, saida);
  }
  $('#capturas').prepend(caixa);
}

window.addEventListener('message', (ev) => {
  const d = ev.data;
  if (!d || typeof d !== 'object' || d.ldLegenda !== true) return;
  let host = '';
  try { host = new URL(ev.origin).hostname; } catch { /* nada */ }
  if (!TESTE && !/(^|\.)youtube(-nocookie)?\.com$/.test(host)) return;
  registrarCaptura(d.url, d.texto, d.status, `gancho/${d.via || '?'}`);
});

// ------------------------------------------------------------ plano B (Android baixa de novo)

window.ldNativoViu = (url) => {
  estado.vistos.push(url);
  const i = infoUrl(url);
  const outro = i.video && estado.videoId && i.video !== estado.videoId;
  log(`Android viu um pedido de legenda${outro ? ' (de um ANÚNCIO)' : ''}: vídeo ${i.video || '?'} · idioma ${i.idioma || '?'}${i.traducao ? ` → ${i.traducao}` : ''} · formato ${i.formato || '?'} · token ${i.token ? 'sim' : 'não'}`);
  $('#msg-vistos').textContent = `Pedidos de legenda que o Android viu passar: ${estado.vistos.length}.`;
  $('#btn-baixar-android').disabled = !window.LDNativo;
};

function baixarPeloAndroid() {
  const url = estado.vistos[estado.vistos.length - 1];
  if (!url) return;
  if (!window.LDNativo) { log('A ponte com o Android não está disponível.'); return; }
  const id = String(Date.now());
  estado.pedidosAndroid.set(id, url);
  window.LDNativo.postMessage(JSON.stringify({ acao: 'baixar', url, id }));
  log('Pedi ao Android para baixar de novo o último pedido de legenda…');
}

if (window.LDNativo) {
  window.LDNativo.onmessage = (ev) => {
    let r;
    try { r = JSON.parse(ev.data); } catch { log('Resposta inválida do Android.'); return; }
    const url = estado.pedidosAndroid.get(r.id) || '';
    if (r.erro) { log(`Android: ${r.erro}`); return; }
    registrarCaptura(url, r.texto, r.status, 'Android (plano B)');
  };
}

// ------------------------------------------------------------ início

function iniciar() {
  const infos = [
    NO_APP ? '<span class="ok">Aberto pelo app Android.</span>' : '<span class="ruim">Aberto no navegador (sem captura).</span>',
    `Gancho no player: ${P.get('gancho') === 'true' ? '<span class="ok">ligado</span>' : '<span class="ruim">desligado</span>'}`,
    `Ponte com o Android: ${window.LDNativo ? '<span class="ok">ligada</span>' : '<span class="ruim">desligada</span>'}`,
  ];
  if (P.get('wv')) infos.push(`WebView ${P.get('wv')}`);
  $('#info').innerHTML = infos.join(' · ');
  $('#aviso-navegador').hidden = NO_APP || TESTE;
  const compartilhado = P.get('link') ? lerLink(P.get('link')) : null;
  $('#campo-link').value = compartilhado ? `https://www.youtube.com/watch?v=${compartilhado.videoId}` : VIDEO_PADRAO;
  $('#btn-carregar').addEventListener('click', carregar);
  $('#btn-reler').addEventListener('click', lerFaixas);
  $('#btn-pegar').addEventListener('click', pegar);
  $('#btn-baixar-android').addEventListener('click', baixarPeloAndroid);
  $('#btn-copiar').addEventListener('click', copiarRelatorio);
  mostrarFaixas();
  log(`Página aberta${NO_APP ? ' no app Android' : ''}.`);
  if (compartilhado && !TESTE) carregar();
}

iniciar();
