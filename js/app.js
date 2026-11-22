// app.js — estado, telas, eventos. Liga legendas, tradução, player, gestos e armazenamento.
// PLANO.md seções 7 a 11 e 15 (interface enxuta e tradução automática, 22/11/2026).

import {
  tituloDoArquivo, chaveTitulo, titulosParecidos, lerLink, lerArquivoLegenda, lerArquivoLegendaDupla, sugerirPapeis,
  processar, falaNoTempo, navegar, tempoDestino, limparPalavra, formatarTempo, formatarNumero, LIMITE_BYTES,
  MSG_LINK_INVALIDO,
} from './legendas.js';
import { textosPendentes, aplicarMapa, traduzirTodos, NOMES_IDIOMA } from './traducao.js';
import { criarPlayer, MSG_API } from './player.js';
import { ligarGestos } from './gestos.js';
import {
  carregarAjustes, salvarAjustes, salvarVideo, obterVideo, listarVideos,
  apagarVideo, montarBackup, importarBackup, estaSoNaMemoria,
} from './armazenamento.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const MOCK = new URLSearchParams(location.search).get('mock') === '1';

// Valores fixos (antes eram ajustes; saíram do menu para deixá-lo simples).
const PRE_ROLAGEM = 0.15; // segundos antes do início da fala, ao navegar
const PRE_ROLAGEM_FRASES = 0.3;
const OPCOES_PROCESSAR = { modoFrases: 'auto', esconderMarcacoes: false };

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
  inicio: 0,
  exibida: -2, // índice mostrado na caixa
  exibidaTrad: null,
  memoriaNav: null,
  alvoNav: null,
  saltoEm: 0,
  loop: { ligado: false, alvo: null }, // loop da fala atual
  ab: { a: null, b: null }, // trecho A–B (índices das falas)
  marcandoAB: null, // null | 'a' | 'b': o próximo toque na legenda marca esse ponto
  velConfirmada: 1,
  velPedida: null,
  tocandoLogico: false, // 1, ou 3 (carregando) logo depois de 1
  ajustouVelInicio: false,
  tituloConferido: false,
  raf: 0,
  ultimoProgresso: 0,
  ultimoSalvamento: 0,
  arrastandoBarra: false,
  telaLigada: null,
  timerFaixa: null,
  vindoDaBiblioteca: false,
  // tradução automática
  trad: { estado: 'ocioso', feitos: 0, total: 0, controle: null },
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
  const raiz = document.documentElement.style;
  const f = S.ajustes.fonteL1;
  raiz.setProperty('--fonte-l1', `${f}px`);
  raiz.setProperty('--fonte-l2', `${Math.round(f * 0.85)}px`);
}

function salvar() {
  salvarAjustes(S.ajustes);
}

// ============================================================ biblioteca: formulário

function textoSemTraducao() {
  const d = S.ajustes.destino;
  return d === 'nao' ? 'Nenhum arquivo escolhido.' : `Sem arquivo: o app traduz sozinho para o ${NOMES_IDIOMA[d]}.`;
}

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
  if (e) {
    const n = e.falas.length;
    const parte = e.dupla ? (papel === 'estudo' ? ' (idioma estudado)' : ' (tradução)') : '';
    el.textContent = `${e.arquivo}${parte} — ${n.toLocaleString('pt-BR')} ${n === 1 ? 'fala lida' : 'falas lidas'}`;
    el.className = 'info-arquivo ok';
  } else {
    el.textContent = papel === 'traducao' && S.escolha.estudo ? textoSemTraducao() : 'Nenhum arquivo escolhido.';
    el.className = 'info-arquivo';
  }
}

function mostrarErroArquivo(papel, arquivo, erro) {
  const el = $(papel === 'estudo' ? '#info-estudo' : '#info-traducao');
  el.textContent = `${arquivo}: ${erro}`;
  el.className = 'info-arquivo erro';
}

async function lerArquivo(file, dupla = false) {
  if (file.size > LIMITE_BYTES) return { arquivo: file.name, erro: 'Arquivo grande demais (limite de 5 MB).' };
  try {
    const buf = await file.arrayBuffer();
    if (dupla) {
      const r = lerArquivoLegendaDupla(buf);
      if (r.erro) return { arquivo: file.name, erro: r.erro };
      return { arquivo: file.name, estudo: r.estudo, traducao: r.traducao };
    }
    const r = lerArquivoLegenda(buf);
    if (r.erro) return { arquivo: file.name, erro: r.erro };
    return { arquivo: file.name, falas: r.falas };
  } catch {
    return { arquivo: file.name, erro: 'Não consegui ler esse arquivo.' };
  }
}

function definirEscolha(papel, r) {
  S.escolha[papel] = r && !r.erro ? { arquivo: r.arquivo, falas: r.falas } : null;
  mostrarEscolha(papel);
  if (r?.erro) mostrarErroArquivo(papel, r.arquivo, r.erro);
}

function mostrarAmbas() {
  mostrarEscolha('estudo');
  mostrarEscolha('traducao');
}

async function receberArquivos(lista, papel) {
  const arquivos = Array.from(lista || []);
  if (!arquivos.length) return;
  if (arquivos.length > 2) toast('Escolha no máximo dois arquivos. Usei os dois primeiros.');
  if (arquivos.length >= 2) {
    const dois = arquivos.slice(0, 2);
    const papeis = sugerirPapeis(dois.map((f) => f.name));
    const lidos = await Promise.all(dois.map((f) => lerArquivo(f)));
    definirEscolha('estudo', lidos[papeis.estudo]);
    definirEscolha('traducao', lidos[papeis.traducao]);
    toast('Confira os dois arquivos. Se estiverem trocados, toque em ⇅ Trocar.');
  } else {
    const alvo = papel || (S.escolha.estudo ? 'traducao' : 'estudo');
    // Um arquivo da legenda dupla estava escolhido: trocar uma parte desfaz o par.
    for (const k of ['estudo', 'traducao']) if (S.escolha[k]?.dupla) S.escolha[k].dupla = false;
    definirEscolha(alvo, await lerArquivo(arquivos[0]));
    if (alvo === 'estudo' && !S.escolha.traducao) mostrarEscolha('traducao');
  }
  validarFormulario();
  await preencherLinkAutomatico();
}

async function receberDupla(lista) {
  const file = Array.from(lista || [])[0];
  if (!file) return;
  const r = await lerArquivo(file, true);
  if (r.erro) {
    S.escolha = { estudo: null, traducao: null };
    mostrarAmbas();
    mostrarErroArquivo('estudo', r.arquivo, r.erro);
    validarFormulario();
    return;
  }
  S.escolha.estudo = { arquivo: r.arquivo, falas: r.estudo, dupla: true };
  S.escolha.traducao = { arquivo: r.arquivo, falas: r.traducao, dupla: true };
  mostrarAmbas();
  toast('Legenda dupla separada nos dois idiomas. Se ficaram trocados, toque em ⇅ Trocar.', 3500);
  validarFormulario();
  await preencherLinkAutomatico();
}

/** Link de um vídeo no formato que o campo mostra. */
function linkDoVideo(id, inicioSeg = 0) {
  return `https://www.youtube.com/watch?v=${id}${inicioSeg ? `&t=${inicioSeg}s` : ''}`;
}

function avisarLink(texto, tipo = 'msg-alerta') {
  const msg = $('#msg-link');
  msg.textContent = texto;
  msg.className = `msg ${tipo}`;
}

/**
 * Sem link no campo: 1) procura na biblioteca um vídeo com o mesmo título do arquivo;
 * 2) usa o link que estiver copiado (o mesmo que foi colado no DownSub).
 */
async function preencherLinkAutomatico() {
  if (lerLink($('#campo-link').value)) return;
  const nome = S.escolha.estudo?.arquivo || S.escolha.traducao?.arquivo;
  if (!nome) return;
  const chave = chaveTitulo(tituloDoArquivo(nome));
  if (chave) {
    const videos = await listarVideos();
    const bate = (c) => c && chaveTitulo(c) === chave;
    // Primeiro pelo nome dos arquivos já usados; se não decidir, pelo título do vídeo.
    let achados = videos.filter((v) => bate(tituloDoArquivo(v.estudo?.arquivo)) || bate(tituloDoArquivo(v.traducao?.arquivo)));
    if (achados.length !== 1) achados = videos.filter((v) => bate(v.titulo));
    if (achados.length === 1) {
      const v = achados[0];
      $('#campo-link').value = linkDoVideo(v.id);
      avisarLink(`Link preenchido: é o vídeo “${v.titulo || 'Vídeo ' + v.id}” da sua biblioteca.`);
      validarFormulario();
      return;
    }
  }
  try {
    const link = lerLink(await navigator.clipboard.readText());
    if (link) {
      $('#campo-link').value = linkDoVideo(link.videoId, link.inicioSeg);
      avisarLink('Link pego do que você copiou no YouTube. Ao abrir, o app confere se o título bate com as legendas.');
      validarFormulario();
      return;
    }
  } catch { /* sem permissão ou sem texto copiado */ }
  if (!$('#msg-link').textContent) avisarLink('Agora cole o link do vídeo (botão Colar).');
}

function trocarPapeis() {
  const { estudo, traducao } = S.escolha;
  S.escolha.estudo = traducao;
  S.escolha.traducao = estudo;
  mostrarAmbas();
  validarFormulario();
}

function limparFormulario() {
  $('#campo-link').value = '';
  S.escolha = { estudo: null, traducao: null };
  mostrarAmbas();
  $('#msg-link').textContent = '';
  $('#msg-link').className = 'msg';
  validarFormulario();
}

async function abrirDoFormulario() {
  const link = lerLink($('#campo-link').value);
  if (!link || !S.escolha.estudo) return;
  const existente = await obterVideo(link.videoId);
  const agora = new Date().toISOString();
  const so = (e) => (e ? { arquivo: e.arquivo, falas: e.falas } : null);
  const estudo = so(S.escolha.estudo);
  const reg = {
    id: link.videoId,
    titulo: existente?.titulo || '',
    criadoEm: existente?.criadoEm || agora,
    abertoEm: agora,
    posicao: existente?.posicao || 0,
    estudo,
    traducao: so(S.escolha.traducao),
    ajusteEstudo: 0,
    ajusteTraducao: 0,
    // A tradução automática já feita continua valendo se a legenda estudada for a mesma.
    traducaoAuto: existente?.traducaoAuto && existente.estudo?.arquivo === estudo.arquivo ? existente.traducaoAuto : null,
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
  document.body.classList.remove('imersivo', 'faixa-visivel');
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
    OPCOES_PROCESSAR,
  );
  S.unidades = r.unidades;
  S.frases = r.frases;
  S.automatica = r.automatica;
  S.memoriaNav = null;
  S.alvoNav = null;
  if (S.ab.a !== null || S.loop.alvo !== null) zerarRepeticao(); // os índices das falas mudaram
  if (traducaoAutomaticaAtiva()) {
    aplicarMapa(S.unidades, mapaDaTraducao());
    iniciarTraducaoAuto();
  } else {
    cancelarTraducaoAuto();
  }
  S.exibida = -2;
  renderLegenda(true);
  atualizarAviso();
}

async function abrirVideo(reg, inicio) {
  if (S.player) encerrarPlayer();
  clearTimeout(timerToast);
  $('#toast').hidden = true;
  S.registro = reg;
  S.inicio = inicio;
  S.pronto = false;
  S.primeiroPlay = false;
  S.tocandoLogico = false;
  S.ajustouVelInicio = false;
  S.tituloConferido = false;
  cancelarToqueLivre();
  zerarRepeticao();
  fecharMenuTraducao();
  atualizarBotaoTraducao();
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
    if (!$('#painel-ajustes').hidden) montarVelocidades();
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
  try { S.player?.destruir(); } catch { /* nada */ }
  S.player = null;
  soltarTelaLigada();
}

function fecharVideo() {
  encerrarPlayer();
  cancelarToqueLivre();
  cancelarTraducaoAuto();
  try { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); } catch { /* nada */ }
  S.registro = null;
  S.unidades = [];
  zerarRepeticao();
  fecharMenuTraducao();
  fecharCartao();
  document.body.classList.remove('gestos-ativos');
  renderBiblioteca();
}

function aplicarVelocidadeSalva() {
  const p = S.player;
  if (!p) return;
  const vels = p.velocidades();
  const alvo = vels.reduce((a, b) => (Math.abs(b - S.ajustes.velocidade) < Math.abs(a - S.ajustes.velocidade) ? b : a), vels[0] ?? 1);
  S.velConfirmada = p.velocidade() || 1;
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

// ============================================================ tradução automática

function traducaoAutomaticaAtiva() {
  return !!S.registro && !S.registro.traducao && S.ajustes.destino !== 'nao';
}

/** Mapa { texto: tradução } do vídeo aberto, no idioma de destino atual. */
function mapaDaTraducao() {
  const reg = S.registro;
  const para = S.ajustes.destino;
  if (!reg.traducaoAuto || reg.traducaoAuto.para !== para || typeof reg.traducaoAuto.mapa !== 'object') {
    reg.traducaoAuto = { para, mapa: {} };
  }
  return reg.traducaoAuto.mapa;
}

function cancelarTraducaoAuto() {
  try { S.trad.controle?.abort(); } catch { /* nada */ }
  S.trad = { estado: 'ocioso', feitos: 0, total: 0, controle: null };
}

async function iniciarTraducaoAuto() {
  const reg = S.registro;
  if (!traducaoAutomaticaAtiva()) return;
  const mapa = mapaDaTraducao();
  const para = reg.traducaoAuto.para;
  const U = S.unidades;
  const t0 = S.player ? S.player.tempo() : S.inicio;
  const i0 = Math.max(0, falaNoTempo(U, t0).indice);
  const pendentes = textosPendentes(U, mapa, i0);
  const total = textosPendentes(U, {}, 0).length;
  // Já está traduzindo exatamente isto: deixa continuar.
  if (S.trad.estado === 'traduzindo' && S.trad.reg === reg && S.trad.para === para) {
    S.trad.total = total;
    return;
  }
  cancelarTraducaoAuto();
  if (!pendentes.length) {
    S.trad = { estado: total ? 'ok' : 'ocioso', feitos: total, total, controle: null };
    atualizarAviso();
    return;
  }
  const controle = new AbortController();
  S.trad = { estado: 'traduzindo', feitos: total - pendentes.length, total, controle, reg, para };
  atualizarAviso();
  const atual = () => S.registro === reg && S.trad.controle === controle && !controle.signal.aborted;
  try {
    await traduzirTodos(pendentes, {
      de: S.ajustes.idioma,
      para,
      sinal: controle.signal,
      aoLote: (textos, traducoes) => {
        if (!atual()) return;
        textos.forEach((t, i) => { mapa[t] = traducoes[i] || ''; });
        S.trad.feitos += textos.length;
        aplicarMapa(S.unidades, mapa);
        salvarVideo(reg);
        renderLegenda(false);
        atualizarAviso();
      },
    });
    if (!atual()) return;
    S.trad.estado = 'ok';
    S.trad.controle = null;
  } catch (e) {
    if (!atual() || e?.name === 'AbortError') return;
    S.trad.estado = 'erro';
    S.trad.controle = null;
  }
  atualizarAviso();
}

/** Linha pequena embaixo da legenda: frases montadas e andamento da tradução automática. */
function atualizarAviso() {
  const partes = [];
  let erro = false;
  if (S.frases) partes.push('Frases montadas pelo app');
  if (traducaoAutomaticaAtiva()) {
    const nome = NOMES_IDIOMA[S.ajustes.destino] || S.ajustes.destino;
    const t = S.trad;
    if (t.estado === 'traduzindo') {
      const pct = t.total ? Math.floor((100 * t.feitos) / t.total) : 0;
      partes.push(`Traduzindo para o ${nome}… ${pct}%`);
    } else if (t.estado === 'ok') {
      partes.push(`Tradução automática (${nome})`);
    } else if (t.estado === 'erro') {
      partes.push('Não consegui traduzir. Confira a internet.');
      erro = true;
    }
  }
  $('#aviso-legenda').textContent = partes.join(' · ');
  $('#btn-tentar-traducao').hidden = !erro;
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
  if (st === 1 && !S.ajustouVelInicio && S.pronto) {
    S.ajustouVelInicio = true;
    aplicarVelocidadeSalva(); // o player pode ter ignorado o pedido feito antes de tocar
    lerTitulo();
  }
  atualizarBotaoPlay();
  if (S.tocandoLogico !== antes) renderLegenda(false); // modo "só quando pausar"
  if (S.tocandoLogico) {
    pedirTelaLigada();
    if (st === 1 && document.body.classList.contains('faixa-visivel')) mostrarFaixa(); // só reinicia os 3 s
  } else if (st !== 3) {
    soltarTelaLigada();
    if (st === 2 || st === 0) salvarPosicao();
    if (document.body.classList.contains('imersivo')) mostrarFaixa();
  }
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
  conferirTitulo(t);
}

/** Avisa se o título do vídeo não bate com o título no nome do arquivo de legenda. */
function conferirTitulo(tituloVideo) {
  const reg = S.registro;
  if (!reg || !tituloVideo || S.tituloConferido) return;
  S.tituloConferido = true;
  const nome = reg.estudo?.arquivo || '';
  if (!/^\s*\[/.test(nome)) return; // só nomes no padrão do DownSub trazem o título
  const doArquivo = tituloDoArquivo(nome);
  if (titulosParecidos(tituloVideo, doArquivo)) return;
  toast(`Atenção: as legendas parecem ser de outro vídeo. Arquivo: “${doArquivo}”. Vídeo: “${tituloVideo}”. Confira o link.`, 9000);
}

function atualizarBotaoPlay() {
  const tocando = S.tocandoLogico;
  const b = $('#btn-play');
  b.classList.toggle('tocando', tocando);
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
  // A fala de destino de um salto vale até o vídeo chegar nela (ou ir para longe).
  const alvo = S.unidades[S.alvoNav];
  if (S.alvoNav !== null && performance.now() - S.saltoEm > 600 && (!alvo || t >= alvo.s || t < alvo.s - 1.5)) S.alvoNav = null;
  if (st === 1) logicaRepeticao(t);
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
  return S.frases ? PRE_ROLAGEM_FRASES : PRE_ROLAGEM;
}

/** Vai para o início de uma unidade, com pré-rolagem. */
function irParaIndice(i) {
  const p = S.player;
  const u = S.unidades[i];
  if (!p || !u) return;
  p.irPara(tempoDestino(u, preRolagem()));
  S.saltoEm = performance.now();
  S.alvoNav = i;
  renderLegenda(true);
}

function renderLegenda(forcar) {
  const p = S.player;
  const U = S.unidades;
  let indice = -1;
  if (p && U.length) {
    const t = p.tempo();
    ({ indice } = falaNoTempo(U, t));
    if (S.alvoNav !== null && U[S.alvoNav]) indice = S.alvoNav;
  }
  // Entre duas falas, a última continua na tela.
  const u = U[indice];
  const t1 = u ? u.texto : '';
  const t2 = textoLinha2(u);
  if (indice === S.exibida && t2 === S.exibidaTrad && !forcar) return;
  if (indice === S.exibida && !forcar) {
    // Só mudou a linha 2 (tradução chegou, ou tocou/pausou no modo "só quando pausar"):
    // não mexe na linha 1, porque o cartão da palavra pode estar aberto.
    S.exibidaTrad = t2;
    mostrarLinha2(t2);
    return;
  }
  if (indice !== S.exibida) fecharCartao();
  S.exibida = indice;
  S.exibidaTrad = t2;

  // caixa: linha 1 com palavras tocáveis
  const c1 = $('#caixa-l1');
  c1.textContent = '';
  if (t1) {
    for (const parte of t1.split(/(\s+)/)) {
      if (!parte) continue;
      if (/^\s+$/.test(parte)) { c1.appendChild(document.createTextNode(' ')); continue; }
      const span = document.createElement('span');
      span.className = 'palavra';
      span.textContent = parte;
      c1.appendChild(span);
    }
  }
  $('#caixa-legenda').scrollTop = 0;
  $('#legenda-sobre .l1').textContent = t1; // legendas sobre o vídeo (deitado ou tela cheia)
  mostrarLinha2(t2);
}

/** Texto da linha 2 conforme o modo da tradução (sempre, só quando pausar, desativada). */
function textoLinha2(u) {
  const trad = u?.trad || '';
  const modo = S.ajustes.modoTraducao;
  if (!trad || modo === 'desligada') return '';
  if (modo === 'pausado' && S.tocandoLogico) return '';
  return trad;
}

/** Mostra a linha 2 e ajusta o tamanho: sem tradução na tela, a linha 1 fica maior. */
function mostrarLinha2(t2) {
  const c2 = $('#caixa-l2');
  c2.textContent = t2;
  c2.hidden = !t2;
  $('#legenda-sobre .l2').textContent = t2;
  $('#caixa-legenda').classList.toggle('so-original', !t2);
  $('#legenda-sobre').classList.toggle('so-original', !t2);
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

// ============================================================ loop da fala e trecho A–B

/** Com o vídeo tocando: no fim da fala (ou do trecho A–B), volta para o começo dela. */
function logicaRepeticao(t) {
  const U = S.unidades;
  if (!U.length || performance.now() - S.saltoEm < 350) return; // logo depois de um salto o tempo ainda é o antigo
  const { a, b } = S.ab;
  if (a !== null && b !== null) {
    const fim = U[b];
    if (fim && t >= fim.e - 0.05 && t < fim.e + 1) irParaIndice(a);
    return;
  }
  if (!S.loop.ligado) return;
  const atual = falaNoTempo(U, t).indice;
  let alvo = U[S.loop.alvo];
  // Foi para outro ponto (barra do tempo): o loop passa a ser da fala de lá.
  if (!alvo || t > alvo.e + 1 || t < alvo.s - 2) {
    S.loop.alvo = atual >= 0 ? atual : null;
    alvo = U[S.loop.alvo];
  }
  if (alvo && t >= alvo.e - 0.05 && t < alvo.e + 1) irParaIndice(S.loop.alvo);
}

function falaAtual() {
  return S.exibida >= 0 ? S.exibida : -1;
}

function atualizarBotoesRepeticao() {
  const bl = $('#btn-loop');
  bl.setAttribute('aria-pressed', String(S.loop.ligado));
  const { a, b } = S.ab;
  const ab = $('#btn-ab');
  const completo = a !== null && b !== null;
  const marcando = S.marcandoAB !== null;
  ab.setAttribute('aria-pressed', String(completo));
  ab.classList.toggle('meio', marcando);
  ab.textContent = marcando ? (S.marcandoAB === 'a' ? 'A?' : 'B?') : 'A–B';
  ab.setAttribute('aria-label', completo ? 'Parar o trecho A–B' : marcando ? 'Cancelar a marcação do trecho' : 'Repetir um trecho de A até B');
  // Enquanto marca, a caixa da legenda fica destacada e mostra o que fazer.
  const caixa = $('#caixa-legenda');
  caixa.classList.toggle('marcando-ab', marcando);
  const dica = $('#dica-ab');
  dica.hidden = !marcando;
  if (S.marcandoAB === 'a') dica.textContent = 'Toque aqui na fala onde o trecho começa (A)';
  else if (S.marcandoAB === 'b') dica.textContent = `A em ${formatarTempo(S.unidades[a]?.s)} · vá até a fala final e toque aqui (B)`;
}

function alternarLoop() {
  if (!S.unidades.length) return;
  S.loop.ligado = !S.loop.ligado;
  S.loop.alvo = S.loop.ligado ? (falaAtual() >= 0 ? falaAtual() : null) : null;
  if (S.loop.ligado) { S.ab = { a: null, b: null }; S.marcandoAB = null; } // um modo de repetição por vez
  atualizarBotoesRepeticao();
  toast(S.loop.ligado ? 'Loop da fala ligado' : 'Loop da fala desligado', 1200);
}

/** Botão A–B: começa a marcação (os pontos são marcados tocando na legenda), cancela ou desliga. */
function tocarAB() {
  if (!S.unidades.length) return;
  const { a, b } = S.ab;
  if (a !== null && b !== null) {
    S.ab = { a: null, b: null };
    atualizarBotoesRepeticao();
    toast('Trecho A–B desligado', 1200);
    return;
  }
  if (S.marcandoAB) {
    S.marcandoAB = null;
    S.ab = { a: null, b: null };
    atualizarBotoesRepeticao();
    toast('Marcação cancelada', 1200);
    return;
  }
  S.loop = { ligado: false, alvo: null };
  S.ab = { a: null, b: null };
  S.marcandoAB = 'a';
  fecharCartao();
  atualizarBotoesRepeticao();
}

/** Toque na legenda durante a marcação: marca A ou B na fala que está na tela. */
function marcarPontoAB() {
  const i = falaAtual();
  if (i < 0) { toast('Ainda não há fala na tela. Toque no play ou arraste até uma fala.'); return; }
  vibrar();
  if (S.marcandoAB === 'a') {
    S.ab = { a: i, b: null };
    S.marcandoAB = 'b';
    atualizarBotoesRepeticao();
    return;
  }
  const a = S.ab.a;
  S.ab = { a: Math.min(a, i), b: Math.max(a, i) };
  S.marcandoAB = null;
  atualizarBotoesRepeticao();
  toast(`Repetindo de ${formatarTempo(S.unidades[S.ab.a].s)} até ${formatarTempo(S.unidades[S.ab.b].e)}. Toque em A–B para parar.`, 3500);
  // Começa já pelo ponto A, tocando.
  irParaIndice(S.ab.a);
  if (S.player && S.player.estado() !== 1) {
    if (S.primeiroPlay) S.player.tocar(); else tocarPrimeiraVez();
  }
}

function zerarRepeticao() {
  S.loop = { ligado: false, alvo: null };
  S.ab = { a: null, b: null };
  S.marcandoAB = null;
  atualizarBotoesRepeticao();
}

// ============================================================ menu da tradução

function atualizarBotaoTraducao() {
  const modo = S.ajustes.modoTraducao;
  const b = $('#btn-traducao');
  b.classList.toggle('modo-desligada', modo === 'desligada');
  b.querySelector('.marca-modo').textContent = modo === 'pausado' ? '⏸' : '';
  const nomes = { sempre: 'mostrando sempre', pausado: 'só quando pausar', desligada: 'desativada' };
  b.setAttribute('aria-label', `Opções da tradução (agora: ${nomes[modo]})`);
  for (const op of $$('#menu-traducao [data-modo]')) op.setAttribute('aria-checked', String(op.dataset.modo === modo));
}

function abrirMenuTraducao() {
  const menu = $('#menu-traducao');
  if (!menu.hidden) { fecharMenuTraducao(); return; }
  atualizarBotaoTraducao();
  menu.hidden = false;
  $('#btn-traducao').setAttribute('aria-expanded', 'true');
  const r = $('#btn-traducao').getBoundingClientRect();
  const larg = menu.offsetWidth;
  const alt = menu.offsetHeight;
  const esquerda = Math.min(window.innerWidth - larg - 8, Math.max(8, r.right - larg));
  let topo = r.top - alt - 8;
  if (topo < 8) topo = r.bottom + 8;
  menu.style.left = `${esquerda}px`;
  menu.style.top = `${topo}px`;
}

function fecharMenuTraducao() {
  $('#menu-traducao').hidden = true;
  $('#btn-traducao').setAttribute('aria-expanded', 'false');
}

function definirModoTraducao(modo) {
  S.ajustes.modoTraducao = modo;
  salvar();
  atualizarBotaoTraducao();
  fecharMenuTraducao();
  renderLegenda(false);
}

function ciclarModoTraducao() {
  const ordem = ['sempre', 'pausado', 'desligada'];
  const novo = ordem[(ordem.indexOf(S.ajustes.modoTraducao) + 1) % 3];
  definirModoTraducao(novo);
  toast({ sempre: 'Tradução: mostrar sempre', pausado: 'Tradução: só quando pausar', desligada: 'Tradução desativada' }[novo], 1200);
}

// ============================================================ navegação por gesto (7.4)

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
  const r = navegar(U, p.tempo(), acao, S.memoriaNav, agora);
  if (r.indice === null) {
    if (r.aviso) mostrarRetorno(r.aviso);
    return;
  }
  S.memoriaNav = { indice: r.indice, quando: agora };
  if (S.loop.ligado) S.loop.alvo = r.indice; // o loop acompanha a fala escolhida
  irParaIndice(r.indice);
  // Navegar sempre deixa o vídeo tocando.
  if (p.estado() !== 1) {
    if (S.primeiroPlay) p.tocar(); else tocarPrimeiraVez();
  }
  mostrarRetorno(TEXTO_RETORNO[acao]);
  vibrar();
}

// ============================================================ velocidade (no painel de ajustes)

function montarVelocidades() {
  const linha = $('#linha-velocidade');
  linha.textContent = '';
  const vels = S.player ? S.player.velocidades() : [1];
  for (const v of vels) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (Math.abs(v - S.velConfirmada) < 1e-6 ? ' confirmada' : '');
    b.textContent = `${formatarNumero(v)}×`;
    b.addEventListener('click', () => {
      S.velPedida = { v, quando: performance.now() };
      S.player?.definirVelocidade(v);
    });
    linha.appendChild(b);
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

// ============================================================ cartão da palavra (9.3)

function urlTradutor(texto) {
  const sl = S.ajustes.idioma || 'auto';
  const tl = S.ajustes.destino === 'nao' ? 'pt' : S.ajustes.destino;
  return `https://translate.google.com/?sl=${sl}&tl=${tl}&text=${encodeURIComponent(texto)}&op=translate`;
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
  const r = span.getBoundingClientRect();
  let top = r.top - alt - 8;
  if (top < 8) top = Math.min(window.innerHeight - alt - 8, r.bottom + 8);
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
  if (S.marcandoAB) { marcarPontoAB(); return; } // marcando o trecho: o toque marca A ou B
  if (!(alvo instanceof Element)) return;
  if (alvo.classList.contains('palavra') && alvo.closest('#caixa-l1')) abrirCartao(alvo);
}

// ============================================================ liberar o toque no vídeo (anúncios)

let timerToqueLivre = null;

function cancelarToqueLivre() {
  clearInterval(timerToqueLivre);
  timerToqueLivre = null;
  document.body.classList.remove('toque-livre');
  const b = $('#btn-liberar');
  if (b) b.textContent = '👆';
}

/** Deixa o toque chegar ao player do YouTube por 10 s (para tocar em “Pular anúncio”). */
function liberarToque() {
  if (timerToqueLivre) { cancelarToqueLivre(); return; }
  if (!S.primeiroPlay) { toast('Antes do primeiro play o toque no vídeo já vai direto para o YouTube.'); return; }
  const fim = performance.now() + 10000;
  document.body.classList.add('toque-livre');
  toast('Toque livre no vídeo por 10 s: use para tocar em “Pular anúncio”.', 3000);
  const b = $('#btn-liberar');
  const atualizar = () => {
    const resta = Math.ceil((fim - performance.now()) / 1000);
    if (resta <= 0) { cancelarToqueLivre(); return; }
    b.textContent = `👆${resta}`;
  };
  atualizar();
  timerToqueLivre = setInterval(atualizar, 250);
}

// ============================================================ tela cheia e modo deitado (8.3)

const mqDeitado = window.matchMedia('(orientation: landscape) and (max-height: 600px) and (pointer: coarse)');

function atualizarImersivo() {
  const assistindo = !$('#tela-assistir').hidden;
  const im = assistindo && (!!document.fullscreenElement || mqDeitado.matches);
  const antes = document.body.classList.contains('imersivo');
  document.body.classList.toggle('imersivo', im);
  if (!im) document.body.classList.remove('faixa-visivel');
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

// ============================================================ painel de ajustes

function mostrarValor(chave) {
  const el = document.querySelector(`[data-mostra="${chave}"]`);
  if (el && chave === 'fonteL1') el.textContent = `${S.ajustes.fonteL1} px`;
}

function sincronizarPainel() {
  for (const el of $$('[data-ajuste]')) {
    const k = el.dataset.ajuste;
    const v = S.ajustes[k];
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = String(v);
    mostrarValor(k);
  }
  montarVelocidades();
  const reg = S.registro;
  $('#grupo-sincronia').hidden = !reg;
  if (reg) {
    for (const bloco of $$('.ajuste-sinc')) {
      const alvo = bloco.dataset.alvo;
      const v = reg[alvo] || 0;
      bloco.querySelector('.valor-sinc').textContent = `${v > 0 ? '+' : v < 0 ? '−' : ''}${formatarNumero(Math.abs(v), 1)} s`;
      // A tradução automática anda junto com a legenda estudada: não tem ajuste próprio.
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
  else if (el.type === 'range') v = Number(el.value);
  else v = el.value;
  S.ajustes[k] = v;
  salvar();
  mostrarValor(k);
  aplicarAparencia();
  if (k === 'destino') {
    cancelarTraducaoAuto();
    reprocessar();
    mostrarAmbas();
  } else if (k === 'idioma' && traducaoAutomaticaAtiva()) {
    // Outro idioma de origem: refaz a tradução automática deste vídeo.
    S.registro.traducaoAuto = null;
    cancelarTraducaoAuto();
    reprocessar();
  } else {
    renderLegenda(true);
  }
}

function ajustarSincronia(alvo, d) {
  const reg = S.registro;
  if (!reg) return;
  reg[alvo] = d === 'zerar' ? 0 : Math.round(((reg[alvo] || 0) + Number(d)) * 10) / 10;
  salvarVideo(reg);
  reprocessar();
  sincronizarPainel();
}

// ============================================================ teclado (notebook)

function aoTeclar(ev) {
  if ($('#tela-assistir').hidden || !S.player) return;
  if (!$('#dialogo').hidden) return;
  if (ev.key === 'Escape') {
    fecharCartao();
    fecharMenuTraducao();
    fecharPaineis();
    if (S.marcandoAB) { S.marcandoAB = null; S.ab = { a: null, b: null }; atualizarBotoesRepeticao(); }
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
  else if (k === 'ArrowLeft') navegarAcao('voltar');
  else if (k === 'ArrowRight') navegarAcao('avancar');
  else if (k === 'r' || k === 'R' || k === 'ArrowDown') navegarAcao('repetir');
  else if (k === '[') mudarVelocidadePasso(-1);
  else if (k === ']') mudarVelocidadePasso(1);
  else if (k === 'f' || k === 'F') alternarTelaCheia();
  else if (k === 'l' || k === 'L') alternarLoop();
  else if (k === 'b' || k === 'B') (S.marcandoAB ? marcarPontoAB() : tocarAB());
  else if (k === 't' || k === 'T') ciclarModoTraducao();
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
  $('#campo-link').value = linkDoVideo(link.videoId, link.inicioSeg);
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
  $('#arq-dupla').addEventListener('change', (ev) => { receberDupla(ev.target.files); ev.target.value = ''; });
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
    if (!ev.target.closest?.('#menu-traducao, #btn-traducao')) fecharMenuTraducao();
  });
  document.addEventListener('pointerdown', (ev) => {
    const c = $('#cartao-palavra');
    if (!c.hidden && !ev.target.closest?.('#cartao-palavra') && !ev.target.closest?.('.palavra')) fecharCartao();
  });

  // assistir
  $('#btn-voltar').addEventListener('click', voltarParaBiblioteca);
  $('#btn-tocar-grande').addEventListener('click', tocarPrimeiraVez);
  $('#btn-play').addEventListener('click', () => {
    alternarPlay();
    if (document.body.classList.contains('imersivo')) mostrarFaixa();
  });
  $('#btn-loop').addEventListener('click', alternarLoop);
  $('#btn-ab').addEventListener('click', tocarAB);
  $('#btn-traducao').addEventListener('click', (ev) => { ev.stopPropagation(); abrirMenuTraducao(); });
  for (const op of $$('#menu-traducao [data-modo]')) {
    op.addEventListener('click', (ev) => { ev.stopPropagation(); definirModoTraducao(op.dataset.modo); });
  }
  $('#btn-tela-cheia').addEventListener('click', alternarTelaCheia);
  $('#btn-liberar').addEventListener('click', liberarToque);
  $('#btn-ajustes').addEventListener('click', () => abrirPainel('#painel-ajustes'));
  $('#btn-fechar-ajustes').addEventListener('click', fecharPaineis);
  $('#fundo-painel').addEventListener('click', fecharPaineis);
  $('#btn-tentar-traducao').addEventListener('click', () => {
    cancelarTraducaoAuto();
    iniciarTraducaoAuto();
  });

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
      tempo: () => S.player?.tempo(),
      estado: () => S.player?.estado(),
    };
  }
}

iniciar();
