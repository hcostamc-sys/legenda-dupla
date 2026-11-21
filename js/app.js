// app.js — estado, telas, eventos. Liga legendas, player, gestos e armazenamento.
// PLANO.md seções 7 a 11.

import {
  lerLink, lerArquivoLegenda, sugerirPapeis, processar, falaNoTempo, indiceLogico, navegar,
  tempoDestino, normalizar, limparPalavra, formatarTempo, formatarNumero, LIMITE_BYTES,
  MSG_LINK_INVALIDO,
} from './legendas.js';
import { criarPlayer, MSG_API } from './player.js';
import { ligarGestos } from './gestos.js';
import {
  AJUSTES_PADRAO, carregarAjustes, salvarAjustes, salvarVideo, obterVideo, listarVideos,
  apagarVideo, montarBackup, importarBackup, estaSoNaMemoria,
} from './armazenamento.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const MOCK = new URLSearchParams(location.search).get('mock') === '1';

// ============================================================ estado

const S = {
  ajustes: carregarAjustes(),
  // vídeo aberto
  registro: null,
  unidades: [],
  frases: false,
  automatica: false,
  player: null,
  pronto: false,
  primeiroPlay: false,
  exibida: -2, // índice mostrado na caixa
  exibidaDentro: false,
  destacada: -2,
  memoriaNav: null,
  alvoNav: null,
  falaAtiva: -1,
  pausadaEm: -1,
  loop: { alvo: null, contador: 0, espera: null },
  ab: { a: null, b: null },
  revelada: { l1: false, l2: false },
  velConfirmada: 1,
  velPedida: null,
  tocandoLogico: false, // 1, ou 3 (carregando) logo depois de 1
  ajustouVelInicio: false,
  raf: 0,
  ultimoProgresso: 0,
  ultimoSalvamento: 0,
  saltoEm: 0,
  arrastandoBarra: false,
  telaLigada: null,
  timerFaixa: null,
  vindoDaBiblioteca: false,
  // formulário
  escolha: { estudo: null, traducao: null },
};

// ============================================================ utilidades de interface

let timerToast = null;
function toast(msg, ms = 2600) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(timerToast);
  timerToast = setTimeout(() => { el.hidden = true; }, ms);
}

let timerRetorno = null;
function mostrarRetorno(texto) {
  const el = $('#retorno-gesto');
  el.textContent = texto;
  el.classList.add('visivel');
  clearTimeout(timerRetorno);
  timerRetorno = setTimeout(() => el.classList.remove('visivel'), 500);
}

function vibrar() {
  try { navigator.vibrate?.(15); } catch { /* nada */ }
}

const seg = (x) => `${formatarNumero(x)} s`;

/** Diálogo da própria página (sem alert/confirm/prompt). */
function dialogo({ texto, ok = 'OK', cancelar = 'Cancelar', campo = null, caixa = null }) {
  return new Promise((resolve) => {
    const d = $('#dialogo');
    $('#dialogo-texto').textContent = texto;
    const extra = $('#dialogo-extra');
    extra.textContent = '';
    let input = null;
    let check = null;
    if (campo !== null) {
      input = document.createElement('input');
      input.type = 'text';
      input.value = campo;
      input.setAttribute('aria-label', texto);
      extra.appendChild(input);
    }
    if (caixa) {
      const label = document.createElement('label');
      label.className = 'ajuste ajuste-check';
      check = document.createElement('input');
      check.type = 'checkbox';
      label.append(check, document.createTextNode(' ' + caixa));
      extra.appendChild(label);
    }
    $('#dialogo-ok').textContent = ok;
    const btnCancelar = $('#dialogo-cancelar');
    btnCancelar.textContent = cancelar;
    btnCancelar.hidden = cancelar === null;
    d.hidden = false;
    (input || $('#dialogo-ok')).focus();
    const fim = (confirmou) => {
      d.hidden = true;
      $('#dialogo-ok').onclick = null;
      btnCancelar.onclick = null;
      d.onkeydown = null;
      resolve({ ok: confirmou, valor: input ? input.value : null, marcado: check ? check.checked : false });
    };
    $('#dialogo-ok').onclick = () => fim(true);
    btnCancelar.onclick = () => fim(false);
    d.onkeydown = (ev) => {
      if (ev.key === 'Escape') fim(false);
      if (ev.key === 'Enter' && input) fim(true);
    };
  });
}

// ============================================================ aparência

function aplicarAparencia() {
  const a = S.ajustes;
  const raiz = document.documentElement.style;
  raiz.setProperty('--fonte-l1', `${a.fonteL1}px`);
  raiz.setProperty('--fonte-l2', `${a.fonteL2}px`);
  raiz.setProperty('--opac-fundo', String(a.opacidadeFundo / 100));
  document.body.classList.toggle('sobre-em-pe', a.legendaSobreEmPe);
  $('#legenda-sobre').classList.toggle('cima', a.posicaoSobre === 'cima');
  $('#legenda-sobre').classList.toggle('invertida', a.inverterOrdem);
  $('#caixa-legenda').classList.toggle('invertida', a.inverterOrdem);
  $('#btn-pausa-auto').setAttribute('aria-pressed', String(a.pausaAuto));
  $('#btn-loop').setAttribute('aria-pressed', String(a.loop));
  const nomes = { visivel: 'visível', borrada: 'borrada', oculta: 'oculta' };
  $('#btn-linha1').textContent = `Linha 1: ${nomes[a.linha1]}`;
  $('#btn-linha2').textContent = `Linha 2: ${nomes[a.linha2]}`;
}

function salvar() {
  salvarAjustes(S.ajustes);
}

// ============================================================ biblioteca: formulário

function validarFormulario() {
  const texto = $('#campo-link').value;
  const link = lerLink(texto);
  const msg = $('#msg-link');
  if (texto.trim() && !link) {
    msg.textContent = MSG_LINK_INVALIDO;
    msg.className = 'msg msg-erro';
  } else if (msg.classList.contains('msg-erro')) {
    msg.textContent = '';
    msg.className = 'msg';
  }
  $('#btn-abrir').disabled = !(link && S.escolha.estudo);
}

function mostrarEscolha(papel) {
  const el = $(papel === 'estudo' ? '#info-estudo' : '#info-traducao');
  const e = S.escolha[papel];
  if (e?.erro) {
    el.textContent = `${e.arquivo}: ${e.erro}`;
    el.className = 'info-arquivo erro';
  } else if (e) {
    const n = e.falas.length;
    el.textContent = `${e.arquivo} — ${n.toLocaleString('pt-BR')} ${n === 1 ? 'fala lida' : 'falas lidas'}`;
    el.className = 'info-arquivo ok';
  } else {
    el.textContent = 'Nenhum arquivo escolhido.';
    el.className = 'info-arquivo';
  }
}

async function lerArquivo(file) {
  if (file.size > LIMITE_BYTES) return { arquivo: file.name, erro: 'Arquivo grande demais (limite de 5 MB).' };
  try {
    const r = lerArquivoLegenda(await file.arrayBuffer());
    if (r.erro) return { arquivo: file.name, erro: r.erro };
    return { arquivo: file.name, falas: r.falas };
  } catch {
    return { arquivo: file.name, erro: 'Não consegui ler esse arquivo.' };
  }
}

function definirEscolha(papel, r) {
  S.escolha[papel] = r && !r.erro ? { arquivo: r.arquivo, falas: r.falas } : null;
  mostrarEscolha(papel);
  if (r?.erro) {
    const el = $(papel === 'estudo' ? '#info-estudo' : '#info-traducao');
    el.textContent = `${r.arquivo}: ${r.erro}`;
    el.className = 'info-arquivo erro';
  }
}

async function receberArquivos(lista, papel) {
  const arquivos = Array.from(lista || []);
  if (!arquivos.length) return;
  if (arquivos.length > 2) toast('Escolha no máximo dois arquivos. Usei os dois primeiros.');
  if (arquivos.length >= 2) {
    const dois = arquivos.slice(0, 2);
    const papeis = sugerirPapeis(dois.map((f) => f.name));
    const [r0, r1] = await Promise.all(dois.map(lerArquivo));
    const lidos = [r0, r1];
    definirEscolha('estudo', lidos[papeis.estudo]);
    definirEscolha('traducao', lidos[papeis.traducao]);
    toast('Confira os dois arquivos. Se estiverem trocados, toque em ⇅ Trocar.');
  } else {
    const alvo = papel || (S.escolha.estudo ? 'traducao' : 'estudo');
    definirEscolha(alvo, await lerArquivo(arquivos[0]));
  }
  validarFormulario();
}

function trocarPapeis() {
  const { estudo, traducao } = S.escolha;
  S.escolha.estudo = traducao;
  S.escolha.traducao = estudo;
  mostrarEscolha('estudo');
  mostrarEscolha('traducao');
  validarFormulario();
}

function limparFormulario() {
  $('#campo-link').value = '';
  S.escolha = { estudo: null, traducao: null };
  mostrarEscolha('estudo');
  mostrarEscolha('traducao');
  $('#msg-link').textContent = '';
  $('#msg-link').className = 'msg';
  validarFormulario();
}

async function abrirDoFormulario() {
  const link = lerLink($('#campo-link').value);
  if (!link || !S.escolha.estudo) return;
  const existente = await obterVideo(link.videoId);
  const agora = new Date().toISOString();
  const reg = {
    id: link.videoId,
    titulo: existente?.titulo || '',
    criadoEm: existente?.criadoEm || agora,
    abertoEm: agora,
    posicao: existente?.posicao || 0,
    estudo: S.escolha.estudo,
    traducao: S.escolha.traducao || null,
    ajusteEstudo: 0,
    ajusteTraducao: 0,
  };
  const inicio = link.inicioSeg > 0 ? link.inicioSeg : existente ? Math.max(0, reg.posicao - 2) : 0;
  await salvarVideo(reg);
  limparFormulario();
  abrirVideo(reg, inicio);
}

async function colar() {
  try {
    const texto = await navigator.clipboard.readText();
    $('#campo-link').value = texto;
    validarFormulario();
    if (!lerLink(texto)) toast(MSG_LINK_INVALIDO);
  } catch {
    toast('Não consegui colar. Toque e segure no campo e escolha “Colar”.');
    $('#campo-link').focus();
  }
}

// ============================================================ biblioteca: lista

function fecharMenusItens() {
  $$('.menu-item-opcoes').forEach((m) => m.remove());
}

async function renderBiblioteca() {
  const ul = $('#lista-biblioteca');
  const videos = await listarVideos();
  ul.textContent = '';
  $('#biblioteca-vazia').hidden = videos.length > 0;
  for (const v of videos) {
    const li = document.createElement('li');
    li.className = 'item-bib';
    li.dataset.id = v.id;

    const abrir = document.createElement('button');
    abrir.type = 'button';
    abrir.className = 'abrir-item';
    const img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    img.src = `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`;
    img.onerror = () => { img.style.visibility = 'hidden'; };
    const textos = document.createElement('div');
    textos.className = 'textos';
    const titulo = document.createElement('div');
    titulo.className = 'titulo';
    titulo.textContent = v.titulo || `Vídeo ${v.id}`;
    const detalhe = document.createElement('div');
    detalhe.className = 'detalhe';
    let data = '';
    try { data = new Date(v.abertoEm).toLocaleDateString('pt-BR'); } catch { /* nada */ }
    detalhe.textContent = `parou em ${formatarTempo(v.posicao || 0)}${data ? ' · ' + data : ''}`;
    textos.append(titulo, detalhe);
    abrir.append(img, textos);
    abrir.addEventListener('click', async () => {
      const reg = await obterVideo(v.id);
      if (!reg) return;
      reg.abertoEm = new Date().toISOString();
      await salvarVideo(reg);
      abrirVideo(reg, Math.max(0, (reg.posicao || 0) - 2));
    });

    const menu = document.createElement('div');
    menu.className = 'menu-item';
    const btnMenu = document.createElement('button');
    btnMenu.type = 'button';
    btnMenu.className = 'btn-topo';
    btnMenu.textContent = '⋮';
    btnMenu.setAttribute('aria-label', `Opções de ${titulo.textContent}`);
    btnMenu.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const jaAberto = menu.querySelector('.menu-item-opcoes');
      fecharMenusItens();
      if (jaAberto) return;
      const op = document.createElement('div');
      op.className = 'menu-item-opcoes';
      const item = (rotulo, fn) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = rotulo;
        b.addEventListener('click', (e) => { e.stopPropagation(); fecharMenusItens(); fn(); });
        op.appendChild(b);
      };
      item('Renomear', () => renomear(v.id));
      item('Trocar legendas', () => trocarLegendas(v));
      item('Apagar', () => apagar(v));
      menu.appendChild(op);
    });
    menu.appendChild(btnMenu);
    li.append(abrir, menu);
    ul.appendChild(li);
  }
}

async function renomear(id) {
  const reg = await obterVideo(id);
  if (!reg) return;
  const r = await dialogo({ texto: 'Novo nome do vídeo:', campo: reg.titulo || '', ok: 'Salvar' });
  if (!r.ok) return;
  reg.titulo = r.valor.trim();
  await salvarVideo(reg);
  renderBiblioteca();
}

function trocarLegendas(v) {
  limparFormulario();
  $('#campo-link').value = `https://youtu.be/${v.id}`;
  const msg = $('#msg-link');
  msg.textContent = `Escolha as novas legendas para “${v.titulo || 'Vídeo ' + v.id}” e toque em Abrir vídeo.`;
  msg.className = 'msg msg-alerta';
  validarFormulario();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function apagar(v) {
  const r = await dialogo({ texto: `Apagar “${v.titulo || 'Vídeo ' + v.id}” da biblioteca?`, ok: 'Apagar' });
  if (!r.ok) return;
  await apagarVideo(v.id);
  renderBiblioteca();
  toast('Vídeo apagado.');
}

// ============================================================ backup

function dataHoje() {
  const d = new Date();
  const dd = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${dd(d.getMonth() + 1)}-${dd(d.getDate())}`;
}

async function exportar() {
  try {
    const dados = await montarBackup(S.ajustes);
    const blob = new Blob([JSON.stringify(dados)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `legenda-dupla-backup-${dataHoje()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    const n = dados.videos.length;
    toast(`Backup salvo com ${n} ${n === 1 ? 'vídeo' : 'vídeos'}. Procure em Downloads.`);
  } catch {
    toast('Não consegui gerar o backup.');
  }
}

let importarAjustesJunto = false;
async function importar() {
  const r = await dialogo({
    texto: 'Escolha o arquivo de backup (.json) do Legenda Dupla.',
    ok: 'Escolher arquivo',
    caixa: 'Também importar ajustes',
  });
  if (!r.ok) return;
  importarAjustesJunto = r.marcado;
  $('#arq-importar').click();
}

async function aoEscolherBackup(file) {
  if (!file) return;
  try {
    const texto = await file.text();
    let dados;
    try { dados = JSON.parse(texto); } catch { throw new Error('Esse arquivo não é um backup do Legenda Dupla.'); }
    const r = await importarBackup(dados);
    if (importarAjustesJunto && r.ajustes) {
      S.ajustes = r.ajustes;
      salvar();
      aplicarAparencia();
    }
    const v = (n) => `${n} ${n === 1 ? 'vídeo' : 'vídeos'}`;
    let msg = `Importados ${v(r.novos)}, ${r.existiam} já ${r.existiam === 1 ? 'existia' : 'existiam'}.`;
    if (r.invalidos) msg += ` ${r.invalidos} com problema foram ignorados.`;
    toast(msg, 4000);
    renderBiblioteca();
  } catch (e) {
    toast(e.message || 'Não consegui importar.', 4000);
  }
}

// ============================================================ telas e histórico

function mostrarBiblioteca() {
  $('#tela-assistir').hidden = true;
  $('#tela-biblioteca').hidden = false;
  document.body.classList.remove('imersivo', 'faixa-visivel', 'lista-aberta');
  fecharPaineis();
}

function mostrarTelaAssistir() {
  $('#tela-biblioteca').hidden = true;
  $('#tela-assistir').hidden = false;
  atualizarImersivo();
}

function rota() {
  if (location.hash === '#assistir') {
    if (!S.registro) {
      history.replaceState(null, '', location.pathname + location.search + '#biblioteca');
      mostrarBiblioteca();
      renderBiblioteca();
    } else {
      mostrarTelaAssistir();
    }
  } else {
    if (S.registro) fecharVideo();
    mostrarBiblioteca();
  }
}

function voltarParaBiblioteca() {
  if (S.vindoDaBiblioteca) {
    S.vindoDaBiblioteca = false;
    history.back();
  } else {
    location.hash = '#biblioteca';
  }
}

// ============================================================ abrir e fechar vídeo

function tituloAtual() {
  return S.registro?.titulo || (S.registro ? `Vídeo ${S.registro.id}` : '');
}

function reprocessar() {
  const reg = S.registro;
  if (!reg) return;
  const r = processar(
    { estudo: reg.estudo, traducao: reg.traducao, ajusteEstudo: reg.ajusteEstudo, ajusteTraducao: reg.ajusteTraducao },
    { modoFrases: S.ajustes.modoFrases, esconderMarcacoes: S.ajustes.esconderMarcacoes },
  );
  S.unidades = r.unidades;
  S.frases = r.frases;
  S.automatica = r.automatica;
  $('#aviso-frases').hidden = !(r.frases && S.ajustes.modoFrases === 'auto');
  S.memoriaNav = null;
  S.alvoNav = null;
  S.falaAtiva = -1;
  S.pausadaEm = -1;
  S.loop.alvo = null;
  S.loop.contador = 0;
  if (S.ab.a !== null || S.ab.b !== null) {
    S.ab = { a: null, b: null };
    atualizarAB();
  }
  lista.definir(S.unidades);
  const busca = $('#busca-falas').value;
  if (busca) lista.filtrar(busca);
  S.exibida = -2;
  S.destacada = -2;
  renderLegenda(true);
}

async function abrirVideo(reg, inicio) {
  if (S.player) encerrarPlayer();
  clearTimeout(timerToast);
  $('#toast').hidden = true;
  S.registro = reg;
  S.pronto = false;
  S.primeiroPlay = false;
  S.tocandoLogico = false;
  S.ajustouVelInicio = false;
  S.ab = { a: null, b: null };
  atualizarAB();
  $('#busca-falas').value = '';
  reprocessar();
  $('#titulo-video').textContent = tituloAtual();
  $('#erro-player').hidden = true;
  $('#aviso-toque').hidden = true;
  $('#btn-tocar-grande').hidden = false;
  document.body.classList.remove('gestos-ativos');
  atualizarBotaoPlay();
  $('#barra-progresso').value = 0;
  $('#tempo-atual').textContent = formatarTempo(inicio);
  $('#tempo-total').textContent = '0:00';

  mostrarTelaAssistir();
  if (location.hash !== '#assistir') {
    S.vindoDaBiblioteca = true;
    location.hash = '#assistir';
  }

  const p = criarPlayer($('#player-host'));
  S.player = p;
  p.on('estado', aoMudarEstado);
  p.on('velocidade', (v) => {
    S.velConfirmada = v;
    // Só grava quando a troca foi pedida pelo usuário (um anúncio pode forçar 1×).
    if (S.velPedida && Math.abs(S.velPedida.v - v) < 1e-6 && performance.now() - S.velPedida.quando < 5000) {
      S.ajustes.velocidade = v;
      salvar();
      S.velPedida = null;
    }
    $('#btn-velocidade').textContent = `${formatarNumero(v)}×`;
    if (!$('#menu-velocidade').hidden) montarMenuVelocidade();
  });
  p.on('erro', (codigo) => mostrarErroPlayer(codigo));
  p.on('autoplayBloqueado', mostrarAvisoToque);
  iniciarLaco();
  try {
    await p.carregar(reg.id, inicio);
  } catch (e) {
    if (S.player !== p) return;
    mostrarErroPlayer(null, e?.message || MSG_API);
    return;
  }
  if (S.player !== p) return;
  S.pronto = true;
  aplicarVelocidadeSalva();
  lerTitulo();
  $('#titulo-video').textContent = tituloAtual();
  atualizarProgresso(true);
}

function encerrarPlayer() {
  salvarPosicao();
  cancelAnimationFrame(S.raf);
  S.raf = 0;
  clearTimeout(S.loop.espera);
  try { S.player?.destruir(); } catch { /* nada */ }
  S.player = null;
  soltarTelaLigada();
}

function fecharVideo() {
  encerrarPlayer();
  try { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); } catch { /* nada */ }
  S.registro = null;
  S.unidades = [];
  lista.definir([]);
  fecharCartao();
  $('#menu-velocidade').hidden = true;
  document.body.classList.remove('gestos-ativos', 'lista-aberta');
  renderBiblioteca();
}

function aplicarVelocidadeSalva() {
  const p = S.player;
  if (!p) return;
  const vels = p.velocidades();
  const alvo = vels.reduce((a, b) => (Math.abs(b - S.ajustes.velocidade) < Math.abs(a - S.ajustes.velocidade) ? b : a), vels[0] ?? 1);
  S.velConfirmada = p.velocidade() || 1;
  $('#btn-velocidade').textContent = `${formatarNumero(S.velConfirmada)}×`;
  if (alvo !== S.velConfirmada) p.definirVelocidade(alvo);
}

const MENSAGENS_ERRO = {
  2: 'Link inválido. Confira o endereço do vídeo.',
  5: 'O navegador não conseguiu tocar este vídeo. Tente recarregar a página.',
  100: 'Vídeo não encontrado: foi removido ou é privado.',
  101: 'O dono do vídeo não permite tocar fora do YouTube.',
  150: 'O dono do vídeo não permite tocar fora do YouTube.',
  153: 'O YouTube recusou o player por falta de identificação do site. Abra pelo endereço do GitHub Pages, não pelo arquivo no aparelho.',
};

function mostrarErroPlayer(codigo, texto) {
  const msg = texto || MENSAGENS_ERRO[codigo] || `Erro do YouTube (código ${codigo}). Tente recarregar.`;
  $('#erro-texto').textContent = msg;
  const link = $('#erro-abrir-yt');
  const proibido = codigo === 101 || codigo === 150;
  link.hidden = !proibido;
  if (proibido && S.registro) link.href = `https://www.youtube.com/watch?v=${S.registro.id}`;
  $('#erro-player').hidden = false;
  $('#btn-tocar-grande').hidden = true;
  $('#aviso-toque').hidden = true;
}

// ============================================================ primeiro play (7.2)

function tocarPrimeiraVez() {
  const p = S.player;
  if (!p) return;
  p.tocar();
  setTimeout(() => {
    if (S.player === p && !S.primeiroPlay && [-1, 5].includes(p.estado())) mostrarAvisoToque();
  }, 1500);
}

function mostrarAvisoToque() {
  if (S.primeiroPlay) return;
  $('#btn-tocar-grande').hidden = true;
  $('#aviso-toque').hidden = false;
}

function aoMudarEstado(st) {
  const antes = S.tocandoLogico;
  // O estado 3 (carregando) logo depois do 1 continua sendo "tocando" para a interface.
  S.tocandoLogico = st === 1 || (st === 3 && antes);
  if ((st === 1 || st === 3) && !S.primeiroPlay) {
    $('#btn-tocar-grande').hidden = true;
  }
  if (st === 1 && !S.primeiroPlay) {
    S.primeiroPlay = true;
    $('#aviso-toque').hidden = true;
    document.body.classList.add('gestos-ativos');
  }
  if (st === 1) {
    if (!S.ajustouVelInicio && S.pronto) {
      S.ajustouVelInicio = true;
      aplicarVelocidadeSalva(); // o player pode ter ignorado o pedido feito antes de tocar
      lerTitulo();
    }
  }
  atualizarBotaoPlay();
  if (S.tocandoLogico) {
    pedirTelaLigada();
    if (st === 1 && document.body.classList.contains('faixa-visivel')) mostrarFaixa(); // só reinicia os 3 s
  } else if (st !== 3) {
    soltarTelaLigada();
    if (st === 2 || st === 0) salvarPosicao();
    if (document.body.classList.contains('imersivo')) mostrarFaixa();
  }
  if (S.ajustes.traducaoSoPausado && S.tocandoLogico !== antes) renderLegenda(true);
  if (!S.raf) iniciarLaco();
}

function lerTitulo() {
  const reg = S.registro;
  const t = S.player?.titulo();
  if (reg && t && !reg.titulo) {
    reg.titulo = t;
    salvarVideo(reg);
    $('#titulo-video').textContent = tituloAtual();
  }
}

function atualizarBotaoPlay() {
  const tocando = S.tocandoLogico;
  const b = $('#btn-play');
  b.textContent = tocando ? '⏸' : '▶';
  b.setAttribute('aria-label', tocando ? 'Pausar' : 'Tocar');
}

function alternarPlay() {
  const p = S.player;
  if (!p) return;
  if (!S.primeiroPlay) { tocarPrimeiraVez(); return; }
  if (p.estado() === 1) p.pausar(); else p.tocar();
}

// ============================================================ tela ligada (7.8)

async function pedirTelaLigada() {
  try {
    if (!('wakeLock' in navigator) || S.telaLigada || document.visibilityState !== 'visible') return;
    S.telaLigada = await navigator.wakeLock.request('screen');
    S.telaLigada.addEventListener('release', () => { S.telaLigada = null; });
  } catch {
    S.telaLigada = null;
  }
}

function soltarTelaLigada() {
  try { S.telaLigada?.release(); } catch { /* nada */ }
  S.telaLigada = null;
}

// ============================================================ laço, relógio e exibição

function iniciarLaco() {
  cancelAnimationFrame(S.raf);
  S.raf = 0;
  if (document.visibilityState !== 'visible' || !S.player) return;
  const quadro = () => {
    S.raf = requestAnimationFrame(quadro);
    try { tique(); } catch (e) { console.error(e); }
  };
  S.raf = requestAnimationFrame(quadro);
}

function tique() {
  const p = S.player;
  if (!p) return;
  const t = p.tempo();
  const st = p.estado();
  if (st === 1) logicaEstudo(t);
  renderLegenda(false);
  const agora = performance.now();
  if (agora - S.ultimoProgresso >= 250) {
    S.ultimoProgresso = agora;
    atualizarProgresso();
  }
  if (st === 1 && agora - S.ultimoSalvamento >= 5000) {
    S.ultimoSalvamento = agora;
    salvarPosicao();
  }
}

function preRolagem() {
  return S.frases ? S.ajustes.preRolagemFrases : S.ajustes.preRolagem;
}

/** Vai para o início de uma unidade, com pré-rolagem. */
function irParaIndice(i, interno = false) {
  const p = S.player;
  const u = S.unidades[i];
  if (!p || !u) return;
  p.irPara(tempoDestino(u, preRolagem()));
  S.saltoEm = performance.now();
  S.alvoNav = i;
  S.falaAtiva = i;
  S.pausadaEm = -1;
  if (!interno) {
    clearTimeout(S.loop.espera);
    S.loop.espera = null;
    S.loop.alvo = S.ajustes.loop ? i : null;
    S.loop.contador = 0;
  }
  renderLegenda(true);
}

/** Pausa automática, loop da fala e trecho A–B (7.5). Só roda com o vídeo tocando. */
function logicaEstudo(t) {
  const U = S.unidades;
  const p = S.player;
  if (!U.length || S.loop.espera) return;
  // Logo depois de um salto o player ainda pode informar o tempo antigo.
  if (performance.now() - S.saltoEm < 300) return;

  let k = indiceLogico(U, t);
  if (S.alvoNav !== null) {
    if (k < S.alvoNav && t >= U[S.alvoNav].s - 1) k = S.alvoNav;
    else S.alvoNav = null;
  }
  const anterior = S.falaAtiva;
  S.falaAtiva = k;

  // Trecho A–B manda sobre o resto.
  if (S.ab.a !== null && S.ab.b !== null) {
    const ini = Math.min(S.ab.a, S.ab.b);
    const fim = Math.max(S.ab.a, S.ab.b);
    const uf = U[fim];
    if (uf && t >= uf.e - 0.05 && t < uf.e + 1) irParaIndice(ini, true);
    return;
  }

  if (S.ajustes.loop) {
    if (k < 0) return;
    if (S.loop.alvo === null || !U[S.loop.alvo]) { S.loop.alvo = k; S.loop.contador = 0; }
    const u = U[S.loop.alvo];
    if (t >= u.e - 0.05 && t < u.e + 1) {
      S.loop.contador++;
      const vezes = S.ajustes.loopVezes || Infinity;
      if (S.loop.contador >= vezes) {
        const alvo = S.loop.alvo;
        S.ajustes.loop = false;
        salvar();
        aplicarAparencia();
        S.loop.alvo = null;
        S.loop.contador = 0;
        if (S.ajustes.pausaAuto) p.pausar();
        S.pausadaEm = alvo;
        S.falaAtiva = alvo;
        return;
      }
      const alvo = S.loop.alvo;
      const pausa = S.ajustes.pausaEntreRepeticoes;
      if (pausa > 0) {
        p.pausar();
        S.loop.espera = setTimeout(() => {
          S.loop.espera = null;
          if (S.player !== p) return;
          irParaIndice(alvo, true);
          p.tocar();
        }, pausa * 1000);
      } else {
        irParaIndice(alvo, true);
      }
    } else if (t > u.e + 1 || t < u.s - 2) {
      S.loop.alvo = null; // o usuário foi para outro ponto
    }
    return;
  }

  if (S.ajustes.pausaAuto) {
    for (const c of [anterior, k]) {
      if (c < 0 || c === S.pausadaEm || !U[c]) continue;
      if (t >= U[c].e - S.ajustes.antecedencia && t < U[c].e + 0.6) {
        p.pausar();
        S.pausadaEm = c;
        S.falaAtiva = c;
        break;
      }
    }
  }
}

/** true se o vídeo está parado logo no fim da fala em que a pausa automática agiu. */
function pausadoNaFala(t) {
  const u = S.unidades[S.pausadaEm];
  return !!u && !S.tocandoLogico && S.player?.estado() !== 1 && t >= u.s && t < u.e + 0.6;
}

function linhaVisivel(qual) {
  return S.ajustes[qual] !== 'oculta';
}

function renderLegenda(forcar) {
  const p = S.player;
  const U = S.unidades;
  let indice = -1;
  let dentro = false;
  if (p && U.length) {
    const t = p.tempo();
    ({ indice, dentro } = falaNoTempo(U, t));
    if (S.alvoNav !== null && U[S.alvoNav] && t < U[S.alvoNav].s && t >= U[S.alvoNav].s - 1) {
      indice = S.alvoNav;
      dentro = true;
    } else if (pausadoNaFala(t)) {
      // Pausado pela pausa automática: continua mostrando a fala que acabou de tocar.
      indice = S.pausadaEm;
      dentro = true;
    }
  }
  const mostrar = dentro ? indice : (S.ajustes.manterUltima ? indice : -1);
  if (indice !== S.destacada) {
    S.destacada = indice;
    lista.destacar(indice);
  }
  if (mostrar === S.exibida && !forcar) return;
  if (mostrar !== S.exibida) {
    S.revelada = { l1: false, l2: false };
    fecharCartao();
  }
  S.exibida = mostrar;
  const u = U[mostrar];
  const a = S.ajustes;
  const t1 = u ? u.texto : '';
  const tocando = S.tocandoLogico;
  const t2 = u && !(a.traducaoSoPausado && tocando) ? u.trad || '' : '';

  // caixa: linha 1 com palavras tocáveis
  const c1 = $('#caixa-l1');
  const c2 = $('#caixa-l2');
  c1.textContent = '';
  if (t1) {
    const partes = t1.split(/(\s+)/);
    for (const parte of partes) {
      if (!parte) continue;
      if (/^\s+$/.test(parte)) { c1.appendChild(document.createTextNode(' ')); continue; }
      const span = document.createElement('span');
      span.className = 'palavra';
      span.textContent = parte;
      c1.appendChild(span);
    }
  }
  c2.textContent = t2;
  c2.hidden = !t2;
  const classe = (el, qual) => {
    const modo = a[qual];
    const revelada = S.revelada[qual === 'linha1' ? 'l1' : 'l2'];
    el.classList.toggle('borrada', modo === 'borrada' && !revelada);
    el.classList.toggle('oculta', modo === 'oculta');
  };
  classe(c1, 'linha1');
  classe(c2, 'linha2');

  // legendas sobre o vídeo
  const s1 = $('#legenda-sobre .l1');
  const s2 = $('#legenda-sobre .l2');
  s1.textContent = linhaVisivel('linha1') ? t1 : '';
  s2.textContent = linhaVisivel('linha2') ? t2 : '';
  classe(s1, 'linha1');
  classe(s2, 'linha2');
}

function atualizarProgresso(forcar = false) {
  const p = S.player;
  if (!p || S.arrastandoBarra) return;
  const dur = p.duracao() || 0;
  const t = p.tempo();
  const barra = $('#barra-progresso');
  if (dur > 0 && (forcar || Number(barra.max) !== dur)) {
    barra.max = String(dur);
    $('#tempo-total').textContent = formatarTempo(dur);
  }
  barra.value = String(Math.min(t, dur || t));
  $('#tempo-atual').textContent = formatarTempo(t);
}

function salvarPosicao() {
  const reg = S.registro;
  const p = S.player;
  if (!reg || !p || !S.pronto) return;
  const t = p.tempo();
  if (!Number.isFinite(t)) return;
  reg.posicao = Math.round(t * 10) / 10;
  salvarVideo(reg);
}

// ============================================================ navegação (7.4)

function direcaoDoArraste(dir) {
  const esquerda = S.ajustes.inverterArraste ? 'avancar' : 'voltar';
  const direita = S.ajustes.inverterArraste ? 'voltar' : 'avancar';
  return dir === 'esquerda' ? esquerda : direita;
}

const TEXTO_RETORNO = { voltar: '◀ Fala anterior', avancar: 'Próxima fala ▶', repetir: '↻ Repetindo' };

function navegarAcao(acao) {
  const p = S.player;
  const U = S.unidades;
  if (!p || !U.length) return;
  const agora = performance.now();
  const t = p.tempo();
  // Depois da pausa automática, a fala de referência é a que acabou de tocar.
  const memoria = pausadoNaFala(t) ? { indice: S.pausadaEm, quando: agora } : S.memoriaNav;
  const r = navegar(U, t, acao, memoria, agora);
  if (r.indice === null) {
    if (r.aviso) mostrarRetorno(r.aviso);
    return;
  }
  S.memoriaNav = { indice: r.indice, quando: agora };
  irParaIndice(r.indice);
  if (S.ajustes.tocarAoNavegar && p.estado() !== 1) {
    if (S.primeiroPlay) p.tocar(); else tocarPrimeiraVez();
  }
  mostrarRetorno(TEXTO_RETORNO[acao]);
  vibrar();
}

function pularSegundos(d) {
  const p = S.player;
  if (!p) return;
  const dur = p.duracao() || Infinity;
  p.irPara(Math.min(dur, Math.max(0, p.tempo() + d)));
  S.saltoEm = performance.now();
  S.memoriaNav = null;
  S.alvoNav = null;
  S.loop.alvo = null;
  S.pausadaEm = -1;
  renderLegenda(true);
  atualizarProgresso();
}

function irParaFalaDaLista(i) {
  if (!S.player) return;
  S.memoriaNav = { indice: i, quando: performance.now() };
  irParaIndice(i);
  if (S.ajustes.tocarAoNavegar && S.player.estado() !== 1) {
    if (S.primeiroPlay) S.player.tocar(); else tocarPrimeiraVez();
  }
}

// ============================================================ estudo: botões

function alternarPausaAuto() {
  S.ajustes.pausaAuto = !S.ajustes.pausaAuto;
  S.pausadaEm = -1;
  salvar();
  aplicarAparencia();
  toast(S.ajustes.pausaAuto ? 'Pausa automática ligada' : 'Pausa automática desligada', 1200);
}

function alternarLoop() {
  S.ajustes.loop = !S.ajustes.loop;
  clearTimeout(S.loop.espera);
  S.loop.espera = null;
  S.loop.alvo = null;
  S.loop.contador = 0;
  salvar();
  aplicarAparencia();
  toast(S.ajustes.loop ? 'Loop da fala ligado' : 'Loop da fala desligado', 1200);
}

function ciclarLinha(qual) {
  const ordem = ['visivel', 'borrada', 'oculta'];
  S.ajustes[qual] = ordem[(ordem.indexOf(S.ajustes[qual]) + 1) % 3];
  S.revelada = { l1: false, l2: false };
  salvar();
  aplicarAparencia();
  renderLegenda(true);
}

function montarMenuVelocidade() {
  const menu = $('#menu-velocidade');
  menu.textContent = '';
  const vels = S.player ? S.player.velocidades() : [1];
  for (const v of vels) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (Math.abs(v - S.velConfirmada) < 1e-6 ? ' confirmada' : '');
    b.textContent = `${formatarNumero(v)}×`;
    b.setAttribute('role', 'menuitem');
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      S.velPedida = { v, quando: performance.now() };
      S.player?.definirVelocidade(v);
      menu.hidden = true;
    });
    menu.appendChild(b);
  }
}

function mudarVelocidadePasso(passo) {
  const p = S.player;
  if (!p) return;
  const vels = p.velocidades().slice().sort((a, b) => a - b);
  // Toques rápidos seguidos partem do último valor pedido (a confirmação do player chega depois).
  const base = S.velPedida && performance.now() - S.velPedida.quando < 1500 ? S.velPedida.v : S.velConfirmada;
  let i = vels.findIndex((v) => Math.abs(v - base) < 1e-6);
  if (i < 0) i = vels.indexOf(1);
  const j = Math.min(vels.length - 1, Math.max(0, i + passo));
  if (j !== i) {
    S.velPedida = { v: vels[j], quando: performance.now() };
    p.definirVelocidade(vels[j]);
    toast(`Velocidade ${formatarNumero(vels[j])}×`, 1000);
  }
}

// ============================================================ A–B

function atualizarAB() {
  const { a, b } = S.ab;
  const U = S.unidades;
  const partes = [];
  if (a !== null && U[a]) partes.push(`A em ${formatarTempo(U[a].s)}`);
  if (b !== null && U[b]) partes.push(`B em ${formatarTempo(U[b].s)}`);
  $('#info-ab').textContent = partes.join(' · ');
  $('#btn-limpar-ab').hidden = a === null && b === null;
  lista.marcarAB(a, b);
}

function marcarAB(qual) {
  const i = S.exibida >= 0 ? S.exibida : S.destacada;
  if (i < 0 || !S.unidades[i]) { toast('Toque numa fala da lista primeiro.'); return; }
  S.ab[qual] = i;
  if (S.ab.a !== null && S.ab.b !== null && S.ab.a > S.ab.b) S.ab = { a: S.ab.b, b: S.ab.a };
  atualizarAB();
  if (S.ab.a !== null && S.ab.b !== null) toast('Repetindo o trecho de A até B.');
}

// ============================================================ cartão da palavra (9.3)

function urlTradutor(texto) {
  const sl = S.ajustes.idioma || 'auto';
  return `https://translate.google.com/?sl=${sl}&tl=pt&text=${encodeURIComponent(texto)}&op=translate`;
}

let palavraAtual = '';
let fraseAtual = '';

function abrirCartao(span) {
  const palavra = limparPalavra(span.textContent);
  if (!palavra) return;
  S.player?.pausar();
  palavraAtual = palavra;
  fraseAtual = S.unidades[S.exibida]?.texto || '';
  $$('.palavra.tocada').forEach((e) => e.classList.remove('tocada'));
  span.classList.add('tocada');
  $('#cp-palavra').textContent = palavra;
  $('#cp-traduzir-palavra').href = urlTradutor(palavra);
  $('#cp-traduzir-frase').href = urlTradutor(fraseAtual);
  const cartao = $('#cartao-palavra');
  cartao.hidden = false;
  const caixa = $('#caixa-legenda').getBoundingClientRect();
  const alt = cartao.offsetHeight;
  const meiaLargura = cartao.offsetWidth / 2;
  const centro = Math.min(window.innerWidth - meiaLargura - 10, Math.max(meiaLargura + 10, caixa.left + caixa.width / 2));
  cartao.style.left = `${centro}px`;
  let top = caixa.top - alt - 8;
  if (top < 8) top = Math.min(window.innerHeight - alt - 8, caixa.bottom + 8);
  cartao.style.top = `${Math.max(8, top)}px`;
}

function fecharCartao() {
  const c = $('#cartao-palavra');
  if (!c || c.hidden) return;
  c.hidden = true;
  $$('.palavra.tocada').forEach((e) => e.classList.remove('tocada'));
}

async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    toast('Copiado.', 1200);
  } catch {
    toast('Não consegui copiar.');
  }
}

// ============================================================ gestos

function toqueNoVideo() {
  if (document.body.classList.contains('imersivo') && !document.body.classList.contains('faixa-visivel')) {
    mostrarFaixa();
    return;
  }
  alternarPlay();
  if (document.body.classList.contains('imersivo')) mostrarFaixa();
}

function toqueNaCaixa(alvo) {
  if (!(alvo instanceof Element)) return;
  const linha = alvo.closest('.linha');
  if (!linha) return;
  if (linha.classList.contains('borrada')) {
    S.revelada[linha.id === 'caixa-l1' ? 'l1' : 'l2'] = true;
    renderLegenda(true);
    return;
  }
  if (alvo.classList.contains('palavra') && linha.id === 'caixa-l1') abrirCartao(alvo);
}

// ============================================================ tela cheia e modo deitado (8.3)

const mqDeitado = window.matchMedia('(orientation: landscape) and (max-height: 600px) and (pointer: coarse)');

function atualizarImersivo() {
  const assistindo = !$('#tela-assistir').hidden;
  const im = assistindo && (!!document.fullscreenElement || mqDeitado.matches);
  const antes = document.body.classList.contains('imersivo');
  document.body.classList.toggle('imersivo', im);
  if (!im) document.body.classList.remove('lista-aberta', 'faixa-visivel');
  if (im && !antes) mostrarFaixa();
}

function mostrarFaixa() {
  document.body.classList.add('faixa-visivel');
  clearTimeout(S.timerFaixa);
  if (S.tocandoLogico) {
    S.timerFaixa = setTimeout(() => {
      if (S.tocandoLogico) document.body.classList.remove('faixa-visivel');
    }, 3000);
  }
}

async function alternarTelaCheia() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    // A página inteira vai para tela cheia: vídeo, legendas, ajustes e avisos continuam visíveis.
    await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    try { await screen.orientation.lock('landscape'); } catch { /* nada */ }
  } catch {
    toast('Tela cheia não disponível neste navegador.');
  }
}

// ============================================================ lista de falas (8.2)

const TAMANHO_BLOCO = 50;
const LIMITE_VIRTUAL = 500;

class ListaFalas {
  constructor(container, aoTocar) {
    this.c = container;
    this.aoTocar = aoTocar;
    this.unidades = [];
    this.norm = [];
    this.indices = [];
    this.posicao = new Map();
    this.itens = new Map();
    this.blocos = [];
    this.atual = -1;
    this.seguir = true;
    this.timerSeguir = null;
    this.programaticoAte = 0;
    this.usuarioAte = 0;
    this.ab = { a: null, b: null };
    this.obs = null;
    this.alturaItem = 60;

    container.addEventListener('click', (ev) => {
      const item = ev.target.closest('.item-fala');
      if (item) this.aoTocar(Number(item.dataset.i));
    });
    const marcarUsuario = () => { this.usuarioAte = performance.now() + 1200; };
    container.addEventListener('wheel', marcarUsuario, { passive: true });
    container.addEventListener('touchmove', marcarUsuario, { passive: true });
    container.addEventListener('keydown', marcarUsuario);
    container.addEventListener('pointerdown', (ev) => { if (ev.pointerType === 'mouse') marcarUsuario(); });
    container.addEventListener('scroll', () => {
      const agora = performance.now();
      if (agora < this.usuarioAte && agora > this.programaticoAte) this.pausarSeguir();
    }, { passive: true });
  }

  definir(unidades) {
    this.unidades = unidades;
    this.norm = unidades.map((u) => normalizar(`${u.texto} ${u.trad || ''}`));
    this.atual = -1;
    this.mostrar(unidades.map((u) => u.i));
  }

  filtrar(termo) {
    const t = normalizar(termo.trim());
    if (!t) { this.mostrar(this.unidades.map((u) => u.i)); return; }
    const r = [];
    for (let i = 0; i < this.norm.length; i++) if (this.norm[i].includes(t)) r.push(i);
    this.mostrar(r);
  }

  mostrar(indices) {
    this.obs?.disconnect();
    this.indices = indices;
    this.posicao = new Map(indices.map((i, p) => [i, p]));
    this.itens.clear();
    this.blocos = [];
    this.c.textContent = '';
    if (!indices.length) {
      if (this.unidades.length) {
        const vazio = document.createElement('p');
        vazio.className = 'lista-sem-resultado';
        vazio.textContent = 'Nenhuma fala encontrada.';
        this.c.appendChild(vazio);
      }
      return;
    }
    const virtual = indices.length > LIMITE_VIRTUAL;
    if (virtual) {
      this.obs = new IntersectionObserver((entradas) => {
        for (const en of entradas) {
          const b = this.blocos[Number(en.target.dataset.b)];
          if (en.isIntersecting) this.desenharBloco(b); else this.esvaziarBloco(b);
        }
      }, { root: this.c, rootMargin: '900px 0px' });
    }
    for (let p = 0, n = 0; p < indices.length; p += TAMANHO_BLOCO, n++) {
      const el = document.createElement('div');
      el.className = 'bloco-falas';
      el.dataset.b = String(n);
      const bloco = { el, de: p, ate: Math.min(indices.length, p + TAMANHO_BLOCO), desenhado: false, altura: 0 };
      this.blocos.push(bloco);
      this.c.appendChild(el);
      if (virtual) {
        el.style.height = `${(bloco.ate - bloco.de) * this.alturaItem}px`;
        this.obs.observe(el);
      } else {
        this.desenharBloco(bloco);
      }
    }
  }

  criarItem(i) {
    const u = this.unidades[i];
    const item = document.createElement('div');
    item.className = 'item-fala';
    item.setAttribute('role', 'listitem');
    item.dataset.i = String(i);
    const t = document.createElement('span');
    t.className = 't';
    t.textContent = formatarTempo(u.s);
    const textos = document.createElement('div');
    const a = document.createElement('div');
    a.className = 'a';
    a.textContent = u.texto;
    textos.appendChild(a);
    if (u.trad) {
      const b = document.createElement('div');
      b.className = 'b';
      b.textContent = u.trad;
      textos.appendChild(b);
    }
    item.append(t, textos);
    this.classesItem(item, i);
    return item;
  }

  classesItem(item, i) {
    const { a, b } = this.ab;
    item.classList.toggle('atual', i === this.atual);
    item.classList.toggle('marca-a', i === a);
    item.classList.toggle('marca-b', i === b);
    item.classList.toggle('no-ab', a !== null && b !== null && i >= a && i <= b);
  }

  desenharBloco(b) {
    if (!b || b.desenhado) return;
    const frag = document.createDocumentFragment();
    for (let p = b.de; p < b.ate; p++) {
      const i = this.indices[p];
      const item = this.criarItem(i);
      this.itens.set(i, item);
      frag.appendChild(item);
    }
    b.el.textContent = '';
    b.el.style.height = '';
    b.el.appendChild(frag);
    b.desenhado = true;
    b.altura = b.el.offsetHeight;
    if (b.altura) this.alturaItem = Math.max(40, b.altura / (b.ate - b.de));
  }

  esvaziarBloco(b) {
    if (!b || !b.desenhado) return;
    b.altura = b.el.offsetHeight || b.altura;
    for (let p = b.de; p < b.ate; p++) this.itens.delete(this.indices[p]);
    b.el.textContent = '';
    b.el.style.height = `${b.altura}px`;
    b.desenhado = false;
  }

  destacar(i) {
    const antes = this.itens.get(this.atual);
    if (antes) antes.classList.remove('atual');
    this.atual = i;
    const el = this.itens.get(i);
    if (el) el.classList.add('atual');
    if (this.seguir && i >= 0) this.centralizar(i);
  }

  centralizar(i, suave = true) {
    const p = this.posicao.get(i);
    if (p === undefined) return;
    this.desenharBloco(this.blocos[Math.floor(p / TAMANHO_BLOCO)]);
    const el = this.itens.get(i);
    if (!el) return;
    const rc = this.c.getBoundingClientRect();
    const re = el.getBoundingClientRect();
    const alvo = this.c.scrollTop + (re.top - rc.top) - this.c.clientHeight / 2 + re.height / 2;
    const distancia = Math.abs(this.c.scrollTop - alvo);
    this.programaticoAte = performance.now() + 900;
    this.c.scrollTo({ top: Math.max(0, alvo), behavior: suave && distancia < 1500 ? 'smooth' : 'auto' });
  }

  pausarSeguir() {
    this.seguir = false;
    $('#btn-fala-atual').hidden = false;
    clearTimeout(this.timerSeguir);
    this.timerSeguir = setTimeout(() => this.retomarSeguir(), 5000);
  }

  retomarSeguir() {
    clearTimeout(this.timerSeguir);
    this.seguir = true;
    $('#btn-fala-atual').hidden = true;
    if (this.atual >= 0) this.centralizar(this.atual);
  }

  marcarAB(a, b) {
    this.ab = { a, b };
    for (const [i, el] of this.itens) this.classesItem(el, i);
  }
}

const lista = new ListaFalas($('#lista-falas'), irParaFalaDaLista);

// ============================================================ painel de ajustes

function mostrarValor(chave) {
  const el = document.querySelector(`[data-mostra="${chave}"]`);
  if (!el) return;
  const v = S.ajustes[chave];
  if (chave.startsWith('fonte')) el.textContent = `${v} px`;
  else if (chave === 'opacidadeFundo') el.textContent = `${v}%`;
  else el.textContent = seg(v);
}

function sincronizarPainel() {
  for (const el of $$('[data-ajuste]')) {
    const k = el.dataset.ajuste;
    const v = S.ajustes[k];
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = String(v);
    mostrarValor(k);
  }
  const reg = S.registro;
  $('#grupo-sincronia').hidden = !reg;
  if (reg) {
    for (const bloco of $$('.ajuste-sinc')) {
      const alvo = bloco.dataset.alvo;
      const v = reg[alvo] || 0;
      bloco.querySelector('.valor-sinc').textContent = `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatarNumero(Math.abs(v), 1)} s`;
      if (alvo === 'ajusteTraducao') bloco.hidden = !reg.traducao;
    }
  }
}

function abrirPainel(id) {
  fecharPaineis();
  if (id === '#painel-ajustes') sincronizarPainel();
  $('#fundo-painel').hidden = false;
  $(id).hidden = false;
}

function fecharPaineis() {
  $('#fundo-painel').hidden = true;
  $('#painel-ajustes').hidden = true;
  $('#ajuda').hidden = true;
}

function aoMudarAjuste(el) {
  const k = el.dataset.ajuste;
  let v;
  if (el.type === 'checkbox') v = el.checked;
  else if (el.type === 'range' || el.hasAttribute('data-numero')) v = Number(el.value);
  else v = el.value;
  S.ajustes[k] = v;
  salvar();
  mostrarValor(k);
  aplicarAparencia();
  if (k === 'modoFrases' || k === 'esconderMarcacoes') reprocessar();
  else renderLegenda(true);
}

async function restaurarPadroes() {
  const r = await dialogo({ texto: 'Voltar todos os ajustes para o padrão?', ok: 'Restaurar' });
  if (!r.ok) return;
  const modoAntes = S.ajustes.modoFrases;
  const marcAntes = S.ajustes.esconderMarcacoes;
  S.ajustes = { ...AJUSTES_PADRAO };
  salvar();
  aplicarAparencia();
  sincronizarPainel();
  if (S.ajustes.modoFrases !== modoAntes || S.ajustes.esconderMarcacoes !== marcAntes) reprocessar();
  else renderLegenda(true);
  aplicarVelocidadeSalva();
  toast('Ajustes restaurados.');
}

function ajustarSincronia(alvo, d) {
  const reg = S.registro;
  if (!reg) return;
  reg[alvo] = d === 'zerar' ? 0 : Math.round(((reg[alvo] || 0) + Number(d)) * 10) / 10;
  salvarVideo(reg);
  reprocessar();
  sincronizarPainel();
}

// ============================================================ teclado (10.3)

function aoTeclar(ev) {
  if ($('#tela-assistir').hidden || !S.player) return;
  if (!$('#dialogo').hidden) return;
  if (ev.key === 'Escape') {
    fecharCartao();
    $('#menu-velocidade').hidden = true;
    fecharPaineis();
    document.body.classList.remove('lista-aberta');
    return;
  }
  const alvo = ev.target;
  if (alvo instanceof HTMLElement) {
    const campoTexto = alvo.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes(alvo.type);
    if (alvo.isContentEditable || campoTexto || ['TEXTAREA', 'SELECT'].includes(alvo.tagName)) return;
    if (alvo.id === 'barra-progresso') alvo.blur(); // atalhos valem mesmo depois de mexer na barra
  }
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
  const k = ev.key;
  // Espaço num botão focado ativaria o botão: tira o foco e usa como tocar/pausar.
  if ((k === ' ' || ev.code === 'Space') && alvo instanceof HTMLElement && alvo.tagName === 'BUTTON') alvo.blur();
  let feito = true;
  if (k === ' ' || ev.code === 'Space') alternarPlay();
  else if (k === 'ArrowLeft') ev.shiftKey ? pularSegundos(-5) : navegarAcao('voltar');
  else if (k === 'ArrowRight') ev.shiftKey ? pularSegundos(5) : navegarAcao('avancar');
  else if (k === 'r' || k === 'R' || k === 'ArrowDown') navegarAcao('repetir');
  else if (k === 'p' || k === 'P') alternarPausaAuto();
  else if (k === 'l' || k === 'L') alternarLoop();
  else if (k === '1') ciclarLinha('linha1');
  else if (k === '2') ciclarLinha('linha2');
  else if (k === '[') mudarVelocidadePasso(-1);
  else if (k === ']') mudarVelocidadePasso(1);
  else if (k === 'f' || k === 'F') alternarTelaCheia();
  else feito = false;
  if (feito) ev.preventDefault();
}

// ============================================================ compartilhar do app do YouTube (5.1)

function lerCompartilhamento() {
  const p = new URLSearchParams(location.search);
  const texto = ['title', 'text', 'url'].map((k) => p.get(k) || '').join(' ').trim();
  if (!texto) return;
  const link = lerLink(texto);
  const limpo = new URLSearchParams();
  if (p.get('mock')) limpo.set('mock', p.get('mock'));
  if (p.get('mockErro')) limpo.set('mockErro', p.get('mockErro'));
  const q = limpo.toString();
  history.replaceState(null, '', location.pathname + (q ? `?${q}` : '') + '#biblioteca');
  if (!link) {
    toast(MSG_LINK_INVALIDO);
    return;
  }
  $('#campo-link').value = `https://www.youtube.com/watch?v=${link.videoId}${link.inicioSeg ? `&t=${link.inicioSeg}s` : ''}`;
  const msg = $('#msg-link');
  msg.textContent = 'Link recebido. Agora escolha os arquivos de legenda.';
  msg.className = 'msg msg-alerta';
  validarFormulario();
}

// ============================================================ ligar tudo

function ligarEventos() {
  // biblioteca
  $('#campo-link').addEventListener('input', validarFormulario);
  $('#btn-colar').addEventListener('click', colar);
  $('#arq-estudo').addEventListener('change', (ev) => { receberArquivos(ev.target.files, 'estudo'); ev.target.value = ''; });
  $('#arq-traducao').addEventListener('change', (ev) => { receberArquivos(ev.target.files, 'traducao'); ev.target.value = ''; });
  $('#btn-trocar-papeis').addEventListener('click', trocarPapeis);
  $('#btn-abrir').addEventListener('click', abrirDoFormulario);
  const zona = $('#zona-arquivos');
  zona.addEventListener('dragover', (ev) => { ev.preventDefault(); zona.classList.add('arrastando'); });
  zona.addEventListener('dragleave', () => zona.classList.remove('arrastando'));
  zona.addEventListener('drop', (ev) => {
    ev.preventDefault();
    zona.classList.remove('arrastando');
    receberArquivos(ev.dataTransfer?.files, null);
  });
  $('#btn-exportar').addEventListener('click', exportar);
  $('#btn-importar').addEventListener('click', importar);
  $('#arq-importar').addEventListener('change', (ev) => { aoEscolherBackup(ev.target.files?.[0]); ev.target.value = ''; });
  $('#btn-ajuda').addEventListener('click', () => abrirPainel('#ajuda'));
  $('#btn-fechar-ajuda').addEventListener('click', fecharPaineis);
  document.addEventListener('click', (ev) => {
    if (!ev.target.closest?.('.menu-item')) fecharMenusItens();
    if (!ev.target.closest?.('#menu-velocidade, #btn-velocidade')) $('#menu-velocidade').hidden = true;
  });
  document.addEventListener('pointerdown', (ev) => {
    const c = $('#cartao-palavra');
    if (!c.hidden && !ev.target.closest?.('#cartao-palavra') && !ev.target.closest?.('.palavra')) fecharCartao();
  });

  // assistir
  $('#btn-voltar').addEventListener('click', voltarParaBiblioteca);
  $('#btn-tocar-grande').addEventListener('click', tocarPrimeiraVez);
  $('#btn-play').addEventListener('click', alternarPlay);
  $('#btn-anterior').addEventListener('click', () => navegarAcao('voltar'));
  $('#btn-proxima').addEventListener('click', () => navegarAcao('avancar'));
  $('#btn-repetir').addEventListener('click', () => navegarAcao('repetir'));
  $('#btn-menos5').addEventListener('click', () => pularSegundos(-5));
  $('#btn-mais5').addEventListener('click', () => pularSegundos(5));
  $('#btn-pausa-auto').addEventListener('click', alternarPausaAuto);
  $('#btn-loop').addEventListener('click', alternarLoop);
  $('#btn-linha1').addEventListener('click', () => ciclarLinha('linha1'));
  $('#btn-linha2').addEventListener('click', () => ciclarLinha('linha2'));
  $('#btn-velocidade').addEventListener('click', () => {
    const menu = $('#menu-velocidade');
    if (menu.hidden) { montarMenuVelocidade(); menu.hidden = false; } else menu.hidden = true;
  });
  $('#btn-tela-cheia').addEventListener('click', alternarTelaCheia);
  $('#btn-ajustes').addEventListener('click', () => abrirPainel('#painel-ajustes'));
  $('#btn-fechar-ajustes').addEventListener('click', fecharPaineis);
  $('#fundo-painel').addEventListener('click', fecharPaineis);
  $('#btn-lista').addEventListener('click', () => {
    document.body.classList.toggle('lista-aberta');
    if (lista.atual >= 0) lista.centralizar(lista.atual, false);
  });
  $('#btn-fechar-lista').addEventListener('click', () => document.body.classList.remove('lista-aberta'));
  $('#busca-falas').addEventListener('input', (ev) => {
    lista.filtrar(ev.target.value);
    if (!ev.target.value && lista.atual >= 0) lista.centralizar(lista.atual, false);
  });
  $('#btn-fala-atual').addEventListener('click', () => lista.retomarSeguir());
  $('#btn-a').addEventListener('click', () => marcarAB('a'));
  $('#btn-b').addEventListener('click', () => marcarAB('b'));
  $('#btn-limpar-ab').addEventListener('click', () => { S.ab = { a: null, b: null }; atualizarAB(); });

  // barra de progresso
  const barra = $('#barra-progresso');
  barra.addEventListener('input', () => {
    S.arrastandoBarra = true;
    const x = Number(barra.value);
    S.player?.irPara(x, false);
    $('#tempo-atual').textContent = formatarTempo(x);
  });
  barra.addEventListener('change', () => {
    const x = Number(barra.value);
    S.player?.irPara(x, true);
    S.arrastandoBarra = false;
    barra.blur();
    S.memoriaNav = null;
    S.alvoNav = null;
    S.loop.alvo = null;
    S.pausadaEm = -1;
    renderLegenda(true);
  });

  // tela cheia ou deitado: tocar na faixa mantém ela visível por mais 3 s
  for (const sel of ['#faixa', '#barra-topo']) {
    $(sel).addEventListener('pointerdown', () => {
      if (document.body.classList.contains('imersivo')) mostrarFaixa();
    });
  }

  // cartão da palavra
  $('#cp-fechar').addEventListener('click', fecharCartao);
  $('#cp-copiar-palavra').addEventListener('click', () => copiar(palavraAtual));
  $('#cp-copiar-frase').addEventListener('click', () => copiar(fraseAtual));

  // gestos
  ligarGestos($('#camada-gestos'), {
    arrastar: (dir) => navegarAcao(direcaoDoArraste(dir)),
    toque: () => toqueNoVideo(),
    segurar: () => navegarAcao('repetir'),
  });
  ligarGestos($('#caixa-legenda'), {
    arrastar: (dir) => navegarAcao(direcaoDoArraste(dir)),
    toque: (alvo) => toqueNaCaixa(alvo),
  });

  // ajustes
  for (const el of $$('[data-ajuste]')) {
    el.addEventListener(el.type === 'range' ? 'input' : 'change', () => aoMudarAjuste(el));
  }
  for (const bloco of $$('.ajuste-sinc')) {
    bloco.addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-d]');
      if (b) ajustarSincronia(bloco.dataset.alvo, b.dataset.d);
    });
  }
  $('#btn-restaurar').addEventListener('click', restaurarPadroes);

  // sistema
  document.addEventListener('keydown', aoTeclar);
  window.addEventListener('hashchange', rota);
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
      try { screen.orientation.unlock(); } catch { /* nada */ }
    }
    atualizarImersivo();
  });
  mqDeitado.addEventListener?.('change', atualizarImersivo);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      salvarPosicao();
      cancelAnimationFrame(S.raf);
      S.raf = 0;
    } else {
      if (S.player) iniciarLaco();
      if (S.player?.estado() === 1) pedirTelaLigada();
    }
  });
  window.addEventListener('pagehide', salvarPosicao);
}

async function iniciar() {
  aplicarAparencia();
  ligarEventos();
  lerCompartilhamento();
  if (location.hash === '#assistir' || !location.hash) {
    history.replaceState(null, '', location.pathname + location.search + '#biblioteca');
  }
  mostrarBiblioteca();
  await renderBiblioteca();
  if (await estaSoNaMemoria()) $('#aviso-memoria').hidden = false;
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  if (MOCK) {
    window.__ld = {
      S,
      lista,
      tempo: () => S.player?.tempo(),
      estado: () => S.player?.estado(),
    };
  }
}

iniciar();
