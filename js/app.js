// app.js — estado, telas, eventos. Liga legendas, tradução, player, gestos e armazenamento.
// PLANO.md seções 7 a 11 e 15 (interface enxuta e tradução automática, 22/11/2026).

import {
  tituloDoArquivo, chaveTitulo, titulosParecidos, lerLink, lerArquivoLegenda, lerArquivoLegendaDupla, sugerirPapeis,
  processar, falaNoTempo, navegar, JANELA_NAVEGACAO_MS, tempoDestinoFolga, FOLGA_MIN, FOLGA_MIN_FRASES, FOLGAS_MAX, limparPalavra, formatarTempo, formatarNumero, LIMITE_BYTES,
  MSG_LINK_INVALIDO, decidirPapeis, detectarIdioma, NOMES_IDIOMAS, palavrasParaPontuar,
} from './legendas.js';
import {
  PACOTES, pacoteDoIdioma, pontuacaoSuportada, estadoPacote, baixarPacote, apagarPacote, pontuarPalavras, tamanhoDownload,
  arquivosDoPacote, instalarArquivosBaixados,
} from './modelos.js';
import { textosPendentes, aplicarMapa, traduzirTodos, detectarIdiomaTexto, significadoPalavra } from './traducao.js';
import {
  listaIdiomas, nomeIdioma, nomeCodigoIdioma, idiomaDoSistema, idiomaInterface, codigoTradutor, mesmoIdioma, urlDicionario,
} from './idiomas.js';
import { iniciarI18n, t } from './i18n.js';
import { criarPlayer, MSG_API } from './player.js';
import { lerTimedText, infoUrl, faixaSugerida } from './timedtext.js';
import { urlBusca, misturarFiltros, OPCOES_FILTROS } from './busca.js';
import { ligarGestos } from './gestos.js';
import { criarVoz } from './voz.js';
import {
  carregarAjustes, salvarAjustes, salvarVideo, AJUSTES_PADRAO, obterVideo, listarVideos,
  apagarVideo, montarBackup, importarBackup, estaSoNaMemoria,
} from './armazenamento.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const MOCK = new URLSearchParams(location.search).get('mock') === '1';
// Testes (?mock=1): a explicação dos gestos só aparece com ?gestos=1 (os outros testes vão direto ao vídeo).
const GESTOS_MOCK = new URLSearchParams(location.search).get('gestos') === '1';

// Dentro do app Android (?app=android na primeira abertura): a legenda vem do próprio YouTube
// (PLANO.md 15.10). Fica guardado na sessão, porque o endereço perde os parâmetros depois.
const ANDROID = (() => {
  try {
    if (new URLSearchParams(location.search).get('app') === 'android') sessionStorage.setItem('ld.android', '1');
    return sessionStorage.getItem('ld.android') === '1';
  } catch {
    return new URLSearchParams(location.search).get('app') === 'android';
  }
})();

// Versão do app Android (parâmetro ?apk=). A busca no YouTube precisa da versão 3 ou mais nova.
const APK = (() => {
  try {
    const v = new URLSearchParams(location.search).get('apk');
    if (v) sessionStorage.setItem('ld.apk', v);
    return Number(sessionStorage.getItem('ld.apk')) || 0;
  } catch {
    return Number(new URLSearchParams(location.search).get('apk')) || 0;
  }
})();

// App Android versão 4 ou mais nova (22/11/2026): o YouTube é a tela inicial do app, a legenda vem só
// do YouTube (sem arquivos) e há botão "Pular anúncio". Esta página vira o player e a lista "Meus vídeos".
const APP_NOVO = ANDROID && APK >= 4;

const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));

// Valores fixos (antes eram ajustes; saíram do menu para deixá-lo simples).
// Ao avançar, retroceder ou repetir, a folga antes da fala acompanha o silêncio antes dela
// (tempoDestinoFolga, em legendas.js; versão 20). Só a folga máxima é ajuste.
// Descrições de sons ([Music], [Applause], [Música]...) sempre saem, de qualquer legenda e da tradução.
const OPCOES_PROCESSAR = { modoFrases: 'auto', esconderMarcacoes: true };
const opcoesProcessar = () => ({ ...OPCOES_PROCESSAR, usarModelo: S.ajustes.pontuacaoModelo });

// ============================================================ estado

// Idioma do celular: é o padrão da tradução (até a pessoa escolher outro na lista).
const IDIOMA_SISTEMA = idiomaDoSistema();
const IDIOMA_UI = idiomaInterface();

function ajustesIniciais() {
  const a = carregarAjustes();
  if (!a.destinoManual) a.destino = IDIOMA_SISTEMA;
  return a;
}

const S = {
  ajustes: ajustesIniciais(),
  // internet: online (último aviso do aparelho), travadoDesde (vídeo querendo tocar e o tempo parado),
  // cutucadas (pedidos do trecho de novo), recarregar (o player deu erro sem internet), reabrir (nem carregou)
  // gracaAte: depois de voltar ao app, um tempo sem aviso (o player retoma e o Android confirma a internet).
  rede: { online: navigator.onLine !== false, andandoEm: 0, ultimoT: -1, travadoDesde: 0, ultimaCutucada: 0, cutucadas: 0, querTocar: false, recarregar: false, reabrir: null, gracaAte: 0 },
  // vídeo aberto
  registro: null,
  unidades: [],
  frases: false,
  automatica: false,
  pontuada: false,
  pontuadaModelo: false, // a legenda na tela usa a pontuação melhorada (modelo)
  // pontuação melhorada: { reg, ctrl, feitas, total } enquanto o modelo trabalha
  modelo: null,
  pacotes: {}, // estado de cada pacote: 'pronto' | 'ausente'
  download: null, // { id, feitos, total, ctrl, nativo?, instalando? } | { id, erro }
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
  marcandoAB: null, // null | 'a' | 'b': na tela de escolha do A–B, o próximo toque marca esse ponto
  abTocava: false, // o vídeo tocava quando a tela do A–B abriu
  abAvisoTimer: 0, // some com o aviso de B inválido
  abHistorico: false, // a tela do A–B pôs uma entrada no histórico (para o voltar do celular)
  velConfirmada: 1,
  velPedida: null,
  velArrastando: false, // dedo na barra de velocidade (versão 22)
  rapido: null, // segurando o dedo no vídeo: { pausarAoSoltar } enquanto anda em 2×
  velFina: false, // gancho v5 do app Android: velocidades de 0,05 em 0,05
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
  origem: 'youtube', // de onde o vídeo foi aberto: 'youtube' ou 'biblioteca' (app novo: para onde voltar)
  // tradução automática
  trad: { estado: 'ocioso', feitos: 0, total: 0, controle: null },
  // formulário
  escolha: { estudo: null, traducao: null },
  // legenda pega do YouTube (app Android)
  yt: novoEstadoYt(),
  // anúncio do YouTube (avisado pelo gancho do app Android)
  anuncio: { ativo: false, pulavel: false, x: 0, y: 0, w: 0, h: 0 },
};

// Voz mais clara (app Android, versão 24): áudio tratado no celular tocando junto com o vídeo (js/voz.js).
const PARAMS_VOZ = new URLSearchParams(location.search);
const voz = criarVoz({
  disponivel: () => (ANDROID && APK >= 24 && !!window.LDNativo) || (MOCK && PARAMS_VOZ.get('mockVoz') === '1'),
  ajustes: () => S.ajustes,
  salvar: () => salvar(),
  player: () => S.player,
  registro: () => S.registro,
  salvarRegistro: (reg) => salvarVideo(reg),
  anuncio: () => S.anuncio.ativo,
  carregando: () => !!(S.yt.preparando || S.yt.fase),
  velocidade: () => S.velConfirmada || 1,
  mandar: (msg) => mandarAoApp(msg),
  toast: (msg, ms) => toast(msg, ms),
  dialogo: (op) => dialogo(op),
  naTelaDoVideo: () => !$('#tela-assistir').hidden,
  // Testes (?mock=1&mockVozArquivo=...): um arquivo de áudio qualquer no lugar do entregue pelo app.
  urlArquivo: (id, arquivo) => (MOCK && PARAMS_VOZ.get('mockVozArquivo')) || new URL(`./__ld_voz/${id}/${arquivo}`, location.href).href,
  diag: (texto) => diag(texto),
});

/**
 * fase: null | 'procurando' (vídeo toca sem som até o player informar as legendas) | 'escolhendo' |
 * 'baixando' | 'sem' (o vídeo não tem legenda) | 'erro' | 'parado' (o vídeo não começou).
 * preparando: o vídeo está tocando sem som por causa da legenda; retorno: { tempo, tocava } para depois.
 */
function novoEstadoYt() {
  return {
    estado: 'ocioso', faixa: null, capturas: new Map(), tentativas: 0, timer: 0, trocando: false,
    fase: null, preparando: false, retorno: null, geracao: 0,
    // gancho do app (dentro do player): última lista de faixas (inclui as automáticas) e diagnóstico
    gancho: null, vistoGancho: false, diag: [], baixou: [], inicioDiag: performance.now(),
  };
}

/** Linha do diagnóstico (botão "Copiar diagnóstico" quando a legenda não vem). */
function diag(texto) {
  const d = S.yt.diag;
  d.push(`${((performance.now() - S.yt.inicioDiag) / 1000).toFixed(1)} s · ${texto}`);
  if (d.length > 80) d.splice(0, d.length - 80);
}

// ============================================================ utilidades de interface

let timerToast = null;
function toast(msg, ms = 2600) {
  const el = $('#toast');
  el.textContent = msg;
  posicionarToast(el);
  el.hidden = false;
  el.classList.remove('visivel');
  void el.offsetWidth; // reinicia a animação de entrada
  el.classList.add('visivel');
  clearTimeout(timerToast);
  timerToast = setTimeout(() => { el.classList.remove('visivel'); el.hidden = true; }, ms);
}

/**
 * Na tela do vídeo, o aviso fica logo acima dos botões (antes ficava em cima deles).
 * Nas outras telas, perto da borda de baixo.
 */
function posicionarToast(el) {
  el.style.bottom = '';
  const barra = $('#barra-botoes');
  if ($('#tela-assistir').hidden || !barra || document.body.classList.contains('imersivo')) return;
  const topo = barra.getBoundingClientRect().top;
  if (topo > 0 && topo < window.innerHeight) el.style.bottom = `${Math.round(window.innerHeight - topo + 10)}px`;
}

// Ícone de velocidade (não há botão de velocidade na barra para copiar o desenho).
const ICONE_VELOCIDADE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.38 8.57l-1.23 1.85a8 8 0 0 1-.22 7.58H5.07A8 8 0 0 1 15.58 6.85l1.85-1.23A10 10 0 0 0 3.35 19a2 2 0 0 0 1.72 1h13.85a2 2 0 0 0 1.74-1 10 10 0 0 0-.27-10.44zm-9.79 6.84a2 2 0 0 0 2.83 0l5.66-8.49-8.49 5.66a2 2 0 0 0 0 2.83z"/></svg>';

let timerSelo = null;
/**
 * Selo dos botões de controle (loop, A–B, tradução, lista, velocidade): aparece no meio do vídeo,
 * no estilo do app (ícone âmbar do próprio botão + texto). desligado: ícone apagado.
 * icone: seletor do botão (o desenho dele é copiado) ou o SVG pronto.
 */
function selo(msg, ms = 1300, icone = '', desligado = false) {
  const el = $('#selo-controle');
  if (!el || $('#tela-assistir').hidden) { toast(msg, ms); return; }
  const caixa = el.querySelector('.selo-icone');
  caixa.textContent = '';
  if (icone.startsWith('<')) caixa.innerHTML = icone;
  else {
    const svg = icone ? $(icone)?.querySelector('svg') : null;
    if (svg) caixa.appendChild(svg.cloneNode(true));
  }
  caixa.hidden = !caixa.firstChild;
  el.querySelector('.selo-texto').textContent = msg;
  el.classList.toggle('desligado', !!desligado);
  el.classList.toggle('longo', msg.length > 34);
  el.classList.remove('visivel');
  void el.offsetWidth;
  el.classList.add('visivel');
  clearTimeout(timerSelo);
  timerSelo = setTimeout(() => el.classList.remove('visivel'), ms);
}

// ============================================================ transições (entrada pelo CSS; saída aqui)

const REDUZIR_MOVIMENTO = (() => {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
})();

/** Mostra um elemento (cancela a saída animada, se ela estava em andamento). A entrada é animada pelo CSS. */
function mostrarComAnimacao(el) {
  if (!el) return;
  if (el._saida) { clearTimeout(el._saida); el._saida = 0; }
  el.classList.remove('saindo');
  el.hidden = false;
}

/** Esconde com a animação de saída (.saindo no CSS) e só depois põe hidden. */
function esconderComAnimacao(el, ms = 200) {
  if (!el || el.hidden || el._saida) return;
  if (REDUZIR_MOVIMENTO) { el.hidden = true; return; }
  el.classList.add('saindo');
  el._saida = setTimeout(() => {
    el._saida = 0;
    el.classList.remove('saindo');
    el.hidden = true;
  }, ms);
}

/** Saindo (animação de saída em andamento) conta como fechado. */
function aberto(el) {
  return !!el && !el.hidden && !el._saida;
}

let timerRetorno = null;
// Ícones de retroceder e avançar (os mesmos da explicação dos gestos).
const SVG_RETROCEDER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/></svg>';
const SVG_AVANCAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/></svg>';

/** Aviso rápido no meio do vídeo depois de um gesto. acao 'voltar' ou 'avancar' põe o ícone. */
function mostrarRetorno(texto, acao = '') {
  const el = $('#retorno-gesto');
  el.textContent = '';
  const rotulo = document.createElement('span');
  rotulo.textContent = texto;
  if (acao === 'voltar' || acao === 'avancar') {
    const ic = document.createElement('span');
    ic.className = 'retorno-icone';
    ic.innerHTML = acao === 'voltar' ? SVG_RETROCEDER : SVG_AVANCAR;
    if (acao === 'voltar') el.append(ic, rotulo); else el.append(rotulo, ic);
  } else {
    el.append(rotulo);
  }
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

/**
 * Tamanho das letras enquanto a barra do Ajustes está sendo arrastada (versão 15): a legenda já mostra o
 * tamanho novo, mas ele só é salvo depois de a pessoa confirmar na janela de pergunta. null = sem prévia.
 */
let fontePrevia = null;
/** Tamanho salvo antes de começar a arrastar a barra (para voltar a ele se a pessoa cancelar). */
let fonteAntesDaPrevia = null;

function fonteAtual() {
  return fontePrevia ?? S.ajustes.fonteL1;
}

function aplicarAparencia() {
  const raiz = document.documentElement.style;
  const f = fonteAtual();
  raiz.setProperty('--fonte-l1', `${f}px`);
  raiz.setProperty('--fonte-l2', `${Math.round(f * 0.85)}px`);
  ajustarEscala();
}

function salvar() {
  salvarAjustes(S.ajustes);
}

// ============================================================ biblioteca: formulário

function textoSemTraducao() {
  const d = S.ajustes.destino;
  return d === 'nao' ? 'Nenhum arquivo escolhido.' : `Sem arquivo: o app traduz sozinho (${nomeIdioma(d)}).`;
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
  // No app Android basta o link: a legenda vem do YouTube.
  $('#btn-abrir').disabled = !(link && (S.escolha.estudo || ANDROID));
}

/** Idioma da tradução: o da tradução automática (ou português, se ela estiver desligada). */
function idiomaAlvo() {
  const d = S.ajustes.destino;
  return d === 'nao' ? IDIOMA_SISTEMA : d;
}

/** Idioma de origem para o tradutor: o da legenda estudada (vinda do YouTube) ou o dos ajustes. */
function idiomaOrigem() {
  const c = codigoTradutor(S.registro?.estudo?.idioma || '');
  return c || S.ajustes.idioma || 'auto';
}

function mostrarEscolha(papel) {
  const el = $(papel === 'estudo' ? '#info-estudo' : '#info-traducao');
  const e = S.escolha[papel];
  if (e) {
    const n = e.falas.length;
    const parte = e.dupla ? (papel === 'estudo' ? ' (parte do idioma estudado)' : ' (parte da tradução)') : '';
    const idioma = e.idioma ? `${NOMES_IDIOMAS[e.idioma]} · ` : '';
    el.textContent = `${e.arquivo}${parte} — ${idioma}${n.toLocaleString('pt-BR')} ${n === 1 ? 'fala lida' : 'falas lidas'}`;
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
      const r = lerArquivoLegendaDupla(buf, idiomaAlvo(), S.ajustes.idioma);
      if (r.erro) return { arquivo: file.name, erro: r.erro };
      return { arquivo: file.name, estudo: r.estudo, traducao: r.traducao, idiomaEstudo: r.idiomaEstudo, idiomaTraducao: r.idiomaTraducao };
    }
    const r = lerArquivoLegenda(buf);
    if (r.erro) return { arquivo: file.name, erro: r.erro };
    return { arquivo: file.name, falas: r.falas };
  } catch {
    return { arquivo: file.name, erro: 'Não consegui ler esse arquivo.' };
  }
}

function definirEscolha(papel, r) {
  S.escolha[papel] = r && !r.erro ? { arquivo: r.arquivo, falas: r.falas, idioma: detectarIdioma(r.falas) } : null;
  mostrarEscolha(papel);
  if (r?.erro) mostrarErroArquivo(papel, r.arquivo, r.erro);
}

/**
 * Com as duas legendas escolhidas, decide sozinho qual é a estudada e qual é a tradução,
 * pelo idioma do texto (não pelo botão usado nem pela ordem). Mostra o resultado.
 */
function organizarPapeis() {
  const { estudo, traducao } = S.escolha;
  if (!estudo || !traducao) {
    // Só uma legenda, e ela já está no idioma da tradução: falta a do idioma estudado.
    const so = estudo || traducao;
    if (so && so.idioma && so.idioma === idiomaAlvo() && !so.dupla) {
      avisarLink(`Esse arquivo está em ${NOMES_IDIOMAS[so.idioma]}. Escolha também a legenda do idioma que você estuda.`);
    }
    if (!estudo && traducao) {
      // Só veio a tradução: ela passa a ser a legenda principal até chegar a outra.
      S.escolha = { estudo: traducao, traducao: null };
      mostrarAmbas();
    }
    return;
  }
  const d = decidirPapeis(estudo, traducao, idiomaAlvo(), S.ajustes.idioma);
  if (d.conflito) {
    S.escolha.traducao = null;
    mostrarAmbas();
    mostrarErroArquivo('traducao', traducao.arquivo, `os dois arquivos estão em ${NOMES_IDIOMAS[d.idiomaA]}. Escolha a legenda em ${nomeIdioma(idiomaAlvo())} ou deixe vazio para o app traduzir.`);
    return;
  }
  if (d.trocar) {
    S.escolha.estudo = traducao;
    S.escolha.traducao = estudo;
  }
  mostrarAmbas();
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
  } else {
    const lido = await lerArquivo(arquivos[0]);
    // Um arquivo da legenda dupla estava escolhido: trocar uma parte desfaz o par.
    for (const k of ['estudo', 'traducao']) if (S.escolha[k]?.dupla) S.escolha[k].dupla = false;
    // Os papéis são decididos pelo idioma, então o botão usado só desempata:
    // mesmo idioma de um arquivo já escolhido → substitui esse; senão → vai para o lugar vazio.
    const idioma = lido.erro ? '' : detectarIdioma(lido.falas);
    const { estudo, traducao } = S.escolha;
    let alvo;
    if (idioma && estudo?.idioma === idioma) alvo = 'estudo';
    else if (idioma && traducao?.idioma === idioma) alvo = 'traducao';
    else if (!estudo) alvo = 'estudo';
    else if (!traducao) alvo = 'traducao';
    else alvo = papel || 'traducao';
    definirEscolha(alvo, lido);
    if (alvo === 'estudo' && !S.escolha.traducao) mostrarEscolha('traducao');
  }
  // Os erros de leitura ficam na tela; sem erro, o app arruma os papéis pelo idioma.
  const comErro = $$('.info-arquivo.erro').length > 0;
  if (!comErro) organizarPapeis();
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
  S.escolha.estudo = { arquivo: r.arquivo, falas: r.estudo, dupla: true, idioma: r.idiomaEstudo || '' };
  S.escolha.traducao = { arquivo: r.arquivo, falas: r.traducao, dupla: true, idioma: r.idiomaTraducao || '' };
  mostrarAmbas();
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

function limparFormulario() {
  $('#campo-link').value = '';
  S.escolha = { estudo: null, traducao: null };
  mostrarAmbas();
  $('#msg-link').textContent = '';
  $('#msg-link').className = 'msg';
  validarFormulario();
}

async function abrirDoFormulario() {
  if (ANDROID && ehShorts($('#campo-link').value)) { mostrarBloqueio('shorts'); return; }
  const link = lerLink($('#campo-link').value);
  if (!link || (!S.escolha.estudo && !ANDROID)) return;
  const existente = await obterVideo(link.videoId);
  const agora = new Date().toISOString();
  if (!S.escolha.estudo) {
    // App Android, só o link: vídeo já na biblioteca abre como está; vídeo novo pega a legenda do YouTube.
    const reg = existente ? { ...existente, abertoEm: agora } : {
      id: link.videoId, titulo: '', criadoEm: agora, abertoEm: agora, posicao: 0,
      estudo: null, traducao: null, ajusteEstudo: 0, ajusteTraducao: 0, traducaoAuto: null,
    };
    const inicio = link.inicioSeg > 0 ? link.inicioSeg : existente ? Math.max(0, reg.posicao - 2) : 0;
    if (existente) await salvarVideo(reg);
    limparFormulario();
    abrirVideo(reg, inicio);
    return;
  }
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
    titulo.setAttribute('translate', 'no');
    titulo.textContent = v.titulo || `Vídeo ${v.id}`;
    const detalhe = document.createElement('div');
    detalhe.className = 'detalhe';
    let data = '';
    try { data = new Date(v.abertoEm).toLocaleDateString('pt-BR'); } catch { /* nada */ }
    detalhe.textContent = `parou em ${formatarTempo(v.posicao || 0)}${data ? ' · ' + data : ''}`;
    // Voz mais clara: "Voz clara", "Tratando 45%" ou "Na fila" (atualizado quando o app manda o estado)
    const seloVoz = document.createElement('span');
    seloVoz.className = 'selo-voz';
    seloVoz.textContent = voz.selo(v.id);
    seloVoz.hidden = !seloVoz.textContent;
    detalhe.appendChild(seloVoz);
    textos.append(titulo, detalhe);
    abrir.append(img, textos);
    abrir.addEventListener('click', async () => {
      const reg = await obterVideo(v.id);
      if (!reg) return;
      reg.abertoEm = new Date().toISOString();
      await salvarVideo(reg);
      abrirVideo(reg, Math.max(0, (reg.posicao || 0) - 2), 'biblioteca');
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
      if (!APP_NOVO) item('Trocar legendas', () => trocarLegendas(v)); // no app: ⚙ Ajustes do vídeo
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
  if (voz.estado()?.videos?.[v.id]) voz.aoApagarVideo(v.id); // o áudio tratado dele também
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
    const nossa = /^Esse arquivo não é um backup/.test(String(e?.message));
    if (!nossa) diag(`importar falhou: ${detalheErro(e)}`);
    toast(nossa ? `${e.message} Escolha o arquivo .json criado em Exportar biblioteca.` : 'Não consegui importar esse arquivo. Confira se é o .json criado em Exportar biblioteca e tente de novo.', 5000);
  }
}

// ============================================================ telas e histórico

// Troca entre Meus vídeos e o vídeo sem "piscada escura" (versão 14) e sem tela "fantasma" (versão 15):
// - dentro da página: a tela nova entra deslizando, inteira, por cima da antiga (View Transitions do Chrome;
//   css: vt-entra-direita). Abrir o vídeo: entra pela direita; voltar: Meus vídeos entra pela esquerda.
//   Na versão 14 as duas se dissolviam e a tela do vídeo aparecia meio transparente sobre a lista. Onde a
//   View Transitions não existir, a troca é na hora;
// - vindo do YouTube do app (abrir um vídeo, Meus vídeos): a troca aqui é na hora e quem anima é o app, que
//   espera o aviso "telaPronta" para a página já estar com a tela nova desenhada.

/** A próxima troca de tela é na hora e o app Android é avisado ("telaPronta"): ele faz a animação. */
let trocaDoApp = false;

/** Tela que uma transição em andamento ainda vai mostrar ('assistir' ou 'biblioteca'), ou null. */
let telaACaminho = null;

/** Troca de tela: na hora (avisando o app, se ele pediu) ou dissolvendo uma na outra. */
function trocarTela(mudar, destino, naHora) {
  const doApp = trocaDoApp;
  trocaDoApp = false;
  const animar = !naHora && !doApp && !REDUZIR_MOVIMENTO && !document.hidden
    && typeof document.startViewTransition === 'function';
  if (!animar) {
    mudar();
    if (doApp) avisarTelaPronta();
    return;
  }
  telaACaminho = destino;
  const raiz = document.documentElement;
  raiz.dataset.troca = destino === 'assistir' ? 'avanca' : 'volta';
  const limpar = () => { if (!telaACaminho) delete raiz.dataset.troca; };
  try {
    const vt = document.startViewTransition(() => {
      if (telaACaminho === destino) telaACaminho = null;
      mudar();
    });
    vt.finished.then(limpar, limpar);
  } catch {
    telaACaminho = null;
    delete raiz.dataset.troca;
    mudar();
  }
}

/** Avisa o app Android que a tela nova já está na página (depois de desenhada). */
function avisarTelaPronta() {
  if (!ANDROID || !window.LDNativo) return;
  requestAnimationFrame(() => requestAnimationFrame(() => mandarAoApp({ acao: 'telaPronta' })));
}

function mostrarBiblioteca(naHora = false) {
  const mudar = () => {
    $('#tela-assistir').hidden = true;
    $('#tela-biblioteca').hidden = false;
    document.body.classList.remove('imersivo', 'faixa-visivel');
  };
  fecharPaineis();
  if (telaACaminho === 'biblioteca') return; // a transição em andamento já vai mostrar Meus vídeos
  const jaNela = $('#tela-assistir').hidden && !telaACaminho;
  trocarTela(mudar, 'biblioteca', naHora || jaNela);
}

function mostrarTelaAssistir() {
  const mudar = () => {
    $('#tela-biblioteca').hidden = true;
    $('#tela-assistir').hidden = false;
    atualizarImersivo();
  };
  if (telaACaminho === 'assistir') return; // a transição em andamento já vai mostrar o vídeo
  const jaNela = (!$('#tela-assistir').hidden || $('#tela-biblioteca').hidden) && !telaACaminho;
  trocarTela(mudar, 'assistir', jaNela);
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
    const voltarAoYoutube = APP_NOVO && !!S.registro && S.origem === 'youtube';
    if (voltarAoYoutube) {
      // O vídeo veio do YouTube: volta para lá. O YouTube entra por cima desta tela; a troca para Meus
      // vídeos aqui embaixo só acontece depois que ele cobriu tudo (antes, Meus vídeos aparecia de relance).
      fecharVideo();
      abrirYoutube('');
      setTimeout(() => {
        if (S.registro || location.hash === '#assistir') return; // outro vídeo abriu nesse meio-tempo
        mostrarBiblioteca(true);
      }, 500);
      return;
    }
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
    opcoesProcessar(),
  );
  S.unidades = r.unidades;
  S.frases = r.frases;
  S.automatica = r.automatica;
  S.pontuada = r.pontuada;
  S.pontuadaModelo = r.pontuadaModelo;
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

/**
 * Vídeos salvos antes da detecção pelo idioma podem estar com as legendas trocadas
 * (a tradução no lugar da estudada). Arruma, guarda e avisa.
 */
function corrigirPapeisSalvos(reg) {
  if (!reg?.estudo?.falas?.length || !reg?.traducao?.falas?.length) return false;
  const d = decidirPapeis(reg.estudo, reg.traducao, idiomaAlvo(), S.ajustes.idioma);
  if (!d.trocar) return false;
  [reg.estudo, reg.traducao] = [reg.traducao, reg.estudo];
  [reg.ajusteEstudo, reg.ajusteTraducao] = [reg.ajusteTraducao || 0, reg.ajusteEstudo || 0];
  reg.traducaoAuto = null;
  salvarVideo(reg);
  return true;
}

async function abrirVideo(reg, inicio, origem = 'youtube') {
  if (S.player) encerrarPlayer();
  zerarLegendaYoutube();
  zerarAnuncio();
  $('#tela-bloqueio').hidden = true;
  S.origem = origem;
  $('#btn-voltar').setAttribute('aria-label', !APP_NOVO ? 'Voltar para a biblioteca' : origem === 'youtube' ? 'Voltar ao YouTube' : 'Voltar para Meus vídeos');
  const corrigido = corrigirPapeisSalvos(reg);
  clearTimeout(timerToast);
  $('#toast').hidden = true;
  S.registro = reg;
  S.inicio = inicio;
  zerarRede();
  S.pronto = false;
  S.primeiroPlay = false;
  S.tocandoLogico = false;
  S.ajustouVelInicio = false;
  S.tituloConferido = false;
  S.gestosNestaAbertura = false;
  S.histVideo = null;
  // O app já busca no YouTube o que precisa para pôr o vídeo no histórico: quando o vídeo começar, o
  // registro sai na hora (antes, essa busca só começava com o vídeo tocando e atrasava tudo).
  if (ANDROID && APK >= 11) mandarAoApp({ acao: 'historico', evento: 'preparar', video: reg.id, tempo: 0 });
  cancelarToqueLivre();
  zerarRepeticao();
  fecharMenuTraducao();
  atualizarBotaoTraducao();
  atualizarBotaoModoLegenda();
  if (S.modelo) S.modelo.ctrl.abort(); // o modelo trabalhava para o vídeo anterior
  reprocessar();
  pontuarAoFundo(); // vídeo salvo antes do pacote: ganha a pontuação melhorada agora
  $('#titulo-video').textContent = tituloAtual();
  $('#erro-player').hidden = true;
  $('#aviso-toque').hidden = true;
  // App Android, vídeo novo: a legenda vem do próprio vídeo. Até ela ficar pronta, o vídeo fica coberto
  // pela roda girando, sem botão "Tocar": ele começa sozinho depois de "Começar" na escolha do idioma.
  const preparar = ANDROID && !reg.estudo;
  // App Android, vídeo já salvo (tocado no histórico do YouTube ou em Meus vídeos): começa sozinho, sem o
  // botão de tocar. Antes, a explicação dos gestos (se ainda não foi marcada "não mostrar mais").
  const sozinho = APP_NOVO && !!reg.estudo;
  mostrarPreparandoVideo(preparar);
  $('#btn-tocar-grande').hidden = preparar || sozinho;
  esconderParaEntrada(false);
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
    if (S.velPedida && Math.abs(S.velPedida.v - v) < 1e-3 && performance.now() - S.velPedida.quando < 5000) {
      S.ajustes.velocidade = v;
      salvar();
      S.velPedida = null;
    }
    if (!$('#painel-ajustes').hidden) montarVelocidades();
  });
  p.on('erro', (codigo) => {
    // Erro por falta de internet (ou internet travada): não mostra o erro; o player é recarregado no mesmo
    // ponto quando a conexão voltar. Erros do próprio vídeo (proibido, não existe) aparecem como antes.
    if (![2, 100, 101, 150].includes(codigo) && (!S.rede.online || S.rede.travadoDesde)) {
      diag(`erro ${codigo} do player com a internet ${S.rede.online ? 'fraca' : 'caída'}: recarrega quando voltar`);
      S.rede.recarregar = true;
      S.rede.querTocar = S.rede.querTocar || S.tocandoLogico;
      atualizarAvisoRede(true);
      if (S.rede.online) setTimeout(() => { if (S.player === p) recuperarRede(); }, 3000);
      return;
    }
    // Erro do player durante a espera da legenda: a janela sai para mostrar o erro.
    if (S.yt.fase) { S.yt.fase = null; S.yt.preparando = false; S.yt.geracao++; $('#tela-carregando').hidden = true; }
    mostrarErroPlayer(codigo);
  });
  p.on('autoplayBloqueado', mostrarAvisoToque);
  if (ANDROID && !reg.estudo) p.manterLegendas?.(true);
  iniciarLaco();
  // Vídeo salvo sem a explicação dos gestos para mostrar antes: o player já nasce tocando (autoplay), sem
  // esperar o "pronto" e o pedido de tocar (versão 16: abre mais rápido, direto no ponto salvo).
  const tocarJa = sozinho && !(precisaExplicarGestos() && !S.gestosNestaAbertura);
  if (sozinho) iniciarSozinho(p);
  try {
    await p.carregar(reg.id, inicio, { tocar: tocarJa });
  } catch (e) {
    if (S.player !== p) return;
    diag(`player não carregou: ${detalheErro(e)}`);
    if (!S.rede.online) {
      // Sem internet: em vez do erro, o aviso de reconexão; o vídeo abre sozinho quando a internet voltar.
      S.rede.reabrir = { reg, inicio, origem };
      mostrarPreparandoVideo(false);
      atualizarAvisoRede();
      return;
    }
    mostrarErroPlayer(null, MSG_API);
    return;
  }
  if (S.player !== p) return;
  S.pronto = true;
  aplicarVelocidadeSalva();
  lerTitulo();
  if (ANDROID && !reg.estudo) escolherLegendaYoutube();
  if (corrigido) toast(`As legendas estavam trocadas e foram arrumadas: a tradução (${nomeIdioma(idiomaAlvo())}) fica embaixo.`, 4000);
  $('#titulo-video').textContent = tituloAtual();
  atualizarProgresso(true);
}

/** Roda girando por cima do vídeo (app Android, enquanto a legenda é preparada). */
function mostrarPreparandoVideo(sim) {
  $('#video-preparando').hidden = !sim;
}

function encerrarPlayer() {
  voz.desligar();
  pararAceleracao();
  mostrarPreparandoVideo(false);
  salvarPosicao();
  if (S.player?.estado() === 1) avisarHistorico('progresso', true);
  cancelAnimationFrame(S.raf);
  S.raf = 0;
  try { S.player?.destruir(); } catch { /* nada */ }
  S.player = null;
  soltarTelaLigada();
}

function fecharVideo() {
  S.fimExplicacao?.(false);
  esconderParaEntrada(false);
  zerarRede();
  zerarLegendaYoutube();
  zerarAnuncio();
  $('#tela-idioma').hidden = true;
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

/** A velocidade escolhida nos Ajustes, entre as que o player aceita. */
function velocidadeSalvaAlvo() {
  const vels = listaVelocidades();
  return vels.reduce((a, b) => (Math.abs(b - S.ajustes.velocidade) < Math.abs(a - S.ajustes.velocidade) ? b : a), vels[0] ?? 1);
}

function aplicarVelocidadeSalva() {
  const p = S.player;
  if (!p) return;
  if (S.rapido) return; // segurando o dedo no vídeo (2×): a velocidade salva volta ao soltar
  const alvo = velocidadeSalvaAlvo();
  S.velConfirmada = p.velocidade() || 1;
  if (Math.abs(alvo - S.velConfirmada) > 1e-6) {
    if (velocidadeFina()) {
      S.velPedida = { v: alvo, quando: performance.now() };
      p.definirVelocidadeExata(alvo);
    } else {
      p.definirVelocidade(alvo);
    }
  }
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
  esconderParaEntrada(false);
  mostrarPreparandoVideo(false);
  $('#btn-tocar-grande').hidden = true;
  $('#aviso-toque').hidden = true;
}

// ============================================================ tradução automática

function traducaoAutomaticaAtiva() {
  if (!S.registro || S.registro.traducao || S.ajustes.destino === 'nao') return false;
  // Vídeo já no idioma da tradução (ex.: vídeo em português, tradução para português): nada a traduzir.
  return !mesmoIdioma(S.registro.estudo?.idioma, S.ajustes.destino);
}

/** Preenche uma lista de idiomas: opções fixas no começo ([valor, texto]) e depois todos os idiomas. */
function montarListaIdiomas(sel, fixas) {
  const atual = sel.value;
  sel.textContent = '';
  for (const [v, texto] of fixas) {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = texto;
    sel.appendChild(o);
  }
  for (const { codigo, nome } of listaIdiomas(IDIOMA_UI)) {
    const o = document.createElement('option');
    o.value = codigo;
    o.textContent = nome;
    o.setAttribute('translate', 'no'); // o nome já vem no idioma do celular
    sel.appendChild(o);
  }
  if (atual) sel.value = atual;
}

function montarListasIdiomas() {
  const naoTraduzir = ['nao', 'Não traduzir'];
  montarListaIdiomas($('#sel-traducao-video'), [naoTraduzir]);
  montarListaIdiomas($('[data-ajuste="destino"]'), [naoTraduzir]);
  montarListaIdiomas($('[data-ajuste="idioma"]'), [['auto', 'Descobrir sozinho']]);
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
      de: idiomaOrigem(),
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
  if (S.yt.estado === 'pegando') partes.push('Pegando a legenda do YouTube…');
  else if (S.yt.estado === 'erro') { partes.push('Não consegui pegar a legenda do YouTube.'); erro = true; }
  else if (S.yt.estado === 'sem') partes.push(APP_NOVO ? 'Este vídeo não tem legenda no YouTube.' : 'Este vídeo não tem legenda no YouTube. Use arquivos (DownSub).');
  if (S.modelo && S.modelo.reg === S.registro) {
    const m = S.modelo;
    partes.push(m.total ? `Pontuação melhorada… ${Math.floor((100 * m.feitas) / m.total)}%` : 'Pontuação melhorada: preparando…');
  } else if (S.frases) {
    partes.push(S.pontuadaModelo ? 'Pontuação melhorada (modelo no celular)' : S.pontuada ? 'Frases e pontuação montadas pelo app' : 'Frases montadas pelo app');
  }
  if (traducaoAutomaticaAtiva()) {
    const nome = nomeIdioma(S.ajustes.destino);
    const tr = S.trad;
    if (tr.estado === 'traduzindo') {
      const pct = tr.total ? Math.floor((100 * tr.feitos) / tr.total) : 0;
      partes.push(`Traduzindo (${nome})… ${pct}%`);
    } else if (tr.estado === 'ok') {
      partes.push(`Tradução automática (${nome})`);
    } else if (tr.estado === 'erro') {
      partes.push('Não consegui traduzir. Confira a internet.');
      erro = true;
    }
  }
  $('#aviso-legenda').textContent = partes.join(' · ');
  $('#btn-tentar-traducao').hidden = !erro;
}

// ============================================================ legenda do próprio YouTube (app Android, 15.10)
// O app Android injeta um gancho no player do YouTube que manda para esta página uma cópia de
// cada legenda que o player baixa (/api/timedtext). Aqui: escolher a faixa, pedir e guardar.

function chaveFaixa(languageCode, asr) {
  return `${languageCode}|${asr ? 'asr' : ''}`;
}

/** Nome do idioma de uma faixa (código do YouTube) no idioma do celular: 'en-US' → "Inglês (Estados Unidos)". */
function nomeCodigo(codigo) {
  return nomeCodigoIdioma(codigo, IDIOMA_UI);
}

function nomeFaixa(f) {
  // O YouTube chama de "English (auto-generated)": fica "Inglês (automática)".
  if (f.kind === 'asr') return `${nomeCodigo(f.languageCode) || f.languageName || f.languageCode} (${t('automática')})`;
  return nomeCodigo(f.languageCode) || f.languageName || f.displayName || f.languageCode;
}

const mesmaFaixa = (a, b) => a.languageCode === b.languageCode && (a.kind === 'asr') === (b.kind === 'asr');

/**
 * Faixas do vídeo aberto: as do gancho do app (lidas dentro do player, inclusive as automáticas)
 * mais as da API do iframe (que deixa as automáticas de fora).
 */
function juntarFaixas(p) {
  const reg = S.registro;
  const g = S.yt.gancho && reg && S.yt.gancho.video === reg.id ? S.yt.gancho.faixas : [];
  const a = p.faixasLegenda().faixas;
  const lista = g.map((f) => ({ ...f }));
  for (const f of a) if (!lista.some((x) => mesmaFaixa(x, f))) lista.push(f);
  return { faixas: lista, doGancho: g.length, daApi: a.length };
}

function zerarLegendaYoutube() {
  clearTimeout(S.yt.timer);
  const geracao = S.yt.geracao + 1;
  S.yt = novoEstadoYt();
  S.yt.geracao = geracao; // cancela as esperas que estavam em andamento
  $('#tela-carregando').hidden = true;
}

/**
 * Pega a legenda do YouTube. O player só informa quais legendas o vídeo tem depois que o vídeo começa
 * (e depois do anúncio, se houver): por isso o vídeo toca sem som atrás da janela "Carregando a legenda"
 * e volta ao começo, com som, quando a legenda chega.
 */
async function escolherLegendaYoutube(trocando = false) {
  const p = S.player;
  const reg = S.registro;
  if (!p || !reg || !p.faixasLegenda) return;
  clearTimeout(S.yt.timer);
  const geracao = ++S.yt.geracao;
  const vale = () => S.player === p && S.registro === reg && S.yt.geracao === geracao;
  p.manterLegendas?.(true);
  S.yt.trocando = trocando;
  S.yt.tentativas = 0;
  S.yt.faixa = null;
  S.yt.estado = 'pegando';
  $('#erro-player').hidden = true;
  atualizarAviso();
  diag(`procurando legendas${trocando ? ' (troca de idioma)' : ''}; app ${APK || '?'}`);
  p.pedirFaixasAoGancho?.();
  let r = juntarFaixas(p);
  if (!r.faixas.length) {
    if (!S.yt.preparando) {
      S.yt.retorno = { tempo: trocando ? p.tempo() : S.inicio, tocava: trocando && p.estado() === 1 };
      S.yt.preparando = true;
    }
    S.yt.fase = 'procurando';
    mostrarCarregando();
    p.silenciar?.(true);
    if (p.estado() !== 1) p.tocar();
    r = await esperarFaixas(p, vale);
    if (!r) return; // fechou o vídeo, cancelou ou o vídeo não começou
  }
  diag(`faixas: ${r.faixas.length} (gancho ${r.doGancho ?? 0}, API ${r.daApi ?? 0}): ${r.faixas.map((f) => `${f.languageCode}${f.kind === 'asr' ? '/asr' : ''}`).join(', ') || 'nenhuma'}`);
  if (!r.faixas.length) {
    S.yt.estado = 'sem';
    S.yt.fase = 'sem';
    p.esconderLegendas?.();
    atualizarAviso();
    mostrarCarregando();
    return;
  }
  const idiomaAudio = await descobrirIdiomaAudio(r.faixas, vale);
  if (!vale()) return;
  S.yt.fase = 'escolhendo';
  $('#tela-carregando').hidden = true;
  // O vídeo não toca atrás da janela de escolha: para aqui e só começa depois de "Começar"
  // (finalizarPreparo, quando a legenda chega). Cancelar devolve como estava.
  if (!S.yt.preparando) {
    S.yt.retorno = { tempo: trocando ? p.tempo() : S.inicio, tocava: trocando && p.estado() === 1 };
    S.yt.preparando = true;
  }
  p.silenciar?.(true);
  p.pausar();
  const escolha = await perguntarIdioma(r.faixas, trocando, idiomaAudio);
  if (!vale()) return;
  if (!escolha) {
    S.yt.estado = 'ocioso';
    atualizarAviso();
    if (trocando) {
      finalizarPreparo(S.yt.retorno?.tocava);
    } else if (APP_NOVO || !S.primeiroPlay || S.yt.preparando) {
      // Vídeo novo sem legenda escolhida: não há o que estudar. Volta (ao YouTube, no app novo).
      voltarParaBiblioteca();
    }
    return;
  }
  if (escolha.mudouDestino && escolha.destino !== S.ajustes.destino) {
    S.ajustes.destino = escolha.destino;
    S.ajustes.destinoManual = true; // a pessoa escolheu: deixa de seguir o idioma do celular
    salvar();
  }
  S.yt.fase = 'baixando';
  // Vídeo novo: "Baixando a legenda" só aparece se demorar mais que a pausa entre as janelas.
  S.yt.carregandoApos = trocando ? 0 : performance.now() + SAIDA_JANELA + PAUSA_ENTRE_JANELAS;
  mostrarCarregando();
  pedirFaixa(escolha.faixa);
}

/**
 * Idioma do áudio original do vídeo, para pré-selecionar a legenda do idioma falado:
 * 1) o gancho do app (faixas de áudio do player: a marcada como original);
 * 2) com legendas automáticas em mais de um idioma (vídeo com dublagem automática) e sem a
 *    informação do player, o idioma do título do vídeo, descoberto pelo tradutor.
 * Devolve '' quando não precisa (uma automática só: ela já indica o idioma) ou não descobre.
 */
async function descobrirIdiomaAudio(faixas, vale) {
  const reg = S.registro;
  const g = S.yt.gancho;
  if (g && reg && g.video === reg.id && g.audio) return g.audio;
  const doPlayer = S.player?.idiomaAudio?.() || '';
  if (doPlayer) return doPlayer;
  const asr = [...new Set(faixas.filter((f) => f.kind === 'asr').map((f) => String(f.languageCode).split('-')[0]))];
  if (asr.length < 2) return '';
  const titulo = reg?.titulo || S.player?.titulo?.() || '';
  if (!titulo) return '';
  const controle = new AbortController();
  const limite = setTimeout(() => controle.abort(), 3000);
  try {
    const idioma = await detectarIdiomaTexto(titulo, controle.signal);
    if (!vale()) return '';
    const bate = asr.find((c) => mesmoIdioma(c, idioma));
    diag(`várias automáticas (${asr.join(', ')}): título em ${idioma || '?'}${bate ? '' : ' (sem automática nesse idioma)'}`);
    return bate || '';
  } catch {
    return '';
  } finally {
    clearTimeout(limite);
  }
}

/** Espera o player informar as faixas. Devolve { faixas } (vazio: o vídeo não tem legenda) ou null. */
async function esperarFaixas(p, vale) {
  let tocandoSemLegenda = 0; // ms do vídeo de verdade tocando sem o player informar legenda
  let parado = 0; // ms sem tocar (nem anúncio)
  let esperaGancho = 0; // a API achou faixas, mas o gancho (que vê também as automáticas) ainda não listou
  let semConfirmado = 0; // ms com o gancho dizendo que a resposta do YouTube não tem legenda
  let ultimoTempo = p.tempo();
  let ultimoEstado = null;
  for (;;) {
    await espera(500);
    if (!vale() || S.yt.fase !== 'procurando') return null;
    const r = juntarFaixas(p);
    if (r.faixas.length) {
      if (!r.doGancho && S.yt.vistoGancho && esperaGancho < 2000) { esperaGancho += 500; continue; }
      return r;
    }
    const t = p.tempo();
    // Só conta o vídeo de verdade andando: num anúncio o tempo do vídeo fica parado
    // (vale mesmo se o aviso de anúncio do gancho falhar).
    const andou = t - ultimoTempo > 0.2;
    ultimoTempo = t;
    const est = p.estado();
    if (est !== ultimoEstado) { diag(`player: estado ${est}, ${t.toFixed(1)} s${S.anuncio.ativo ? ', anúncio' : ''}`); ultimoEstado = est; }
    if (S.anuncio.ativo) { parado = 0; continue; } // durante o anúncio o player não informa as legendas
    if (est === 1) {
      parado = 0;
      if (andou) tocandoSemLegenda += 500;
      const g = S.yt.gancho;
      if (g && g.video === S.registro?.id && g.semCaptions && andou) semConfirmado += 500;
      // O gancho viu a resposta do YouTube sem nenhuma legenda: confirma em 1,5 s. Sem essa certeza, 12 s.
      if (semConfirmado >= 1500 || tocandoSemLegenda >= 12000) return { faixas: [], traducoes: [], doGancho: 0, daApi: 0 };
    } else {
      parado += 500;
      if (parado % 3000 === 0) { p.silenciar?.(true); p.tocar(); } // insiste: o player pode ter ignorado
      if (parado >= 20000) {
        S.yt.fase = 'parado';
        S.yt.estado = 'erro';
        atualizarAviso();
        mostrarCarregando();
        return null;
      }
    }
  }
}

/** Fim da espera: o vídeo volta ao ponto de antes, com som; tocando se for o caso. */
function finalizarPreparo(tocar) {
  const p = S.player;
  const ret = S.yt.retorno;
  S.yt.fase = null;
  $('#tela-carregando').hidden = true;
  mostrarPreparandoVideo(false);
  if (!p || !S.yt.preparando) return;
  S.yt.preparando = false;
  S.yt.retorno = null;
  if (!tocar) p.pausar();
  p.irPara(ret ? ret.tempo : S.inicio);
  p.silenciar?.(false);
  S.memoriaNav = null;
  S.alvoNav = null;
  if (tocar && p.estado() !== 1) p.tocar();
  if (tocar) {
    entradaSuave();
    // O vídeo pode já estar tocando (sem som, por baixo): sem troca de estado, avisa o histórico aqui.
    setTimeout(() => {
      if (S.player === p && p.estado() === 1 && !S.anuncio.ativo && !S.yt.fase && !S.yt.preparando) avisarHistorico('inicio');
    }, 1500);
  }
  renderLegenda(true);
}

/** Janela "Carregando a legenda": textos e botões conforme a fase e o anúncio. */
function mostrarCarregando() {
  const f = S.yt.fase;
  const tela = $('#tela-carregando');
  if (!f || f === 'escolhendo' || f === 'gestos') { tela.hidden = true; return; }
  const a = S.anuncio;
  // Logo depois da escolha do idioma: espera a pausa entre as janelas (com anúncio, aparece na hora).
  const falta = (S.yt.carregandoApos || 0) - performance.now();
  if (falta > 0 && (f === 'baixando' || f === 'procurando') && !a.ativo) {
    tela.hidden = true;
    clearTimeout(S.yt.timerCarregando);
    S.yt.timerCarregando = setTimeout(mostrarCarregando, falta + 10);
    return;
  }
  let titulo = 'Carregando a legenda…';
  let texto = 'Aguarde: o vídeo começa quando a legenda estiver pronta.';
  if (f === 'baixando') titulo = 'Baixando a legenda…';
  if ((f === 'procurando' || f === 'baixando') && a.ativo) {
    texto = a.pulavel
      ? 'Há um anúncio antes do vídeo. Toque em Pular anúncio para continuar.'
      : 'Há um anúncio antes do vídeo. A legenda carrega quando ele terminar (o botão Pular aparece em alguns segundos, se o anúncio permitir).';
  }
  if (f === 'sem') {
    const g = S.yt.gancho;
    const certeza = !!g && g.video === S.registro?.id && g.semCaptions;
    titulo = certeza ? 'Este vídeo não tem legenda' : 'Não achei a legenda deste vídeo';
    texto = certeza
      ? 'O YouTube não tem legenda para este vídeo, nem a automática. Escolha outro vídeo.'
      : !S.yt.vistoGancho && ANDROID
        ? 'Instale a versão nova do app (o mesmo link de sempre): ela acha também as legendas automáticas. Depois tente de novo.'
        : 'Toque em Copiar diagnóstico e mande para o Claude, para ele achar o problema.';
  } else if (f === 'erro') {
    titulo = 'Não consegui baixar a legenda';
    texto = 'Confira a internet e toque em Tentar de novo.';
  } else if (f === 'parado') {
    titulo = 'O vídeo não começou';
    texto = 'O YouTube não começou o vídeo, por isso a legenda não carregou. Toque em Tentar de novo.';
  } else if (f === 'pontuando') {
    const m = S.modelo;
    titulo = 'Pontuando a legenda…';
    texto = m?.total
      ? `Pontuação melhorada: ${Math.floor((100 * m.feitas) / m.total)}%. O modelo roda no celular; leva alguns segundos.`
      : 'Pontuação melhorada: preparando o modelo no celular…';
  }
  const esperando = f === 'procurando' || f === 'baixando' || f === 'pontuando';
  $('#carregando-titulo').textContent = titulo;
  $('#carregando-texto').textContent = texto;
  $('#carregando-roda').hidden = !esperando;
  $('#carregando-pular').hidden = !(esperando && a.ativo && a.pulavel);
  $('#carregando-sem').hidden = f !== 'sem' || S.yt.trocando;
  $('#carregando-tentar').hidden = !(f === 'erro' || f === 'parado' || (f === 'sem' && !S.yt.trocando));
  $('#carregando-diag').hidden = !(f === 'sem' || f === 'erro' || f === 'parado');
  $('#carregando-voltar').textContent = S.yt.trocando ? 'Cancelar' : APP_NOVO && S.origem === 'youtube' ? 'Voltar ao YouTube' : 'Voltar';
  $('#carregando-voltar').hidden = f === 'pontuando';
  $('#carregando-simples').hidden = f !== 'pontuando';
  tela.hidden = false;
}

/** Botão Voltar/Cancelar da janela de carregamento (e o voltar do celular). */
function cancelarCarregando() {
  if (S.yt.fase === 'pontuando') { pularPontuacao(); return; } // a legenda já chegou: segue com a simples
  const trocando = S.yt.trocando;
  clearTimeout(S.yt.timer);
  S.yt.geracao++;
  S.yt.estado = 'ocioso';
  S.yt.faixa = null;
  atualizarAviso();
  if (trocando) {
    finalizarPreparo(S.yt.retorno?.tocava);
    return;
  }
  S.yt.fase = null;
  $('#tela-carregando').hidden = true;
  voltarParaBiblioteca();
}

/**
 * Pausa entre a saída da janela do idioma e a entrada da explicação dos gestos (pedido de 22/11): as janelas
 * não emendam uma na outra. Conta a partir do fim da animação de saída da janela do idioma (0,2 s).
 * A janela "Baixando a legenda" também espera esse tempo: se a legenda chegar antes, ela nem aparece.
 */
const PAUSA_ENTRE_JANELAS = 1000;
const SAIDA_JANELA = 200;
const esperarMs = (ms) => new Promise((r) => setTimeout(r, ms));

/** Janela de escolha: idioma da legenda (as faixas do vídeo) e tradução. Devolve { faixa, destino } ou null. */
function perguntarIdioma(faixas, trocando = false, idiomaAudio = '') {
  return new Promise((resolve) => {
    const sel = $('#sel-legenda-video');
    sel.textContent = '';
    faixas.forEach((f, i) => {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = nomeFaixa(f);
      sel.appendChild(o);
    });
    const sugerida = faixaSugerida(faixas, S.ajustes.idioma, idiomaAudio);
    sel.value = String(sugerida);
    S.faixasEscolha = faixas;
    sel.onchange = atualizarCartaoPontuacao;
    atualizarCartaoPontuacao();
    const audio = idiomaAudio || (faixas[sugerida]?.kind === 'asr' ? faixas[sugerida].languageCode : '');
    const dica = $('#idioma-dica-audio');
    dica.textContent = audio ? `Pré-selecionada pelo áudio do vídeo: ${nomeCodigo(audio) || audio}.` : '';
    dica.hidden = !audio;
    const trad = $('#sel-traducao-video');
    trad.value = S.ajustes.destino;
    let mudouDestino = false;
    trad.onchange = () => { mudouDestino = true; };
    $('#idioma-cancelar').textContent = trocando ? 'Cancelar' : APP_NOVO && S.origem === 'youtube' ? 'Voltar ao YouTube' : 'Voltar';
    const tela = $('#tela-idioma');
    tela.hidden = false;
    $('#idioma-ok').focus();
    const fim = (r) => {
      tela.hidden = true;
      S.idiomaSaiuEm = r ? performance.now() + SAIDA_JANELA : 0;
      $('#idioma-ok').onclick = null;
      $('#idioma-cancelar').onclick = null;
      trad.onchange = null;
      sel.onchange = null;
      resolve(r);
    };
    $('#idioma-ok').onclick = () => fim({ faixa: faixas[Number(sel.value)], destino: trad.value, mudouDestino });
    $('#idioma-cancelar').onclick = () => fim(null);
  });
}

/** Pede a faixa ao player. Se a legenda não chegar, tenta de novo (o player pode estar num anúncio). */
function pedirFaixa(faixa) {
  const p = S.player;
  if (!p) return;
  S.yt.faixa = faixa;
  S.yt.estado = 'pegando';
  atualizarAviso();
  // Já chegou antes (o player baixa sozinho a legenda do idioma do aparelho): usa na hora.
  const guardada = S.yt.capturas.get(chaveFaixa(faixa.languageCode, faixa.kind === 'asr'));
  if (guardada) { aplicarLegendaYoutube(guardada); return; }
  // O player só baixa a legenda com o vídeo andando: toca sem som se estiver parado.
  if (p.estado() !== 1) {
    if (!S.yt.preparando) {
      S.yt.retorno = { tempo: p.tempo(), tocava: false };
      S.yt.preparando = true;
    }
    p.silenciar?.(true);
    p.tocar();
  }
  S.yt.tentativas += 1;
  diag(`pedindo ${faixa.languageCode}${faixa.kind === 'asr' ? '/asr' : ''} (tentativa ${S.yt.tentativas})`);
  p.pedirLegenda(faixa);
  p.baixarPeloGancho?.(faixa); // dentro do player: pelo próprio player e, se ele não baixar, direto
  clearTimeout(S.yt.timer);
  S.yt.timer = setTimeout(() => {
    if (S.player !== p || S.yt.estado !== 'pegando' || S.yt.faixa !== faixa) return;
    if (S.anuncio.ativo) { S.yt.tentativas -= 1; pedirFaixa(faixa); return; } // anúncio não conta tentativa
    if (S.yt.tentativas < 8) { pedirFaixa(faixa); return; }
    S.yt.estado = 'erro';
    atualizarAviso();
    if (S.yt.fase === 'baixando') { S.yt.fase = 'erro'; mostrarCarregando(); }
  }, 8000);
}

// ============================================================ faixas e downloads vistos pelo gancho

function deQuadroDoPlayer(ev) {
  const p = S.player;
  if (!p) return false;
  if (!MOCK) {
    let host = '';
    try { host = new URL(ev.origin).hostname; } catch { /* nada */ }
    if (!/(^|\.)youtube(-nocookie)?\.com$/.test(host)) return false;
  }
  const janela = p.janela?.();
  return !janela || ev.source === janela;
}

function aoReceberDoGancho(ev) {
  const d = ev.data;
  if (!ANDROID || !d || typeof d !== 'object' || !(d.ldFaixas === true || d.ldBaixou === true)) return;
  if (!deQuadroDoPlayer(ev)) return;
  const texto = (v) => (typeof v === 'string' ? v.slice(0, 80) : '');
  if (d.ldBaixou) {
    const linha = d.ok ? `download direto ok (${d.tamanho} letras)` : `download direto falhou: ${texto(d.motivo) || `HTTP ${d.status}, ${d.tamanho} letras`}`;
    S.yt.baixou.push(linha);
    diag(linha + (d.token ? ', com token' : ''));
    return;
  }
  const faixas = (Array.isArray(d.faixas) ? d.faixas : [])
    .filter((f) => f && typeof f.languageCode === 'string' && f.languageCode)
    .map((f) => ({ languageCode: f.languageCode, kind: f.kind === 'asr' ? 'asr' : texto(f.kind), languageName: texto(f.languageName), vss_id: texto(f.vss_id) }));
  const novo = {
    video: texto(d.video), faixas, fontes: Array.isArray(d.fontes) ? d.fontes.map(texto).join('+') : '',
    status: texto(d.status), semCaptions: !!d.semCaptions, temResposta: !!d.temResposta,
    getPlayerResponse: !!d.getPlayerResponse, versao: Number(d.versao) || 0,
    aoVivo: d.aoVivo === true, agendado: d.agendado === true,
    // Idioma do áudio original (gancho v4): o idioma falado no vídeo, mesmo com dublagens.
    audio: d.audio && typeof d.audio === 'object' ? texto(d.audio.original) : '',
    audioFonte: d.audio && typeof d.audio === 'object' ? texto(d.audio.fonte) : '',
  };
  const antes = S.yt.gancho;
  if (!S.yt.vistoGancho) diag(`gancho v${novo.versao} respondeu`);
  S.yt.vistoGancho = true;
  if (!antes || antes.video !== novo.video || antes.faixas.length !== faixas.length || antes.semCaptions !== novo.semCaptions || antes.fontes !== novo.fontes || antes.audio !== novo.audio) {
    diag(`gancho: vídeo ${novo.video || '?'}, ${faixas.length} faixas (${faixas.map((f) => `${f.languageCode}${f.kind === 'asr' ? '/asr' : ''}`).join(', ') || '—'}), fontes ${novo.fontes || '—'}, resposta ${novo.temResposta ? novo.status || 'sim' : 'não'}${novo.semCaptions ? ', SEM legendas' : ''}${novo.audio ? `, áudio original ${novo.audio} (${novo.audioFonte || '?'})` : ''}`);
  }
  S.yt.gancho = novo;
  // Gancho v5: velocidades de 0,05 em 0,05. Vale para a sessão toda (é o mesmo app).
  if (d.velFina === true && !S.velFina) {
    S.velFina = true;
    aplicarVelocidadeSalva();
    if (!$('#painel-ajustes').hidden) montarVelocidades();
  }
  conferirAoVivo();
}

// ============================================================ vídeos não suportados: ao vivo e Shorts

/** Link de um vídeo Shorts (youtube.com/shorts/...). */
function ehShorts(texto) {
  return /(^|[/.])youtube\.com\/shorts\//i.test(String(texto || ''));
}

/**
 * Transmissão ao vivo (ou agendada): o app precisa da legenda inteira do vídeo, que uma live ainda não tem.
 * Fontes: o gancho do app (resposta do YouTube: isLive/isUpcoming) e o player (getVideoData().isLive).
 */
function conferirAoVivo() {
  const reg = S.registro;
  const p = S.player;
  if (!ANDROID || !reg || !p || reg.estudo || !$('#tela-bloqueio').hidden) return;
  const g = S.yt.gancho;
  const doGancho = !!g && g.video === reg.id && (g.aoVivo || g.agendado);
  let doPlayer = false;
  try { doPlayer = !!p.aoVivo?.(); } catch { /* nada */ }
  if (!doGancho && !doPlayer) return;
  diag(`vídeo ao vivo (${doGancho ? 'gancho' : 'player'}${g?.agendado ? ', agendado' : ''}): não suportado`);
  // Para tudo o que esperava a legenda (janelas, tentativas) e o próprio vídeo.
  clearTimeout(S.yt.timer);
  S.yt.geracao++;
  S.yt.estado = 'ocioso';
  S.yt.fase = null;
  S.yt.faixa = null;
  S.yt.preparando = false;
  $('#tela-carregando').hidden = true;
  if (!$('#tela-idioma').hidden) $('#idioma-cancelar').click(); // a espera da escolha termina sem efeito
  try { p.silenciar?.(true); p.pausar(); } catch { /* nada */ }
  atualizarAviso();
  mostrarBloqueio(g?.agendado && !g?.aoVivo ? 'agendado' : 'aoVivo');
}

/** Janela "não suportado" com um botão só, que volta ao YouTube. */
function mostrarBloqueio(tipo) {
  const textos = {
    aoVivo: ['Vídeos ao vivo não são suportados',
      'Esta é uma transmissão ao vivo. O Legenda Dupla precisa da legenda completa do vídeo para montar as falas, e uma live ainda não tem. Quando a transmissão terminar e ficar salva no canal, tente de novo.'],
    agendado: ['Vídeos ao vivo não são suportados',
      'Esta transmissão ao vivo ainda não começou. O Legenda Dupla só abre vídeos já gravados: quando a live terminar e ficar salva no canal, tente de novo.'],
    shorts: ['Vídeos Shorts não são suportados',
      'O Legenda Dupla é feito para os vídeos normais do YouTube. Volte e escolha outro vídeo.'],
  };
  const [titulo, texto] = textos[tipo] || textos.aoVivo;
  $('#bloqueio-selo').dataset.tipo = tipo === 'shorts' ? 'shorts' : 'aoVivo';
  $('#bloqueio-titulo').textContent = titulo;
  $('#bloqueio-texto').textContent = texto;
  $('#bloqueio-voltar').textContent = APP_NOVO ? 'Voltar ao YouTube' : 'Voltar';
  fecharPaineis();
  fecharCartao();
  fecharMenuTraducao();
  $('#tela-bloqueio').hidden = false;
  if (trocaDoApp) { trocaDoApp = false; avisarTelaPronta(); }
  $('#bloqueio-voltar').focus();
  try { navigator.vibrate?.(30); } catch { /* nada */ }
}

/** Único botão da janela: sai do vídeo (se abriu) e volta ao YouTube. */
function sairDoBloqueio() {
  $('#tela-bloqueio').hidden = true;
  if (S.registro) {
    const doYoutube = S.origem === 'youtube';
    voltarParaBiblioteca(); // o vídeo veio do YouTube: a rota fecha o vídeo e volta para lá
    if (APP_NOVO && !doYoutube) abrirYoutube('');
  } else if (APP_NOVO) {
    abrirYoutube('');
  }
}

/** Texto do diagnóstico para o usuário colar na conversa. */
function textoDiagnostico() {
  const g = S.yt.gancho;
  const p = S.player;
  let api = 0;
  try { api = p?.faixasLegenda?.().faixas.length || 0; } catch { /* nada */ }
  return [
    'Legenda Dupla — diagnóstico da legenda',
    `Data: ${new Date().toLocaleString('pt-BR')}`,
    `App: versão ${APK || '?'}; vídeo: ${S.registro?.id || '?'}`,
    `Faixas pela API do iframe: ${api}`,
    g ? `Gancho v${g.versao}: vídeo ${g.video || '?'}, ${g.faixas.length} faixas (${g.faixas.map((f) => `${f.languageCode}${f.kind === 'asr' ? '/asr' : ''}`).join(', ') || '—'}), fontes ${g.fontes || '—'}, resposta do player ${g.temResposta ? g.status || 'sim' : 'não'}, getPlayerResponse ${g.getPlayerResponse ? 'sim' : 'não'}${g.semCaptions ? ', resposta SEM legendas' : ''}` : 'Gancho: não respondeu',
    `Downloads diretos: ${S.yt.baixou.join(' | ') || 'nenhum'}`,
    `Legendas capturadas: ${[...S.yt.capturas.keys()].join(', ') || 'nenhuma'}`,
    'Linha do tempo:',
    ...S.yt.diag,
  ].join('\n');
}

async function copiarDiagnostico() {
  const t = textoDiagnostico();
  try {
    await navigator.clipboard.writeText(t);
  } catch {
    const area = document.createElement('textarea');
    area.value = t;
    document.body.appendChild(area);
    area.select();
    try { document.execCommand('copy'); } catch { /* nada */ }
    area.remove();
  }
  toast('Diagnóstico copiado. Cole na conversa com o Claude.', 3500);
}

// ============================================================ anúncios (app Android)
// O gancho do app avisa quando o player mostra anúncio e quando o "Pular" do YouTube aparece.

function zerarAnuncio() {
  S.anuncio = { ativo: false, pulavel: false, x: 0, y: 0, w: 0, h: 0 };
  document.body.classList.remove('toque-nativo');
  atualizarAnuncio();
}

function aoReceberAnuncio(ev) {
  const d = ev.data;
  if (!ANDROID || !d || typeof d !== 'object' || d.ldAnuncio !== true) return;
  const p = S.player;
  if (!p) return;
  if (!MOCK) {
    let host = '';
    try { host = new URL(ev.origin).hostname; } catch { /* nada */ }
    if (!/(^|\.)youtube(-nocookie)?\.com$/.test(host)) return;
  }
  const janela = p.janela?.();
  if (janela && ev.source !== janela) return; // aviso de outro quadro
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  S.anuncio = { ativo: !!d.ativo, pulavel: !!d.ativo && !!d.pulavel, x: n(d.x), y: n(d.y), w: n(d.w), h: n(d.h) };
  if (S.anuncio.ativo) p.revelar?.(); // o anúncio (e o "Pular") precisa aparecer
  atualizarAnuncio();
}

function atualizarAnuncio() {
  const a = S.anuncio;
  $('#selo-anuncio').hidden = !a.ativo;
  $('#selo-anuncio-texto').textContent = a.pulavel ? 'Anúncio' : 'Anúncio · aguarde';
  $('#btn-pular').hidden = !(a.ativo && a.pulavel);
  if (S.yt.fase === 'procurando' || S.yt.fase === 'baixando') mostrarCarregando();
}

let pulando = false;
/** "Pular anúncio": o gancho clica no botão do YouTube; se o YouTube ignorar, o app toca nele de verdade. */
async function pularAnuncio() {
  const p = S.player;
  if (!p || pulando) return;
  pulando = true;
  try {
    p.pularAnuncio?.();
    await espera(700);
    if (S.player !== p || !S.anuncio.ativo || !S.anuncio.pulavel) return;
    const r = p.retangulo?.();
    const a = S.anuncio;
    if (!r || !window.LDNativo || !APP_NOVO || a.w <= 0) {
      toast('O YouTube não deixou pular. Tente de novo em instantes.');
      return;
    }
    const x = r.left + a.x + a.w / 2;
    const y = r.top + a.y + a.h / 2;
    document.body.classList.add('toque-nativo'); // o toque passa por cima da janela e chega ao player
    try {
      window.LDNativo.postMessage(JSON.stringify({ acao: 'tocar', x, y, largura: window.innerWidth }));
    } catch { /* nada */ }
    await espera(900);
    document.body.classList.remove('toque-nativo');
    if (S.player === p && S.anuncio.ativo && S.anuncio.pulavel) toast('O YouTube não deixou pular. Tente de novo em instantes.');
  } finally {
    pulando = false;
  }
}

/** Cópia de uma legenda que o player baixou (vinda do gancho do app Android). */
function aoReceberLegenda(ev) {
  const d = ev.data;
  if (!ANDROID || !d || typeof d !== 'object' || d.ldLegenda !== true) return;
  let host = '';
  try { host = new URL(ev.origin).hostname; } catch { /* nada */ }
  if (!MOCK && !/(^|\.)youtube(-nocookie)?\.com$/.test(host)) return;
  const reg = S.registro;
  if (!reg) return;
  const info = infoUrl(d.url);
  const nome = `${info.idioma || '?'}${info.automatica ? '/asr' : ''}`;
  if (info.video === reg.id && Number(d.status) !== 200) diag(`legenda ${nome}: HTTP ${d.status} (${d.via || '?'})`);
  if (Number(d.status) !== 200) return;
  // Legenda de um anúncio (outro vídeo) ou traduzida pelo YouTube: não serve.
  if (info.video !== reg.id || info.traducao) return;
  const r = lerTimedText(d.texto);
  if (!r.falas?.length) { diag(`legenda ${nome} veio sem falas: ${r.erro || '?'} (${String(d.texto || '').length} letras, ${d.via || '?'})`); return; }
  const cap = { idioma: info.idioma, automatica: info.automatica, falas: r.falas };
  S.yt.capturas.set(chaveFaixa(info.idioma, info.automatica), cap);
  // Formato pedido pelo player (fmt) e quantas falas trazem o tempo de cada palavra: sem ele, a
  // legenda automática não ganha a pontuação pelas pausas (só a melhorada, que lê o texto).
  const comPalavras = r.falas.filter((x) => x.ps?.length).length;
  diag(`legenda capturada: ${info.idioma}${info.automatica ? '/asr' : ''}, ${r.falas.length} falas, ${r.formato}${info.formato ? ` (fmt=${info.formato})` : ''}, tempo por palavra em ${comPalavras} (${d.via || '?'})`);
  const f = S.yt.faixa;
  if (S.yt.estado === 'pegando' && f && f.languageCode === info.idioma && (f.kind === 'asr') === info.automatica) {
    aplicarLegendaYoutube(cap);
  }
}

function aplicarLegendaYoutube(cap) {
  const reg = S.registro;
  const p = S.player;
  if (!reg) return;
  clearTimeout(S.yt.timer);
  const titulo = reg.titulo || p?.titulo() || '';
  const nome = nomeFaixa(S.yt.faixa || { languageCode: cap.idioma, kind: cap.automatica ? 'asr' : '' });
  // "(auto-generated)" no nome faz o app montar frases inteiras, como nos arquivos do DownSub.
  const rotulo = cap.automatica ? `${nomeIdioma(codigoTradutor(cap.idioma) || cap.idioma, 'en')} (auto-generated)` : nome;
  reg.estudo = { arquivo: `[${rotulo}] ${titulo || 'YouTube'}`, falas: cap.falas, origem: 'youtube', idioma: cap.idioma, automatica: !!cap.automatica };
  if (S.yt.trocando) { reg.traducao = null; reg.ajusteEstudo = 0; reg.ajusteTraducao = 0; }
  reg.traducaoAuto = null;
  if (!reg.titulo && titulo) reg.titulo = titulo;
  S.yt.estado = 'ok';
  S.yt.faixa = null;
  S.tituloConferido = true; // a legenda veio do próprio vídeo: não há o que conferir
  p?.esconderLegendas?.();
  const concluir = async () => {
    // Vídeo novo: antes de começar, a explicação de como avançar e retroceder o vídeo (até a pessoa marcar
    // "não mostrar mais"). O vídeo espera parado, coberto; depois começa com entrada suave.
    if (!S.yt.trocando && (S.yt.preparando || S.yt.fase) && precisaExplicarGestos()) {
      S.yt.fase = 'gestos';
      const carregandoAberto = !$('#tela-carregando').hidden;
      $('#tela-carregando').hidden = true;
      p?.pausar();
      // 1 s entre a saída da janela do idioma e a explicação (e um instante depois de "Baixando a legenda").
      let espera = S.idiomaSaiuEm ? S.idiomaSaiuEm + PAUSA_ENTRE_JANELAS - performance.now() : 0;
      if (carregandoAberto) espera = Math.max(espera, SAIDA_JANELA + 250);
      S.idiomaSaiuEm = 0;
      if (espera > 0) {
        await esperarMs(espera);
        if (S.registro !== reg || S.player !== p || S.yt.fase !== 'gestos') return;
      }
      const seguir = await mostrarExplicacaoGestos();
      if (!seguir || S.registro !== reg || S.player !== p || S.yt.fase !== 'gestos') return;
    }
    // Vídeo novo: começa do início, com som. Troca de idioma: volta como estava.
    if (S.yt.preparando || S.yt.fase) finalizarPreparo(S.yt.trocando ? !!S.yt.retorno?.tocava : true);
    salvarVideo(reg);
    zerarRepeticao();
    reprocessar();
    atualizarAviso();
  };
  // Pontuação melhorada instalada: pontua antes de o vídeo começar (a janela mostra o andamento).
  const info = infoPontuacao(reg);
  if (info && (S.yt.preparando || S.yt.fase)) {
    S.yt.fase = 'pontuando';
    mostrarCarregando();
    pontuarComModelo(reg, info).finally(() => {
      if (S.registro === reg && S.yt.fase === 'pontuando') concluir();
    });
    return;
  }
  concluir();
  pontuarAoFundo();
}

// ============================================================ pontuação melhorada (modelo no celular)

/** O que mandar ao modelo para este vídeo, ou null (não se aplica, pacote ausente ou já pontuado). */
function infoPontuacao(reg) {
  if (!S.ajustes.pontuacaoModelo || !reg?.estudo?.falas) return null;
  const pac = pacoteDoIdioma(reg.estudo.idioma || '');
  if (!pac || S.pacotes[pac.id] !== 'pronto') return null;
  const info = palavrasParaPontuar({ estudo: reg.estudo }, OPCOES_PROCESSAR);
  if (!info) return null;
  const feito = reg.estudo.pontuacaoModelo;
  if (feito && feito.pacote === pac.id && feito.conferencia === info.conferencia) return null;
  return { ...info, pacote: pac, estudo: reg.estudo };
}

/** Roda o modelo e guarda o resultado na legenda do vídeo. Devolve true se deu certo. */
async function pontuarComModelo(reg, info) {
  S.modelo?.ctrl.abort();
  const ctrl = new AbortController();
  const estado = { reg, ctrl, feitas: 0, total: 0 };
  S.modelo = estado;
  atualizarAviso();
  try {
    const r = await pontuarPalavras(info.pacote.id, info.palavras, reg.estudo.idioma || '', {
      sinal: ctrl.signal,
      aoProgresso: (feitas, total) => {
        estado.feitas = feitas;
        estado.total = total;
        if (S.yt.fase === 'pontuando') mostrarCarregando();
        atualizarAviso();
      },
    });
    if (reg.estudo !== info.estudo || r.length !== info.palavras.length) return false; // trocou de legenda
    reg.estudo.pontuacaoModelo = { pacote: info.pacote.id, conferencia: info.conferencia, palavras: r.map((x) => x.w) };
    salvarVideo(reg);
    return true;
  } catch (e) {
    if (e?.name !== 'AbortError') {
      diag(`pontuação melhorada falhou: ${detalheErro(e)}`);
      toast(explicarErro(e, 'pontuar'), 7000);
    }
    return false;
  } finally {
    if (S.modelo === estado) S.modelo = null;
    atualizarAviso();
  }
}

/** Vídeo já aberto (reaberto, pacote recém-baixado ou ajuste ligado): pontua sem parar o vídeo. */
function pontuarAoFundo() {
  const reg = S.registro;
  const info = infoPontuacao(reg);
  if (!info || (S.modelo && S.modelo.reg === reg)) return;
  pontuarComModelo(reg, info).then((ok) => {
    if (ok && S.registro === reg) reprocessar();
  });
}

/** Botão "Usar pontuação simples" da janela de carregamento: para o modelo e segue. */
function pularPontuacao() {
  S.modelo?.ctrl.abort();
}

// ---- Mensagens de erro para pessoas (#2, 22/11/2026) ----
// Nada de texto técnico (inglês, nomes de funções, códigos) na tela: cada erro vira o que aconteceu e o
// que fazer, em português (a interface traduz para o idioma do celular). O detalhe técnico vai só para
// o diagnóstico (Copiar diagnóstico).

/** Texto técnico do erro (para o diagnóstico). */
function detalheErro(e) {
  if (!e) return '';
  if (typeof e === 'string') return e;
  return `${e.name || 'Erro'}: ${e.message || e}`;
}

/** Mensagens que nós mesmos escrevemos (já são para pessoas). */
const MSGS_NOSSAS = [
  /^Falta espaço/, /^Sem internet/, /^O download foi interrompido/, /^O Android pausou/,
  /^A internet caiu/, /^Não consegui (terminar|baixar|instalar|criar|gravar)/, /^O site dos pacotes/,
  /^Este aparelho não consegue/, /^O app (não respondeu|não conseguiu)/,
];

/**
 * Erro → frase objetiva e didática. etapa: 'baixar' (download do pacote), 'instalar' (copiar o pacote
 * baixado pelo app para dentro da página) ou 'pontuar' (rodar o modelo).
 */
function explicarErro(e, etapa) {
  const msg = typeof e === 'string' ? e : String(e?.message || '');
  const nome = typeof e === 'string' ? '' : String(e?.name || '');
  if (nome === 'QuotaExceededError' || /quota|Falta espaço|No space|ENOSPC/i.test(msg)) {
    return 'Falta espaço no celular. Apague fotos, vídeos ou apps que não usa e toque em Tentar de novo.';
  }
  if (etapa === 'pontuar') {
    if (/memory|memória|Out of memory|RangeError|allocation/i.test(msg + nome)) {
      return 'O celular ficou sem memória para a pontuação melhorada. Feche outros apps e abra o vídeo de novo. Por enquanto, usei a pontuação simples.';
    }
    if (/não está no aparelho|not found|404/i.test(msg)) {
      return 'O pacote da pontuação melhorada está incompleto. Abra ⚙ Ajustes, apague o pacote e baixe de novo. Por enquanto, usei a pontuação simples.';
    }
    return 'A pontuação melhorada não funcionou neste vídeo. Usei a pontuação simples (pelas pausas da fala).';
  }
  if (/incompleto|recomeçou|maior que o esperado/.test(msg)) {
    return etapa === 'instalar'
      ? 'O download terminou, mas um arquivo chegou com defeito. Toque em Tentar de novo para baixar outra vez.'
      : 'Um arquivo chegou incompleto. Toque em Tentar de novo: o download continua de onde parou.';
  }
  if (MSGS_NOSSAS.some((re) => re.test(msg))) return msg;
  const servidor = msg.match(/respondeu (\d{3})/);
  if (servidor) {
    return Number(servidor[1]) >= 500 || Number(servidor[1]) === 429
      ? 'O site dos pacotes está fora do ar ou ocupado agora. Espere alguns minutos e toque em Tentar de novo.'
      : 'O site dos pacotes não entregou o arquivo. Toque em Tentar de novo; se continuar, avise o Claude (Copiar diagnóstico).';
  }
  if (etapa === 'instalar') {
    return 'O download terminou, mas não consegui guardar o pacote no app. Toque em Tentar de novo: não precisa baixar outra vez.';
  }
  if (nome === 'TypeError' || /network|fetch|Failed|conex|connection|timeout|reset|Load failed/i.test(msg)) {
    return 'A internet caiu ou ficou lenta demais durante o download. Confira o Wi‑Fi e toque em Tentar de novo: ele continua de onde parou.';
  }
  return 'Não consegui terminar o download. Toque em Tentar de novo.';
}

async function atualizarEstadoPacotes() {
  for (const id of Object.keys(PACOTES)) S.pacotes[id] = await estadoPacote(id);
  renderPacotes();
}

const MB = (bytes) => formatarNumero(bytes / 1e6, 0); // MB como o Hugging Face e o Android mostram

async function baixarPacoteUI(id) {
  if (S.download?.ctrl) return;
  // O app já baixou e só faltou guardar: guarda de novo, sem baixar outra vez.
  if (S.download?.id === id && S.download.reinstalar) { instalarPacoteNativo(id, S.download.reinstalar); return; }
  if (downloadNativo()) { baixarPacoteNativo(id); return; }
  const ctrl = new AbortController();
  S.download = { id, feitos: 0, total: await tamanhoDownload(id), ctrl };
  renderPacotes();
  try {
    await baixarPacote(id, {
      sinal: ctrl.signal,
      aoProgresso: (feitos, total) => {
        if (S.download?.ctrl !== ctrl) return;
        S.download.feitos = feitos;
        S.download.total = total;
        renderPacotes();
      },
    });
    S.download = null;
    S.pacotes[id] = 'pronto';
    toast(`Pontuação melhorada (${PACOTES[id].nome}) instalada.`, 3000);
    renderPacotes();
    pontuarAoFundo(); // o vídeo aberto já ganha a pontuação nova
  } catch (e) {
    if (e?.name !== 'AbortError') diag(`download do pacote ${id} falhou: ${detalheErro(e)}`);
    S.download = e?.name === 'AbortError' ? null : { id, erro: explicarErro(e, 'baixar') };
    renderPacotes();
  }
}

// ---- App Android 9+: quem baixa é o Android ----
// O download continua com o app em segundo plano (a barra de progresso fica nas notificações).
// O app avisa o andamento em window.ldModelosEstado; no fim, a página copia os arquivos para o cache.

/** O app Android sabe baixar os pacotes sozinho? */
function downloadNativo() {
  return ANDROID && APK >= 9 && !!window.LDNativo;
}

function mandarAoApp(msg) {
  try { window.LDNativo?.postMessage(JSON.stringify(msg)); return true; } catch { return false; }
}

/** Download em andamento pelo app: o "Cancelar download" da página pede ao app para parar. */
function novoDownloadNativo(id, total = 0) {
  const ctrl = new AbortController();
  ctrl.signal.addEventListener('abort', () => mandarAoApp({ acao: 'cancelarModelos' }), { once: true });
  S.download = { id, feitos: 0, total, ctrl, nativo: true };
  return S.download;
}

async function baixarPacoteNativo(id) {
  let arquivos;
  try {
    arquivos = await arquivosDoPacote(id);
  } catch (e) {
    diag(`lista do pacote ${id} falhou: ${detalheErro(e)}`);
    S.download = { id, erro: explicarErro(e, 'baixar') };
    renderPacotes();
    return;
  }
  if (S.download?.ctrl) return;
  novoDownloadNativo(id, arquivos.reduce((s, a) => s + a.bytes, 0));
  renderPacotes();
  const ok = mandarAoApp({ acao: 'baixarModelos', id, nome: PACOTES[id].nome, arquivos });
  if (!ok) { S.download = { id, erro: 'O app não respondeu.' }; renderPacotes(); }
}

/** O app Android chama esta função com o estado da voz mais clara (ServicoVoz.estadoPublico). */
window.ldVozEstado = (texto) => voz.aoEstado(texto);

/** O app Android chama esta função com o estado do download: { id, estado, feitos, total, erro, arquivos }. */
window.ldModelosEstado = (texto) => {
  let e;
  try { e = JSON.parse(texto); } catch { return; }
  if (!e || typeof e !== 'object') return;
  const id = e.id;
  const d = S.download;
  if (e.estado === 'nada') return;
  if (!PACOTES[id]) return;
  if (e.detalhe) diag(`app, pacote ${id}: ${e.estado} (${e.detalhe})`);
  if (e.estado === 'pedindoPermissao' || e.estado === 'semPermissao') {
    // O download só começa com a permissão de notificações (#1): o Android pergunta; se a pessoa negar,
    // o cartão explica e o botão pede de novo (ou abre as configurações, quando o Android não pergunta mais).
    if (d?.instalando) return;
    S.download = { id, permissao: e.estado === 'pedindoPermissao' ? 'pedindo' : e.bloqueado ? 'bloqueada' : 'negada' };
    renderPacotes();
    return;
  }
  if (e.estado === 'baixando') {
    if (d?.instalando) return;
    // Página aberta (ou recarregada) com o download já em andamento: mostra a barra.
    const atual = d?.ctrl && d.id === id ? d : novoDownloadNativo(id);
    atual.feitos = Number(e.feitos) || 0;
    atual.total = Number(e.total) || atual.total;
    renderPacotes();
  } else if (e.estado === 'pronto') {
    instalarPacoteNativo(id, e.arquivos);
  } else if (e.estado === 'erro') {
    if (d?.instalando) return;
    S.download = { id, erro: explicarErro(String(e.erro || ''), 'baixar') };
    renderPacotes();
  } else if (e.estado === 'cancelado') {
    if (d?.nativo && d.id === id && !d.instalando) { S.download = null; renderPacotes(); }
  }
};

/** O app terminou o download: copia os arquivos para o cache dos pacotes e pede ao app para apagar os dele. */
async function instalarPacoteNativo(id, arquivos) {
  if (S.download?.instalando) return;
  const d = S.download?.ctrl && S.download.id === id ? S.download : novoDownloadNativo(id);
  d.instalando = true;
  d.feitos = 0;
  renderPacotes();
  try {
    await instalarArquivosBaixados(id, arquivos, {
      sinal: d.ctrl.signal,
      aoProgresso: (feitos, total) => {
        if (S.download !== d) return;
        d.feitos = feitos;
        d.total = total;
        renderPacotes();
      },
    });
    mandarAoApp({ acao: 'apagarModelos' });
    if (S.download === d) S.download = null;
    S.pacotes[id] = 'pronto';
    toast(`Pontuação melhorada (${PACOTES[id].nome}) instalada.`, 3000);
    renderPacotes();
    pontuarAoFundo();
  } catch (e) {
    if (e?.name === 'AbortError') {
      mandarAoApp({ acao: 'apagarModelos' }); // a pessoa cancelou: libera o espaço
      if (S.download === d) S.download = null;
    } else {
      // Os arquivos baixados pelo app ficam: "Tentar de novo" só guarda outra vez, sem baixar de novo.
      diag(`guardar o pacote ${id} falhou: ${detalheErro(e)}`);
      const defeito = /incompleto/.test(String(e?.message)); // arquivo do app com defeito: baixa de novo
      if (defeito) mandarAoApp({ acao: 'apagarModelos' });
      if (S.download === d) S.download = { id, erro: explicarErro(e, 'instalar'), reinstalar: defeito ? null : arquivos };
    }
    renderPacotes();
  }
}

async function apagarPacoteUI(id) {
  const ok = await dialogo({
    texto: `Apagar a pontuação melhorada (${PACOTES[id].nome})? Libera cerca de ${MB(PACOTES[id].bytesModelo)} MB. Dá para baixar de novo depois.`,
    ok: 'Apagar',
  });
  if (!ok) return;
  if (S.modelo) S.modelo.ctrl.abort();
  await apagarPacote(id);
  await atualizarEstadoPacotes();
}

/** Desenha o estado de um pacote num bloco (cartão da escolha do idioma ou linha dos Ajustes). */
function desenharPacote(bloco, id) {
  const p = PACOTES[id];
  const d = S.download?.id === id ? S.download : null;
  const pronto = S.pacotes[id] === 'pronto';
  const est = bloco.querySelector('.pm-estado');
  const txt = bloco.querySelector('.pm-texto');
  const barra = bloco.querySelector('.pm-barra');
  const baixar = bloco.querySelector('.pm-baixar');
  const cancelar = bloco.querySelector('.pm-cancelar');
  const apagar = bloco.querySelector('.pm-apagar');
  bloco.dataset.estado = d?.ctrl ? 'baixando' : pronto ? 'pronto' : d?.erro || d?.permissao ? 'erro' : 'ausente';
  barra.hidden = !d?.ctrl;
  cancelar.hidden = !d?.ctrl;
  baixar.hidden = pronto || !!d?.ctrl || d?.permissao === 'pedindo' || (!!S.download?.ctrl && !d);
  if (apagar) apagar.hidden = !pronto;
  if (d?.ctrl) {
    const pct = d.total ? Math.floor((100 * d.feitos) / d.total) : 0;
    barra.firstElementChild.style.width = `${pct}%`;
    est.textContent = `${pct}%`;
    txt.textContent = d.instalando
      ? `Instalando… ${MB(d.feitos)} de ${MB(d.total)} MB.`
      : d.nativo
        ? `Baixando… ${MB(d.feitos)} de ${MB(d.total)} MB. Pode começar o vídeo ou sair do app: o download continua (o andamento fica nas notificações).`
        : `Baixando… ${MB(d.feitos)} de ${MB(d.total)} MB. Pode começar o vídeo: a pontuação entra quando terminar.`;
  } else if (pronto) {
    est.textContent = 'Instalada';
    txt.textContent = 'O modelo roda no celular, sem internet.';
  } else if (d?.permissao === 'pedindo') {
    est.textContent = '';
    txt.textContent = 'Responda ao aviso do Android: toque em Permitir. É pelas notificações que o app mostra o andamento do download.';
  } else if (d?.permissao) {
    est.textContent = 'Falta permissão';
    if (d.permissao === 'bloqueada') {
      txt.textContent = 'O download precisa da permissão de notificações, e o Android não vai perguntar de novo. Toque em Abrir configurações, ligue as notificações do Legenda Dupla e volte ao app: o download começa sozinho.';
      baixar.textContent = 'Abrir configurações';
    } else {
      txt.textContent = 'O download precisa da permissão de notificações: é por ela que o Android mostra o andamento e deixa o download continuar com o app fechado. Toque em Tentar de novo e escolha Permitir.';
      baixar.textContent = 'Tentar de novo';
    }
  } else if (d?.erro) {
    est.textContent = 'Falhou';
    txt.textContent = d.erro;
    baixar.textContent = 'Tentar de novo';
  } else {
    est.textContent = '';
    const total = p.bytesModelo + p.bytesSp + (Object.values(S.pacotes).includes('pronto') ? 0 : 14848852);
    txt.textContent = `${p.descricao}: pontos, vírgulas, interrogações e maiúsculas de nomes, colocados por um modelo de IA que roda no celular. Baixa uma vez só (${MB(total)} MB, use Wi‑Fi).`;
    baixar.textContent = `Baixar (${MB(total)} MB)`;
  }
}

function renderPacotes() {
  for (const bloco of $$('[data-pacote]')) desenharPacote(bloco, bloco.dataset.pacote);
  atualizarCartaoPontuacao();
}

/** Cartão da janela de escolha do idioma: aparece só para legenda automática de um idioma com pacote. */
function atualizarCartaoPontuacao() {
  const cartao = $('#cartao-pontuacao');
  if (!cartao) return;
  const faixa = S.faixasEscolha?.[Number($('#sel-legenda-video').value)];
  const pac = faixa && faixa.kind === 'asr' && pontuacaoSuportada() ? pacoteDoIdioma(faixa.languageCode) : null;
  cartao.hidden = !pac;
  if (!pac) return;
  cartao.dataset.pacote = pac.id;
  desenharPacote(cartao, pac.id);
  $('#pm-usar').hidden = S.pacotes[pac.id] !== 'pronto';
  $('#pm-usar input').checked = !!S.ajustes.pontuacaoModelo;
}

// ============================================================ primeiro play (7.2)

async function tocarPrimeiraVez() {
  const p = S.player;
  if (!p) return;
  if (precisaExplicarGestos() && !S.gestosNestaAbertura) {
    S.gestosNestaAbertura = true;
    const seguir = await mostrarExplicacaoGestos();
    if (!seguir || S.player !== p) return;
  }
  entradaSuave();
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
  // Pedido de legenda feito antes de um anúncio pode se perder: pede de novo quando o vídeo toca.
  if (st === 1 && S.yt.estado === 'pegando' && S.yt.faixa) S.player?.pedirLegenda?.(S.yt.faixa);
  if (st === 1 && !S.yt.preparando && !S.yt.fase && !S.anuncio.ativo) avisarHistorico('inicio');
  if (st === 2 || st === 0) avisarHistorico('progresso', true);
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
    if (reg.estudo || !ANDROID) salvarVideo(reg); // no app, o vídeo só entra na lista com a legenda
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
  if (reg.estudo?.origem === 'youtube') return; // a legenda veio do próprio vídeo
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

// ============================================================ como avançar e retroceder o vídeo (explicação) e entrada suave

function precisaExplicarGestos() {
  return !S.ajustes.gestosExplicados && (!MOCK || GESTOS_MOCK);
}

/**
 * Janela com a animação dos gestos (deslizar para um lado e para o outro). Respeita "Inverter direção
 * do arraste". Devolve true no Concluir e false se a pessoa saiu pelo voltar do celular.
 */
function mostrarExplicacaoGestos() {
  if (S.fimExplicacao) S.fimExplicacao(false);
  return new Promise((resolve) => {
    const inv = !!S.ajustes.inverterArraste;
    const retroceder = 'retrocede o vídeo';
    const avancar = 'avança o vídeo';
    $('#gestos-acao-direita').textContent = inv ? avancar : retroceder;
    $('#gestos-acao-esquerda').textContent = inv ? retroceder : avancar;
    // Ícones, barra do tempo e legenda da demonstração andam no sentido do gesto: com a direção invertida,
    // deslizar para a direita avança.
    $('#demo-gestos').classList.toggle('invertido', inv);
    const caixa = $('#gestos-nao-mostrar');
    caixa.checked = !!S.ajustes.gestosExplicados;
    const tela = $('#tela-gestos');
    tela.hidden = false;
    $('#gestos-ok').focus();
    const fim = (concluiu) => {
      S.fimExplicacao = null;
      $('#gestos-ok').onclick = null;
      tela.hidden = true;
      if (concluiu && S.ajustes.gestosExplicados !== caixa.checked) {
        S.ajustes.gestosExplicados = caixa.checked;
        salvar();
      }
      resolve(concluiu);
    };
    S.fimExplicacao = fim;
    $('#gestos-ok').onclick = () => fim(true);
  });
}

/**
 * Vídeo já salvo aberto no app Android: começa sozinho. Com a explicação dos gestos pendente, ela aparece
 * na hora (o vídeo carrega escondido por trás); ao fechar, entrada suave e o vídeo toca. Sem a explicação,
 * a entrada suave começa já no toque do vídeo e ele toca assim que o player estiver pronto.
 */
async function iniciarSozinho(p) {
  if (precisaExplicarGestos() && !S.gestosNestaAbertura) {
    S.gestosNestaAbertura = true;
    esconderParaEntrada(true);
    const seguir = await mostrarExplicacaoGestos();
    if (!seguir || S.player !== p) return;
  }
  entradaSuave();
  // Espera o player carregar (no máximo 30 s; sem internet, o aviso de reconexão cuida do resto).
  for (let i = 0; i < 300 && S.player === p && !S.pronto; i++) await espera(100);
  if (S.player !== p || !S.pronto || S.primeiroPlay) return;
  p.tocar();
  setTimeout(() => {
    if (S.player === p && !S.primeiroPlay && [-1, 5].includes(p.estado())) mostrarAvisoToque();
  }, 1500);
}

/** Vídeo e legenda escondidos (escuros) até a entrada suave começar. */
function esconderParaEntrada(sim) {
  for (const el of [$('#area-video'), $('#caixa-legenda')]) el.classList.toggle('antes-da-entrada', sim);
}

/** Vídeo e legenda aparecem devagar (fade in) quando o vídeo começa. */
function entradaSuave() {
  esconderParaEntrada(false);
  for (const el of [$('#area-video'), $('#caixa-legenda')]) {
    el.classList.remove('entrada-suave');
    void el.offsetWidth; // reinicia a animação
    el.classList.add('entrada-suave');
    el.addEventListener('animationend', () => el.classList.remove('entrada-suave'), { once: true });
  }
}

// ============================================================ internet fraca ou sem internet
// Com a internet caída ou fraca, o player do YouTube fica parado carregando e parecia que o app tinha
// travado. Agora aparece por cima do vídeo o aviso animado "Tentando reconectar à Internet…", e o app:
// pede o trecho de novo de tempos em tempos enquanto estiver travado; quando a internet volta, continua
// do mesmo ponto (e recarrega o player, se ele deu erro sem internet). Os gestos continuam funcionando.

const REDE_AVISO_MS = 2500; // carregando por mais que isto: mostra o aviso
const REDE_CUTUCAR_MS = 8000; // ainda travado: pede o trecho de novo (e a cada 10 s depois disso)
const REDE_GRACA_MS = 4000; // de volta ao app: tempo sem aviso enquanto o player retoma
let timerGracaRede = 0;

function zerarRede() {
  const r = S.rede;
  Object.assign(r, { andandoEm: 0, ultimoT: -1, travadoDesde: 0, ultimaCutucada: 0, cutucadas: 0, querTocar: false, recarregar: false, reabrir: null });
  atualizarAvisoRede();
}

/** Mostra, troca o texto ou esconde o aviso de reconexão. */
function atualizarAvisoRede(forcar = false) {
  const r = S.rede;
  const aberto = !!S.registro && !$('#tela-assistir').hidden;
  const agora = performance.now();
  const travado = !!r.travadoDesde && agora - r.travadoDesde >= REDE_AVISO_MS;
  // O vídeo está andando: a internet chega, mesmo que o aparelho diga o contrário (rede sem verificação).
  const andando = agora - r.andandoEm < 1500;
  const semInternet = !r.online && !andando;
  // App em segundo plano, ou acabou de voltar: nada de aviso (falso alarme ao sair do app e voltar).
  if (document.hidden || agora < r.gracaAte) {
    if (!$('#aviso-rede').hidden) $('#aviso-rede').hidden = true;
    if (agora < r.gracaAte) {
      clearTimeout(timerGracaRede);
      timerGracaRede = setTimeout(() => atualizarAvisoRede(), r.gracaAte - agora + 50);
    }
    return;
  }
  const mostrar = aberto && (semInternet || travado || r.recarregar || !!r.reabrir || (forcar && semInternet));
  const aviso = $('#aviso-rede');
  if (!mostrar) { if (!aviso.hidden) aviso.hidden = true; return; }
  const titulo = r.online ? 'Internet fraca. Tentando reconectar…' : 'Sem Internet. Tentando reconectar…';
  const texto = r.online
    ? 'Carregando o vídeo. Ele continua sozinho quando a conexão melhorar.'
    : 'Confira o Wi-Fi ou os dados móveis. O vídeo continua sozinho quando a conexão voltar.';
  if ($('#aviso-rede-titulo').textContent !== titulo) $('#aviso-rede-titulo').textContent = titulo;
  if ($('#aviso-rede-texto').textContent !== texto) $('#aviso-rede-texto').textContent = texto;
  if (aviso.hidden) aviso.hidden = false;
}

/** A cada 250 ms (pelo laço): o vídeo quer tocar e o tempo não anda? */
function conferirRede(st, t) {
  const r = S.rede;
  const p = S.player;
  if (!p) return;
  const agora = performance.now();
  // Quer tocar: tocando, ou carregando depois de tocar. Pausa, fim, anúncio e o vídeo ainda parado no começo não contam.
  const querTocar = S.primeiroPlay && !S.anuncio.ativo && (st === 1 || st === 3) && S.tocandoLogico;
  const andou = r.ultimoT < 0 || Math.abs(t - r.ultimoT) > 0.04;
  if (st === 1 && andou && r.ultimoT >= 0) r.andandoEm = agora;
  if (!querTocar || (st === 1 && andou)) {
    r.ultimoT = t;
    if (r.travadoDesde) {
      if (r.cutucadas) diag(`internet: o vídeo voltou a andar (${Math.round((agora - r.travadoDesde) / 1000)} s parado)`);
      r.travadoDesde = 0;
      r.cutucadas = 0;
      if (!querTocar || st === 1) r.querTocar = false;
    }
    if (st === 1) r.querTocar = false;
    atualizarAvisoRede();
    return;
  }
  if (!r.travadoDesde) r.travadoDesde = agora;
  r.querTocar = true;
  atualizarAvisoRede();
  // Com internet, mas travado: pede o trecho de novo. Depois de 3 tentativas, recarrega o player no mesmo ponto.
  if (r.online && agora >= r.gracaAte && agora - r.travadoDesde >= REDE_CUTUCAR_MS && agora - r.ultimaCutucada >= 10000) {
    if (r.cutucadas >= 3 && S.registro?.estudo) {
      r.cutucadas = 0;
      recarregarPlayer();
    } else {
      r.cutucadas++;
      cutucarPlayer();
    }
  }
}

/** Pede ao player o trecho atual de novo (o YouTube refaz o download a partir dali). */
function cutucarPlayer() {
  const p = S.player;
  if (!p) return;
  S.rede.ultimaCutucada = performance.now();
  const t = p.tempo();
  diag(`internet: vídeo parado em ${t.toFixed(1)} s, pedindo o trecho de novo`);
  try { p.irPara(t, true); } catch { /* nada */ }
  if (S.rede.querTocar) p.tocar();
}

/** Recria o player no mesmo ponto (depois de um erro sem internet, ou travado demais). */
async function recarregarPlayer() {
  const p = S.player;
  const reg = S.registro;
  if (!p || !reg) return;
  const t = p.tempo();
  const tocar = S.rede.querTocar || S.tocandoLogico;
  S.rede.recarregar = false;
  S.rede.ultimaCutucada = performance.now();
  if (!reg.estudo) { abrirVideo(reg, t, S.origem || 'youtube'); return; } // ainda pegava a legenda: começa de novo
  diag(`internet: recarregando o player em ${t.toFixed(1)} s`);
  $('#erro-player').hidden = true;
  try {
    await p.carregar(reg.id, t);
  } catch (e) {
    if (S.player !== p) return;
    diag(`internet: o player não recarregou: ${detalheErro(e)}`);
    S.rede.recarregar = true; // tenta de novo na próxima volta da internet
    atualizarAvisoRede(true);
    return;
  }
  if (S.player !== p) return;
  aplicarVelocidadeSalva();
  if (tocar) p.tocar();
  else p.revelar?.(); // pausado: mostra a imagem do player (sem esperar o vídeo andar)
}

/** A internet voltou: continua de onde parou. */
function recuperarRede() {
  const r = S.rede;
  const reg = S.registro;
  if (!reg || !r.online) { atualizarAvisoRede(); return; }
  if (r.reabrir && r.reabrir.reg === reg) {
    const { inicio, origem } = r.reabrir;
    r.reabrir = null;
    abrirVideo(reg, inicio, origem);
    return;
  }
  if (r.recarregar) { recarregarPlayer(); return; }
  if (r.querTocar || S.player?.estado() === 3) cutucarPlayer();
  atualizarAvisoRede();
}

/**
 * Voltou ao app (ou a tela ligou): o tempo parado em segundo plano não conta como vídeo travado. Antes, o
 * "parado desde" antigo continuava valendo e o aviso de reconectar aparecia na hora, com o Wi-Fi perfeito.
 * O app Android (versão 14) confere a internet de novo e manda o estado atual.
 */
function voltouAoApp() {
  const r = S.rede;
  r.travadoDesde = 0;
  r.ultimoT = -1;
  r.cutucadas = 0;
  r.gracaAte = performance.now() + REDE_GRACA_MS;
  if (APK >= 14) mandarAoApp({ acao: 'rede' });
  atualizarAvisoRede();
}

/** Aviso do aparelho (eventos online/offline da página e, no app Android 11+, o próprio Android). */
function aoMudarRede(online) {
  const r = S.rede;
  if (r.online === online) return;
  r.online = online;
  diag(`internet: ${online ? 'voltou' : 'caiu'}`);
  if (!online) {
    if (!document.hidden) r.querTocar = r.querTocar || S.tocandoLogico;
    atualizarAvisoRede(true);
    return;
  }
  r.cutucadas = 0;
  // Um instante para a conexão firmar antes de pedir o vídeo de novo.
  setTimeout(recuperarRede, 800);
}

window.addEventListener('online', () => aoMudarRede(true));
window.addEventListener('offline', () => aoMudarRede(false));
window.ldRede = (v) => aoMudarRede(v === '1' || v === true);

// ============================================================ histórico do YouTube (app Android 10+)
// O player embutido não põe o vídeo no histórico da conta. O app avisa o YouTube (com a conta conectada):
// "preparar" quando o vídeo abre (o app já busca os endereços de registro), "inicio" quando o vídeo começa
// de verdade (com som, sem anúncio) e "progresso" a cada 10 s, ao pausar, ao pular para outro ponto e ao
// sair (para o histórico guardar até onde a pessoa assistiu).

function avisarHistorico(evento, forcar = false) {
  const reg = S.registro;
  const p = S.player;
  if (!ANDROID || APK < 10 || !reg || !p) return;
  const agora = performance.now();
  if (evento === 'inicio') {
    if (S.histVideo === reg.id) return;
    S.histVideo = reg.id;
    S.histUltimo = agora;
  } else {
    if (S.histVideo !== reg.id) return;
    if (!forcar && agora - S.histUltimo < 10000) return;
    S.histUltimo = agora;
  }
  const t = p.tempo();
  if (!Number.isFinite(t)) return;
  mandarAoApp({ acao: 'historico', evento, video: reg.id, tempo: Math.round(t * 1000) / 1000 });
}

window.ldHistorico = (texto) => diag(`histórico do YouTube: ${texto}`);

// ============================================================ tela ligada (7.8)

async function pedirTelaLigada() {
  // App Android: a própria janela fica acesa (o Wake Lock pode não existir na WebView).
  try { if (ANDROID) window.LDNativo?.postMessage(JSON.stringify({ acao: 'telaLigada', ligada: true })); } catch { /* nada */ }
  try {
    if (!('wakeLock' in navigator) || S.telaLigada || document.visibilityState !== 'visible') return;
    S.telaLigada = await navigator.wakeLock.request('screen');
    S.telaLigada.addEventListener('release', () => { S.telaLigada = null; });
  } catch {
    S.telaLigada = null;
  }
}

function soltarTelaLigada() {
  try { if (ANDROID) window.LDNativo?.postMessage(JSON.stringify({ acao: 'telaLigada', ligada: false })); } catch { /* nada */ }
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
    conferirAoVivo();
    conferirRede(st, t);
  }
  if (st === 1 && agora - S.ultimoSalvamento >= 5000) {
    S.ultimoSalvamento = agora;
    salvarPosicao();
    if (!S.anuncio.ativo) avisarHistorico('progresso');
  }
  voz.tique();
}

/** Vai para o início de uma unidade, um pouco antes, dentro do silêncio que a separa da anterior. */
function irParaIndice(i) {
  const p = S.player;
  const u = S.unidades[i];
  if (!p || !u) return;
  p.irPara(tempoDestinoFolga(S.unidades, i, {
    max: S.ajustes.folgaFala,
    min: S.frases ? FOLGA_MIN_FRASES : FOLGA_MIN,
  }));
  S.saltoEm = performance.now();
  S.alvoNav = i;
  renderLegenda(true);
}

function modoLista() {
  return S.ajustes.modoLegenda === 'lista';
}

/** A tradução está aparecendo agora? (depende do modo 文A, de tocar/pausar e de haver tradução) */
function traducaoNaTela() {
  const modo = S.ajustes.modoTraducao;
  if (modo === 'desligada' || (modo === 'pausado' && S.tocandoLogico)) return false;
  return !!S.registro && (!!S.registro.traducao || traducaoAutomaticaAtiva());
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
  // Tudo o que pode mudar sem a fala mudar: traduções (a atual e as vizinhas), modo e trecho A–B.
  const lista = modoLista();
  const assinatura = [t2, lista, lista ? textoLinha2(U[indice - 1]) : '', lista ? textoLinha2(U[indice + 1]) : '', S.ab.a, S.ab.b].join('\u0001');
  if (indice === S.exibida && assinatura === S.exibidaTrad && !forcar) return;
  if (indice === S.exibida && !forcar) {
    // Só mudou a tradução (chegou, ou tocou/pausou no modo "só quando pausar") ou o A–B:
    // não mexe na linha 1, porque o cartão da palavra pode estar aberto.
    S.exibidaTrad = assinatura;
    mostrarLinha2(t2);
    mostrarVizinhas(indice);
    ajustarEscala();
    return;
  }
  const avancou = indice === S.exibida + 1 && S.exibida >= 0;
  if (indice !== S.exibida) fecharCartao();
  S.exibida = indice;
  S.exibidaTrad = assinatura;

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
  mostrarVizinhas(indice);
  ajustarEscala();
  // No modo lista, a fala nova sobe suavemente para o meio (como letra de música).
  if (lista && avancou) {
    const meio = $('#caixa-legenda .legenda-meio');
    meio.classList.remove('subindo');
    void meio.offsetWidth; // reinicia a animação
    meio.classList.add('subindo');
  }
}

/** Modo lista: fala anterior e próxima, mais apagadas. No modo uma fala, ficam escondidas. */
function mostrarVizinhas(indice) {
  const lista = modoLista();
  const U = S.unidades;
  const { a, b } = S.ab;
  const abAtivo = a !== null && b !== null;
  for (const [sel, i] of [['#fala-ant', indice - 1], ['#fala-prox', indice + 1]]) {
    const el = $(sel);
    const u = lista ? U[i] : null;
    el.hidden = !u;
    el.dataset.indice = u ? String(i) : '';
    if (!u) continue;
    el.querySelector('.l1').textContent = u.texto;
    const t2 = textoLinha2(u);
    const l2 = el.querySelector('.l2');
    l2.textContent = t2;
    l2.hidden = !t2;
    // Com o trecho A–B repetindo, a fala que fica fora dele aparece ainda mais apagada.
    el.classList.toggle('fora-ab', abAtivo && (i < a || i > b));
  }
}

/** Texto da linha 2 conforme o modo da tradução (sempre, só quando pausar, desativada). */
function textoLinha2(u) {
  const trad = u?.trad || '';
  const modo = S.ajustes.modoTraducao;
  if (!trad || modo === 'desligada') return '';
  if (modo === 'pausado' && S.tocandoLogico) return '';
  return trad;
}

/**
 * Mostra a linha 2 e ajusta o tamanho: sem tradução na tela, a legenda original fica maior.
 * Uma fala por vez: depende da fala atual. Lista: depende do modo da tradução, para as três
 * falas mudarem de tamanho juntas (e não uma grande e outra pequena).
 */
function mostrarLinha2(t2) {
  const c2 = $('#caixa-l2');
  c2.textContent = t2;
  c2.hidden = !t2;
  $('#legenda-sobre .l2').textContent = t2;
  const soOriginal = modoLista() ? !traducaoNaTela() : !t2;
  $('#caixa-legenda').classList.toggle('so-original', soOriginal);
  $('#legenda-sobre').classList.toggle('so-original', !t2);
}

/**
 * Se a fala não cabe na caixa, diminui as letras (até 70%) em vez de criar rolagem.
 * Uma fala por vez: a fala inteira precisa caber. Lista: a fala atual precisa caber no meio;
 * a anterior e a próxima podem ficar cortadas nas bordas.
 */
function ajustarEscala() {
  const caixa = $('#caixa-legenda');
  if (!caixa || caixa.offsetParent === null) return;
  caixa.style.setProperty('--escala', '1');
  const lista = modoLista();
  const meio = caixa.querySelector('.legenda-meio');
  const atual = $('#fala-atual');
  const disponivel = () => {
    if (lista) return Math.max(40, meio.clientHeight * 0.62);
    const est = getComputedStyle(caixa);
    const dica = $('#dica-ab');
    return caixa.clientHeight - parseFloat(est.paddingTop) - parseFloat(est.paddingBottom) - (dica.hidden ? 0 : dica.offsetHeight + 6);
  };
  const ocupado = () => (lista ? atual.offsetHeight : meio.scrollHeight);
  let escala = 1;
  for (let k = 0; k < 4; k++) {
    const d = disponivel();
    const o = ocupado();
    if (o <= d + 1 || escala <= 0.7) break;
    // a altura cresce mais ou menos com o quadrado do tamanho da letra (mais linhas e linhas mais altas)
    escala = Math.max(0.7, Math.floor(escala * Math.sqrt(d / o) * 100) / 100);
    caixa.style.setProperty('--escala', String(escala));
  }
}

function alternarModoLegenda() {
  S.ajustes.modoLegenda = modoLista() ? 'uma' : 'lista';
  salvar();
  atualizarBotaoModoLegenda();
  renderLegenda(true);
  selo(modoLista() ? 'Lista: fala anterior, atual e próxima' : 'Uma fala por vez', 1300, '#btn-modo-legenda');
}

function atualizarBotaoModoLegenda() {
  const lista = modoLista();
  const b = $('#btn-modo-legenda');
  b.setAttribute('aria-pressed', String(lista));
  b.setAttribute('aria-label', lista ? 'Voltar a mostrar uma fala por vez' : 'Mostrar as falas em lista (anterior, atual e próxima)');
  $('#caixa-legenda').classList.toggle('modo-lista', lista);
}

/** Toque na fala anterior ou na próxima (modo lista): vai até ela, como o gesto de arrastar. */
function irParaVizinha(el) {
  const i = Number(el.dataset.indice);
  const p = S.player;
  if (!p || !Number.isInteger(i) || !S.unidades[i] || el.dataset.indice === '') return;
  S.memoriaNav = { indice: i, quando: performance.now() };
  if (S.loop.ligado) S.loop.alvo = i;
  const pausado = S.primeiroPlay && p.estado() === 2; // pausado continua pausado (como nos gestos)
  const acao = i < S.exibida ? 'voltar' : 'avancar'; // antes de ir (depois, a exibida já é a nova)
  irParaIndice(i);
  if (!pausado && p.estado() !== 1 && p.estado() !== 3) {
    if (S.primeiroPlay) p.tocar(); else tocarPrimeiraVez();
  }
  mostrarRetorno(TEXTO_RETORNO[acao], acao);
  vibrar();
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
  // Vídeo tocando sem som enquanto a legenda carrega, ou vídeo do app sem legenda: não entra na lista.
  if (S.yt.preparando || (ANDROID && !reg.estudo)) return;
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
  ab.setAttribute('aria-pressed', String(completo));
  ab.setAttribute('aria-label', completo ? 'Parar o trecho A–B' : 'Repetir um trecho de A até B');
  // Com o trecho repetindo, a legenda muda de estilo (borda cheia, fundo âmbar e selo com o trecho).
  const caixa = $('#caixa-legenda');
  caixa.classList.toggle('loop-ab', completo);
  $('#legenda-sobre').classList.toggle('loop-ab', completo);
  const dica = $('#dica-ab');
  dica.hidden = !completo;
  dica.classList.toggle('ativo', completo);
  if (completo) {
    const n = b - a + 1;
    dica.textContent = `⟲ Repetindo A–B · ${formatarTempo(S.unidades[a]?.s)} → ${formatarTempo(S.unidades[b]?.e)} · ${n} ${n === 1 ? 'fala' : 'falas'}`;
  }
  ajustarEscala();
}

function alternarLoop() {
  if (!S.unidades.length) return;
  S.loop.ligado = !S.loop.ligado;
  S.loop.alvo = S.loop.ligado ? (falaAtual() >= 0 ? falaAtual() : null) : null;
  if (S.loop.ligado) S.ab = { a: null, b: null }; // um modo de repetição por vez
  atualizarBotoesRepeticao();
  selo(S.loop.ligado ? 'Loop da fala ligado' : 'Loop da fala desligado', 1300, '#btn-loop', !S.loop.ligado);
}

/** Botão A–B: abre a tela de escolha do trecho; com o trecho repetindo, desliga. */
function tocarAB() {
  if (!S.unidades.length) return;
  const { a, b } = S.ab;
  if (a !== null && b !== null) {
    S.ab = { a: null, b: null };
    atualizarBotoesRepeticao();
    selo('Trecho A–B desligado', 1300, '#btn-ab', true);
    return;
  }
  abrirTelaAB();
}

// ------------------------------------------------ tela de escolha do A–B (lista de falas na tela inteira)

function telaABAberta() {
  return !$('#tela-ab').hidden;
}

/** Fala de referência para centralizar a lista: a da tela, ou a mais próxima do tempo atual. */
function indiceDeReferencia() {
  if (S.exibida >= 0) return S.exibida;
  const U = S.unidades;
  const t = S.player ? S.player.tempo() : 0;
  let i = U.findIndex((u) => u.s >= t);
  if (i < 0) i = U.length - 1;
  return Math.max(0, i);
}

function abrirTelaAB() {
  const p = S.player;
  S.loop = { ligado: false, alvo: null }; // um modo de repetição por vez
  S.ab = { a: null, b: null };
  S.marcandoAB = 'a';
  fecharCartao();
  fecharMenuTraducao();
  fecharPaineis();
  // Pausa enquanto escolhe; ao cancelar, volta a tocar se estava tocando.
  S.abTocava = !!p && p.estado() === 1;
  if (S.abTocava) p.pausar();
  const agora = indiceDeReferencia();
  const lista = $('#ab-lista');
  lista.textContent = '';
  const frag = document.createDocumentFragment();
  S.unidades.forEach((u, i) => {
    const li = document.createElement('li');
    const bt = document.createElement('button');
    bt.type = 'button';
    bt.className = 'ab-fala';
    bt.dataset.i = String(i);
    const tempo = document.createElement('span');
    tempo.className = 'ab-tempo';
    tempo.textContent = formatarTempo(u.s);
    const selo = document.createElement('span');
    selo.className = 'ab-selo';
    tempo.appendChild(selo);
    const l1 = document.createElement('span');
    l1.className = 'ab-l1';
    l1.textContent = u.texto;
    bt.append(tempo, l1);
    if (u.trad) {
      const l2 = document.createElement('span');
      l2.className = 'ab-l2';
      l2.textContent = u.trad;
      bt.appendChild(l2);
    }
    if (i === agora) bt.classList.add('agora');
    li.appendChild(bt);
    frag.appendChild(li);
  });
  lista.appendChild(frag);
  $('#tela-ab').hidden = false;
  atualizarTelaAB();
  atualizarBotoesRepeticao();
  // O botão "voltar" do celular fecha esta tela em vez de sair do vídeo.
  try { history.pushState({ telaAB: true }, '', location.href); S.abHistorico = true; } catch { S.abHistorico = false; }
  const alvo = lista.querySelector(`.ab-fala[data-i="${agora}"]`);
  alvo?.scrollIntoView({ block: 'center' });
}

function atualizarTelaAB() {
  const escolhendoB = S.marcandoAB === 'b';
  const a = S.ab.a;
  $('#ab-titulo').textContent = escolhendoB ? 'Agora o fim (B)' : 'Escolha o início (A)';
  $('#ab-sub').textContent = escolhendoB
    ? `A em ${formatarTempo(S.unidades[a]?.s)}. Toque numa fala depois do A, onde o trecho termina.`
    : 'Role a lista e toque na fala onde o trecho começa.';
  $('#ab-refazer').hidden = !escolhendoB;
  for (const bt of $$('#ab-lista .ab-fala')) {
    const i = Number(bt.dataset.i);
    const ehA = escolhendoB && i === a;
    bt.classList.toggle('marca-a', ehA);
    // Escolhendo o B: as falas antes do A ficam apagadas (não podem ser o fim do trecho).
    bt.classList.toggle('antes-a', escolhendoB && i < a);
    bt.querySelector('.ab-selo').textContent = ehA ? 'A' : bt.classList.contains('agora') ? 'agora' : '';
  }
}

/** Aviso flutuante da tela A–B (some sozinho) e a fala tocada balança em vermelho. */
function avisarAB(titulo, texto, bt) {
  const av = $('#ab-aviso');
  $('#ab-aviso-titulo').textContent = titulo;
  $('#ab-aviso-texto').textContent = texto;
  av.hidden = false;
  av.classList.remove('saindo', 'entrando');
  void av.offsetWidth; // reinicia a animação se o aviso já estava na tela
  av.classList.add('entrando');
  clearTimeout(S.abAvisoTimer);
  S.abAvisoTimer = setTimeout(() => {
    av.classList.add('saindo');
    S.abAvisoTimer = setTimeout(esconderAvisoAB, 260);
  }, 3600);
  if (bt) {
    bt.classList.remove('recusada');
    void bt.offsetWidth;
    bt.classList.add('recusada');
    setTimeout(() => bt.classList.remove('recusada'), 700);
  }
  try { navigator.vibrate?.([35, 60, 35]); } catch { /* nada */ }
}

function esconderAvisoAB() {
  clearTimeout(S.abAvisoTimer);
  const av = $('#ab-aviso');
  av.hidden = true;
  av.classList.remove('entrando', 'saindo');
}

/**
 * Toque numa fala da lista: marca A; no segundo toque marca B, volta ao vídeo e repete.
 * O trecho tem no mínimo 2 falas: B na mesma fala do A, ou antes dele, mostra um aviso.
 */
function escolherPontoAB(i) {
  if (!S.unidades[i] || !S.marcandoAB) return;
  const bt = $(`#ab-lista .ab-fala[data-i="${i}"]`);
  if (S.marcandoAB === 'a') {
    vibrar();
    esconderAvisoAB();
    S.ab = { a: i, b: null };
    S.marcandoAB = 'b';
    atualizarTelaAB();
    return;
  }
  const a = S.ab.a;
  if (i === a) {
    avisarAB('O trecho precisa de 2 falas ou mais',
      'Você tocou na mesma fala do A. Toque numa fala mais abaixo para ser o fim (B).', bt);
    return;
  }
  if (i < a) {
    avisarAB('O B tem que vir depois do A',
      `Essa fala é anterior ao início (A em ${formatarTempo(S.unidades[a].s)}). Toque numa fala mais abaixo, ou em Refazer A.`, bt);
    return;
  }
  vibrar();
  esconderAvisoAB();
  S.ab = { a, b: i };
  S.marcandoAB = null;
  fecharTelaAB(false);
  atualizarBotoesRepeticao();
  selo(`Repetindo de ${formatarTempo(S.unidades[S.ab.a].s)} até ${formatarTempo(S.unidades[S.ab.b].e)}. Toque em A–B para parar.`, 3500, '#btn-ab');
  // Começa já pelo ponto A, tocando.
  irParaIndice(S.ab.a);
  if (S.player && S.player.estado() !== 1) {
    if (S.primeiroPlay) S.player.tocar(); else tocarPrimeiraVez();
  }
}

function refazerA() {
  esconderAvisoAB();
  S.ab = { a: null, b: null };
  S.marcandoAB = 'a';
  atualizarTelaAB();
}

/** Fecha a tela sem trecho (✕, Esc ou o voltar do celular). */
function cancelarTelaAB(peloVoltar = false) {
  if (!telaABAberta()) return;
  S.marcandoAB = null;
  S.ab = { a: null, b: null };
  fecharTelaAB(peloVoltar);
  atualizarBotoesRepeticao();
  if (S.abTocava && S.player) S.player.tocar();
  S.abTocava = false;
}

function fecharTelaAB(peloVoltar) {
  esconderAvisoAB();
  $('#tela-ab').hidden = true;
  $('#ab-lista').textContent = '';
  if (S.abHistorico) {
    S.abHistorico = false;
    if (!peloVoltar) history.back(); // tira a entrada que a tela pôs no histórico
  }
}

function zerarRepeticao() {
  if (telaABAberta()) {
    // Fechando o vídeo ou trocando as falas: some sem mexer no histórico nem voltar a tocar.
    esconderAvisoAB();
    $('#tela-ab').hidden = true;
    $('#ab-lista').textContent = '';
    S.abHistorico = false;
    S.abTocava = false;
  }
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
  if (aberto(menu)) { fecharMenuTraducao(); return; }
  atualizarBotaoTraducao();
  mostrarComAnimacao(menu);
  $('#btn-traducao').setAttribute('aria-expanded', 'true');
  const r = $('#btn-traducao').getBoundingClientRect();
  const larg = menu.offsetWidth;
  const alt = menu.offsetHeight;
  const esquerda = Math.min(window.innerWidth - larg - 8, Math.max(8, r.right - larg));
  let topo = r.top - alt - 8;
  let embaixo = false;
  if (topo < 8) { topo = r.bottom + 8; embaixo = true; }
  menu.style.left = `${esquerda}px`;
  menu.style.top = `${topo}px`;
  // O menu cresce a partir do botão: do canto mais perto dele.
  const xOrigem = Math.min(larg, Math.max(0, r.left + r.width / 2 - esquerda));
  menu.style.transformOrigin = `${Math.round(xOrigem)}px ${embaixo ? '0' : '100%'}`;
}

function fecharMenuTraducao() {
  esconderComAnimacao($('#menu-traducao'), 150);
  $('#btn-traducao').setAttribute('aria-expanded', 'false');
}

function definirModoTraducao(modo) {
  S.ajustes.modoTraducao = modo;
  salvar();
  atualizarBotaoTraducao();
  fecharMenuTraducao();
  renderLegenda(false);
}

function seloTraducao(modo) {
  selo({ sempre: 'Tradução: mostrar sempre', pausado: 'Tradução: só quando pausar', desligada: 'Tradução desativada' }[modo], 1300, '#btn-traducao', modo === 'desligada');
}

function ciclarModoTraducao() {
  const ordem = ['sempre', 'pausado', 'desligada'];
  const novo = ordem[(ordem.indexOf(S.ajustes.modoTraducao) + 1) % 3];
  definirModoTraducao(novo);
  seloTraducao(novo);
}

// ============================================================ navegação por gesto (7.4)

// Padrão (desde 22/11/2026): como virar página — arrastar para a esquerda avança, para a direita volta.
function direcaoDoArraste(dir) {
  const esquerda = S.ajustes.inverterArraste ? 'voltar' : 'avancar';
  const direita = S.ajustes.inverterArraste ? 'avancar' : 'voltar';
  return dir === 'esquerda' ? esquerda : direita;
}

const TEXTO_RETORNO = { voltar: 'Retroceder', avancar: 'Avançar', repetir: '↻ Repetindo' };

function navegarAcao(acao) {
  const p = S.player;
  const U = S.unidades;
  if (!p || !U.length) return;
  const agora = performance.now();
  // Depois de um salto, o vídeo fica um pouco antes da fala de destino (no silêncio). Até chegar nela,
  // a fala atual é a de destino (a que está na tela), e não a anterior: senão, com o vídeo pausado,
  // avançar iria de novo para a mesma fala.
  let memoria = S.memoriaNav;
  if (S.alvoNav !== null && U[S.alvoNav] && !(memoria && agora - memoria.quando < JANELA_NAVEGACAO_MS)) {
    memoria = { indice: S.alvoNav, quando: agora };
  }
  const r = navegar(U, p.tempo(), acao, memoria, agora);
  if (r.indice === null) {
    if (r.aviso) mostrarRetorno(r.aviso);
    return;
  }
  S.memoriaNav = { indice: r.indice, quando: agora };
  if (S.loop.ligado) S.loop.alvo = r.indice; // o loop acompanha a fala escolhida
  // Pausado pelo usuário: continua pausado (só o play volta a tocar). Tocando: continua tocando.
  const pausado = S.primeiroPlay && p.estado() === 2;
  irParaIndice(r.indice);
  if (!pausado && p.estado() !== 1 && p.estado() !== 3) {
    if (S.primeiroPlay) p.tocar(); else tocarPrimeiraVez();
  }
  mostrarRetorno(TEXTO_RETORNO[acao], acao);
  vibrar();
}

// ============================================================ segurar o dedo no vídeo: 2× (versão 14)
// Como no app do YouTube: enquanto o dedo fica no vídeo, ele anda em 2× (com o selo "2×" no topo do vídeo);
// ao soltar, volta à velocidade dos Ajustes. Pausado: anda em 2× enquanto segura e pausa de novo ao soltar.
// A velocidade dos Ajustes não muda (o 2× não é salvo). Durante anúncio, nada acontece.

const VEL_RAPIDA = 2;

/** Troca a velocidade na hora, sem guardar nos Ajustes. */
function velocidadeMomentanea(v) {
  const p = S.player;
  if (!p) return;
  if (velocidadeFina()) p.definirVelocidadeExata(v);
  else p.definirVelocidade(v);
}

function acelerarSegurando() {
  const p = S.player;
  if (!p || S.rapido || !S.primeiroPlay || S.anuncio.ativo) return;
  const st = p.estado();
  const pausado = st === 2;
  if (!pausado && st !== 1 && st !== 3) return;
  S.rapido = { pausarAoSoltar: pausado };
  velocidadeMomentanea(VEL_RAPIDA);
  if (pausado) p.tocar();
  const selo = $('#selo-rapido');
  selo.hidden = false;
  selo.classList.remove('visivel');
  void selo.offsetWidth;
  selo.classList.add('visivel');
  vibrar();
}

/** O dedo saiu do vídeo: volta à velocidade dos Ajustes (e pausa de novo, se estava pausado). */
function soltarAceleracao() {
  const r = S.rapido;
  if (!r) return;
  pararAceleracao();
  const p = S.player;
  if (!p) return;
  velocidadeMomentanea(velocidadeSalvaAlvo());
  if (r.pausarAoSoltar && !S.anuncio.ativo) p.pausar();
}

/** Some com o selo do 2× (sem mexer no player). */
function pararAceleracao() {
  S.rapido = null;
  const selo = $('#selo-rapido');
  if (selo) { selo.classList.remove('visivel'); selo.hidden = true; }
}

// ============================================================ velocidade (no painel de ajustes)

// Para mais devagar, de 0,05 em 0,05 (0,95× … 0,60×; abaixo disso a fala fica distorcida e não ajuda).
// Para mais rápido, as do YouTube (1,25× … 2×). Só no app Android com o gancho v5: a API do iframe
// arredonda para a lista do YouTube.
const VEL_MINIMA = 0.6;
const VELS_LENTAS = Array.from({ length: 8 }, (_, i) => Math.round((VEL_MINIMA + i * 0.05) * 100) / 100);
const VEL_FINA_MOCK = MOCK && new URLSearchParams(location.search).get('mockVelFina') === '1';

/** "0,95" e "0,90" (sempre duas casas abaixo de 1×); "1", "1,25" acima. */
function rotuloVelocidade(v) {
  return v < 1 - 1e-6 ? v.toFixed(2).replace('.', ',') : formatarNumero(v);
}

function velocidadeFina() {
  return !!S.player && (S.velFina || VEL_FINA_MOCK) && typeof S.player.definirVelocidadeExata === 'function';
}

function listaVelocidades() {
  const p = S.player;
  if (!p) return [1];
  const vels = p.velocidades().filter((v) => v >= VEL_MINIMA - 1e-6);
  if (!velocidadeFina()) return vels.length ? vels : [1];
  const rapidas = vels.filter((v) => v > 1 + 1e-6);
  return [...VELS_LENTAS, 1, ...(rapidas.length ? rapidas : [1.25, 1.5, 1.75, 2])];
}

function pedirVelocidade(v) {
  const p = S.player;
  if (!p) return;
  S.velPedida = { v, quando: performance.now() };
  // Com o gancho, toda troca passa por ele (inclusive 1× e 1,5×): o YouTube não sabe das velocidades finas.
  if (velocidadeFina()) p.definirVelocidadeExata(v);
  else p.definirVelocidade(v);
}

// Barra de velocidade (versão 22): mesmos valores dos antigos botões (listaVelocidades), um por passo.
// Enquanto arrasta, só o número muda; ao soltar, pede a velocidade. Não refaz a barra durante o arraste.
function posVelocidade(vels, v) {
  let k = 0;
  vels.forEach((x, j) => { if (Math.abs(x - v) < Math.abs(vels[k] - v)) k = j; });
  return k;
}

function pintarVelocidade(barra, vels, k) {
  const pct = vels.length > 1 ? (k / (vels.length - 1)) * 100 : 0;
  barra.style.setProperty('--pct', `${pct}%`);
  const rot = `${rotuloVelocidade(vels[k])}×`;
  barra.setAttribute('aria-valuetext', rot);
  $('#valor-velocidade').textContent = rot;
}

function montarVelocidades() {
  const caixa = $('#linha-velocidade');
  const vels = listaVelocidades();
  const assinatura = vels.join(',');
  let barra = caixa.querySelector('input.barra-vel');
  if (barra && barra.dataset.vels === assinatura) {
    if (!S.velArrastando) {
      barra.value = String(posVelocidade(vels, S.velConfirmada));
      pintarVelocidade(barra, vels, Number(barra.value));
    }
    return;
  }
  caixa.textContent = '';
  const topo = document.createElement('div');
  topo.className = 'vel-topo';
  const menos = document.createElement('span');
  menos.className = 'vel-ponta';
  menos.textContent = `${rotuloVelocidade(vels[0])}×`;
  const valor = document.createElement('output');
  valor.id = 'valor-velocidade';
  valor.className = 'vel-valor';
  const mais = document.createElement('span');
  mais.className = 'vel-ponta';
  mais.textContent = `${rotuloVelocidade(vels[vels.length - 1])}×`;
  topo.append(menos, valor, mais);
  barra = document.createElement('input');
  barra.type = 'range';
  barra.className = 'barra-vel';
  barra.min = '0';
  barra.max = String(Math.max(0, vels.length - 1));
  barra.step = '1';
  barra.dataset.vels = assinatura;
  barra.setAttribute('aria-label', 'Velocidade');
  barra.value = String(posVelocidade(vels, S.velConfirmada));
  const marcas = document.createElement('div');
  marcas.className = 'vel-marcas';
  marcas.setAttribute('aria-hidden', 'true');
  vels.forEach((v) => {
    const m = document.createElement('i');
    if (Math.abs(v - 1) < 1e-6) m.className = 'um';
    marcas.appendChild(m);
  });
  barra.addEventListener('input', () => {
    S.velArrastando = true;
    pintarVelocidade(barra, vels, Number(barra.value));
  });
  // Soltou sem mudar de valor: não há 'change'; só libera a barra para as atualizações.
  const soltar = () => { S.velArrastando = false; };
  barra.addEventListener('pointerup', soltar);
  barra.addEventListener('pointercancel', soltar);
  barra.addEventListener('blur', soltar);
  barra.addEventListener('change', () => {
    S.velArrastando = false;
    pintarVelocidade(barra, vels, Number(barra.value));
    pedirVelocidade(vels[Number(barra.value)]);
  });
  caixa.append(topo, barra, marcas);
  pintarVelocidade(barra, vels, Number(barra.value));
}

function montarFolgas() {
  const linha = $('#linha-folga');
  if (!linha) return;
  linha.textContent = '';
  for (const v of FOLGAS_MAX) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (Math.abs(v - S.ajustes.folgaFala) < 1e-3 ? ' confirmada' : '');
    b.textContent = `${formatarNumero(v, 2)} s`;
    b.addEventListener('click', () => {
      S.ajustes.folgaFala = v;
      salvar();
      montarFolgas();
    });
    linha.appendChild(b);
  }
}

function mudarVelocidadePasso(passo) {
  const p = S.player;
  if (!p) return;
  const vels = listaVelocidades().slice().sort((a, b) => a - b);
  // Toques rápidos seguidos partem do último valor pedido (a confirmação do player chega depois).
  const base = S.velPedida && performance.now() - S.velPedida.quando < 1500 ? S.velPedida.v : S.velConfirmada;
  let i = vels.findIndex((v) => Math.abs(v - base) < 1e-3);
  if (i < 0) i = vels.indexOf(1);
  const j = Math.min(vels.length - 1, Math.max(0, i + passo));
  if (j !== i) {
    pedirVelocidade(vels[j]);
    selo(`Velocidade ${rotuloVelocidade(vels[j])}×`, 1100, ICONE_VELOCIDADE);
  }
}

/** Velocidade real do vídeo, avisada pelo gancho v5 (muda também quando o YouTube a troca sozinho). */
function aoReceberVelocidade(ev) {
  const d = ev.data;
  if (!ANDROID || !d || typeof d !== 'object' || d.ldVel !== true || d.anuncio === true) return;
  if (!deQuadroDoPlayer(ev)) return;
  S.player?.receberVelocidade?.(d.v);
}

// ============================================================ cartão da palavra (9.3)

let palavraAtual = '';
let fraseAtual = '';
let pedidoSignificado = null;

/** Mostra o significado no cartão: tradução principal e, se houver, outros sentidos por classe de palavra. */
function mostrarSignificado(r) {
  const caixa = $('#cp-significado');
  caixa.textContent = '';
  caixa.classList.remove('carregando', 'erro');
  const principal = document.createElement('p');
  principal.className = 'cp-principal';
  principal.textContent = r.principal;
  caixa.appendChild(principal);
  const extras = r.sentidos.filter((x) => x.termos.some((tm) => tm.toLowerCase() !== r.principal.toLowerCase()) || x.termos.length > 1);
  for (const x of extras) {
    const linha = document.createElement('p');
    linha.className = 'cp-sentido';
    if (x.classe) {
      const c = document.createElement('span');
      c.className = 'cp-classe';
      c.textContent = x.classe;
      linha.append(c, ' ');
    }
    linha.append(x.termos.join(', '));
    caixa.appendChild(linha);
  }
}

async function buscarSignificado(palavra) {
  try { pedidoSignificado?.abort(); } catch { /* nada */ }
  const controle = new AbortController();
  pedidoSignificado = controle;
  const caixa = $('#cp-significado');
  caixa.textContent = t('Buscando o significado…');
  caixa.classList.add('carregando');
  caixa.classList.remove('erro');
  try {
    const r = await significadoPalavra(palavra, idiomaOrigem(), idiomaAlvo(), IDIOMA_UI, controle.signal);
    if (pedidoSignificado !== controle) return;
    if (!r.principal) throw new Error('vazio');
    mostrarSignificado(r);
    // Idioma descoberto pelo tradutor (quando o do vídeo não é conhecido): dicionário certo.
    if (r.origem && idiomaOrigem() === 'auto') $('#cp-dicionario').href = urlDicionario(palavra, r.origem, idiomaAlvo());
  } catch (e) {
    if (e?.name === 'AbortError' || pedidoSignificado !== controle) return;
    caixa.textContent = t('Não consegui buscar o significado. Confira a internet ou toque em Dicionário.');
    caixa.classList.remove('carregando');
    caixa.classList.add('erro');
  }
  posicionarCartao();
}

let spanCartao = null;
function posicionarCartao() {
  const cartao = $('#cartao-palavra');
  if (cartao.hidden || !spanCartao) return;
  const caixa = $('#caixa-legenda').getBoundingClientRect();
  const alt = cartao.offsetHeight;
  const meiaLargura = cartao.offsetWidth / 2;
  const centro = Math.min(window.innerWidth - meiaLargura - 10, Math.max(meiaLargura + 10, caixa.left + caixa.width / 2));
  cartao.style.left = `${centro}px`;
  const r = spanCartao.getBoundingClientRect();
  let top = r.top - alt - 8;
  if (top < 8) top = Math.min(window.innerHeight - alt - 8, r.bottom + 8);
  cartao.style.top = `${Math.max(8, top)}px`;
}

function abrirCartao(span) {
  const palavra = limparPalavra(span.textContent);
  if (!palavra) return;
  S.player?.pausar();
  palavraAtual = palavra;
  fraseAtual = S.unidades[S.exibida]?.texto || '';
  $$('.palavra.tocada').forEach((e) => e.classList.remove('tocada'));
  span.classList.add('tocada');
  $('#cp-palavra').textContent = palavra;
  $('#cp-dicionario').href = urlDicionario(palavra, idiomaOrigem(), idiomaAlvo());
  spanCartao = span;
  $('#cartao-palavra').hidden = false;
  buscarSignificado(palavra);
  posicionarCartao();
}

function fecharCartao() {
  const c = $('#cartao-palavra');
  if (!c || c.hidden) return;
  c.hidden = true;
  spanCartao = null;
  try { pedidoSignificado?.abort(); } catch { /* nada */ }
  pedidoSignificado = null;
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
  if (alvo.classList.contains('palavra') && alvo.closest('#caixa-l1')) { abrirCartao(alvo); return; }
  const vizinha = alvo.closest('.fala.vizinha');
  if (vizinha && !vizinha.hidden) irParaVizinha(vizinha);
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
  if (!im && antes) requestAnimationFrame(ajustarEscala); // a caixa da legenda voltou a aparecer
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
  if (el && chave === 'fonteL1') {
    const f = fonteAtual();
    const padrao = AJUSTES_PADRAO.fonteL1;
    el.textContent = f === padrao ? `${f} px (padrão)` : `${f} px (padrão: ${padrao} px)`;
  }
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
  montarFolgas();
  const reg = S.registro;
  $('#grupo-sincronia').hidden = !reg;
  montarLegendaAjustes();
  $('#grupo-pontuacao').hidden = !pontuacaoSuportada();
  renderPacotes();
  voz.renderAjustes();
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

/** Faixa da legenda que está na tela: { languageCode, kind } ou null. */
function faixaAtualDoVideo() {
  const e = S.registro?.estudo;
  if (!e || e.origem !== 'youtube' || !e.idioma) return null;
  // Vídeos salvos antes desta versão não guardavam "automatica": o nome do arquivo diz.
  const auto = e.automatica ?? /\(auto-generated\)/.test(e.arquivo || '');
  return { languageCode: e.idioma, kind: auto ? 'asr' : '' };
}

/**
 * Ajustes → "Idioma do vídeo": a lista das legendas que o YouTube tem para o vídeo aberto,
 * com a que está na tela já marcada. Trocar na lista baixa a outra legenda na hora.
 */
function montarLegendaAjustes() {
  const sel = $('#sel-legenda-ajustes');
  const rotulo = $('#ajuste-legenda-video');
  const dica = $('#dica-legenda-ajustes');
  const reg = S.registro;
  const p = S.player;
  const disponivel = !!(reg && p?.faixasLegenda);
  rotulo.hidden = !disponivel;
  dica.hidden = true;
  if (!disponivel) return;
  const atual = faixaAtualDoVideo();
  const faixas = juntarFaixas(p).faixas;
  if (atual && !faixas.some((f) => mesmaFaixa(f, atual))) faixas.unshift(atual);
  S.faixasAjustes = faixas;
  sel.textContent = '';
  if (!atual) {
    const o = document.createElement('option');
    o.value = '';
    o.textContent = t('Escolha a legenda');
    sel.appendChild(o);
  }
  faixas.forEach((f, i) => {
    const o = document.createElement('option');
    o.value = String(i);
    o.textContent = nomeFaixa(f);
    sel.appendChild(o);
  });
  sel.value = atual ? String(faixas.findIndex((f) => mesmaFaixa(f, atual))) : '';
  sel.disabled = S.yt.estado === 'pegando';
  if (faixas.length <= 1) {
    dica.textContent = t(faixas.length ? 'O YouTube só tem esta legenda para este vídeo.' : 'O YouTube ainda não mostrou as legendas deste vídeo.');
    dica.hidden = false;
  }
}

function aoTrocarLegendaAjustes(ev) {
  const faixa = (S.faixasAjustes || [])[Number(ev.target.value)];
  const atual = faixaAtualDoVideo();
  if (!faixa || (atual && mesmaFaixa(faixa, atual))) return;
  fecharPaineis();
  trocarFaixaDireto(faixa);
}

/** Troca a legenda do vídeo aberto por outra faixa, sem a janela de escolha. */
function trocarFaixaDireto(faixa) {
  const p = S.player;
  if (!p || !S.registro) return;
  clearTimeout(S.yt.timer);
  S.yt.geracao++;
  p.manterLegendas?.(true);
  S.yt.trocando = true;
  S.yt.tentativas = 0;
  S.yt.faixa = null;
  $('#erro-player').hidden = true;
  diag(`troca pelos Ajustes: ${faixa.languageCode}${faixa.kind === 'asr' ? '/asr' : ''}`);
  S.yt.fase = 'baixando';
  mostrarCarregando();
  pedirFaixa(faixa);
}

function abrirPainel(id) {
  for (const outro of ['#painel-ajustes', '#ajuda']) if (outro !== id) $(outro).hidden = true;
  if (id === '#painel-ajustes') sincronizarPainel();
  mostrarComAnimacao($('#fundo-painel'));
  mostrarComAnimacao($(id));
}

function fecharPaineis() {
  // 0,25 s: o painel desce até sair da tela (css: tr-painel-desce)
  esconderComAnimacao($('#fundo-painel'), 250);
  esconderComAnimacao($('#painel-ajustes'), 250);
  esconderComAnimacao($('#ajuda'), 250);
}

/** Barra do tamanho das letras sendo arrastada: só mostra o tamanho novo (ainda não salva). */
function previaFonte(el) {
  if (fonteAntesDaPrevia === null) fonteAntesDaPrevia = S.ajustes.fonteL1;
  fontePrevia = Number(el.value);
  mostrarValor('fonteL1');
  aplicarAparencia();
  renderLegenda(true);
}

/** Dedo solto da barra: pergunta antes de trocar o tamanho das letras; "Cancelar" volta ao de antes. */
async function confirmarFonte(el) {
  const antes = fonteAntesDaPrevia ?? S.ajustes.fonteL1;
  const novo = Number(el.value);
  fonteAntesDaPrevia = null;
  if (novo === antes) {
    fontePrevia = null;
    mostrarValor('fonteL1');
    aplicarAparencia();
    return;
  }
  const r = await dialogo({
    texto: `Alterar o tamanho das letras da legenda de ${antes}\u00a0px para ${novo}\u00a0px?`,
    ok: 'Alterar',
    cancelar: 'Cancelar',
  });
  fontePrevia = null;
  if (r.ok) {
    S.ajustes.fonteL1 = novo;
    salvar();
  } else {
    S.ajustes.fonteL1 = antes;
  }
  el.value = String(S.ajustes.fonteL1);
  mostrarValor('fonteL1');
  aplicarAparencia();
  renderLegenda(true);
}

/**
 * Botão "Restaurar ajustes padrão" (versão 15): depois de confirmar, todos os ajustes voltam ao padrão de
 * quem acabou de instalar. Não mexe nos vídeos salvos (nem na sincronia de cada vídeo), nos pacotes de
 * pontuação baixados nem na explicação dos gestos já marcada "não mostrar mais".
 */
async function restaurarAjustesPadrao() {
  const r = await dialogo({
    texto: 'Restaurar todos os ajustes ao padrão? Velocidade 1×, letras de 19\u00a0px, sentido de deslizamento '
      + 'normal, tradução para o idioma do celular e mostrada sempre, e falas em lista. Seus vídeos, as '
      + 'legendas salvas e os pacotes de pontuação baixados continuam como estão.',
    ok: 'Restaurar',
    cancelar: 'Cancelar',
  });
  if (!r.ok) return;
  const antes = { ...S.ajustes };
  const novo = { ...AJUSTES_PADRAO, gestosExplicados: antes.gestosExplicados };
  novo.destino = IDIOMA_SISTEMA; // sem escolha manual, a tradução segue o idioma do celular
  Object.assign(S.ajustes, novo);
  fontePrevia = null;
  fonteAntesDaPrevia = null;
  salvar();
  aplicarAparencia();
  atualizarBotaoTraducao();
  atualizarBotaoModoLegenda();
  aplicarVelocidadeSalva();
  const reg = S.registro;
  if (reg) {
    const mudouIdioma = antes.idioma !== S.ajustes.idioma;
    const refazer = mudouIdioma || antes.destino !== S.ajustes.destino || antes.pontuacaoModelo !== S.ajustes.pontuacaoModelo;
    if (refazer) {
      if (mudouIdioma && traducaoAutomaticaAtiva()) reg.traducaoAuto = null;
      cancelarTraducaoAuto();
      reprocessar();
      pontuarAoFundo();
    } else {
      renderLegenda(true);
    }
  }
  mostrarAmbas();
  sincronizarPainel();
  toast('Ajustes restaurados ao padrão.');
}

function aoMudarAjuste(el) {
  const k = el.dataset.ajuste;
  let v;
  if (el.type === 'checkbox') v = el.checked;
  else if (el.type === 'range') v = Number(el.value);
  else v = el.value;
  S.ajustes[k] = v;
  if (k === 'destino') S.ajustes.destinoManual = true;
  salvar();
  mostrarValor(k);
  aplicarAparencia();
  if (k === 'pontuacaoModelo') {
    for (const c of $$('[data-ajuste="pontuacaoModelo"]')) c.checked = !!v;
    if (!v) S.modelo?.ctrl.abort();
    reprocessar();
    pontuarAoFundo();
  } else if (k === 'destino') {
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
    cancelarTelaAB();
    return;
  }
  if (telaABAberta()) return; // escolhendo o trecho: só a lista e o Esc valem
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
  else if (k === 'b' || k === 'B') tocarAB();
  else if (k === 't' || k === 'T') ciclarModoTraducao();
  else if (k === 'v' || k === 'V') alternarModoLegenda();
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
  if (ANDROID && ehShorts(texto)) { mostrarBloqueio('shorts'); return; }
  if (!link) {
    toast(MSG_LINK_INVALIDO);
    return;
  }
  $('#campo-link').value = linkDoVideo(link.videoId, link.inicioSeg);
  if (ANDROID) {
    // App Android: o vídeo abre direto e a legenda vem do YouTube.
    validarFormulario();
    abrirDoFormulario();
    return;
  }
  const msg = $('#msg-link');
  msg.textContent = 'Link recebido. Agora escolha os arquivos de legenda.';
  msg.className = 'msg msg-alerta';
  validarFormulario();
}

// ============================================================ busca no YouTube (app Android, 15.11)

const CHAVE_FILTROS = 'ld.filtrosBusca';
let filtrosBusca = (() => {
  try { return misturarFiltros(JSON.parse(localStorage.getItem(CHAVE_FILTROS) || 'null')); } catch { return misturarFiltros(null); }
})();

function montarFiltros() {
  for (const el of $$('[data-filtro]')) {
    const k = el.dataset.filtro;
    if (el.type === 'checkbox') {
      el.checked = filtrosBusca.legendas;
    } else {
      el.textContent = '';
      for (const [v, nome] of OPCOES_FILTROS[k]) {
        const o = document.createElement('option');
        o.value = String(v);
        o.textContent = nome;
        el.appendChild(o);
      }
      el.value = String(filtrosBusca[k]);
    }
  }
  resumirFiltros();
}

function resumirFiltros() {
  const partes = [];
  for (const k of ['data', 'duracao', 'ordem']) {
    if (filtrosBusca[k]) partes.push(OPCOES_FILTROS[k].find(([v]) => v === filtrosBusca[k])[1]);
  }
  if (filtrosBusca.legendas) partes.push('com legenda (CC)');
  $('#resumo-filtros').textContent = partes.length ? `(${partes.join(', ')})` : '';
}

function aoMudarFiltro(el) {
  const k = el.dataset.filtro;
  filtrosBusca = misturarFiltros({ ...filtrosBusca, [k]: el.type === 'checkbox' ? el.checked : Number(el.value) });
  try { localStorage.setItem(CHAVE_FILTROS, JSON.stringify(filtrosBusca)); } catch { /* nada */ }
  resumirFiltros();
}

/** Abre o YouTube dentro do app Android (tela por cima). Sem endereço: volta ao YouTube onde estava. */
function abrirYoutube(url) {
  if (!window.LDNativo) { if (url) toast('A busca no YouTube só funciona dentro do app Android.'); return; }
  try {
    window.LDNativo.postMessage(JSON.stringify({ acao: 'youtube', url }));
  } catch {
    toast('Não consegui abrir o YouTube.');
  }
}

/** O app Android chama esta função quando um vídeo é tocado no YouTube de dentro do app. */
window.ldAbrirDoYoutube = (url) => {
  trocaDoApp = true; // quem anima é o app (ele espera o aviso "telaPronta")
  if (ehShorts(url)) { mostrarBloqueio('shorts'); return; }
  const link = lerLink(String(url || ''));
  if (!link) { trocaDoApp = false; return; }
  if (S.registro) fecharVideo();
  limparFormulario();
  $('#campo-link').value = linkDoVideo(link.videoId, link.inicioSeg);
  validarFormulario();
  abrirDoFormulario();
};

/** O app Android chama esta função no botão "Meus vídeos" (em cima do YouTube). */
window.ldMostrarBiblioteca = () => {
  trocaDoApp = true; // quem anima é o app (ele espera o aviso "telaPronta")
  $('#tela-bloqueio').hidden = true;
  if (S.registro) {
    fecharVideo();
    history.replaceState(null, '', location.pathname + location.search + '#biblioteca');
  }
  mostrarBiblioteca();
  renderBiblioteca();
  window.scrollTo(0, 0);
};

/**
 * O app Android chama esta função no "voltar" do celular. Devolve 'ok' se a página fez algo
 * (fechou uma janela ou saiu do vídeo) e 'nao' se não há o que fazer (o app volta ao YouTube).
 */
window.ldVoltar = () => {
  if (!$('#tela-bloqueio').hidden) { sairDoBloqueio(); return 'ok'; }
  if (!$('#tela-gestos').hidden) {
    // Na explicação antes do vídeo, voltar sai do vídeo (aberta pelos Ajustes, só fecha a janela).
    const antesDoVideo = S.yt.fase === 'gestos' || !S.primeiroPlay;
    S.fimExplicacao?.(false);
    if (antesDoVideo && !$('#tela-assistir').hidden) voltarParaBiblioteca();
    return 'ok';
  }
  if (!$('#dialogo').hidden) { $('#dialogo-cancelar').click(); return 'ok'; }
  if (!$('#tela-carregando').hidden) { cancelarCarregando(); return 'ok'; }
  if (!$('#tela-idioma').hidden) { $('#idioma-cancelar').click(); return 'ok'; }
  if (aberto($('#painel-ajustes')) || aberto($('#ajuda'))) { fecharPaineis(); return 'ok'; }
  if (!$('#cartao-palavra').hidden) { fecharCartao(); return 'ok'; }
  if (aberto($('#menu-traducao'))) { fecharMenuTraducao(); return 'ok'; }
  if (telaABAberta()) { cancelarTelaAB(); return 'ok'; }
  if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return 'ok'; }
  if (!$('#tela-assistir').hidden) { voltarParaBiblioteca(); return 'ok'; }
  return 'nao';
};

function ligarBusca() {
  const atualizado = ANDROID && APK >= 3;
  $('#busca-ativa').hidden = !atualizado;
  $('#busca-atualizar').hidden = atualizado;
  montarFiltros();
  for (const el of $$('[data-filtro]')) el.addEventListener('change', () => aoMudarFiltro(el));
  $('#form-busca').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const termo = $('#campo-busca').value.trim();
    if (!termo) { $('#campo-busca').focus(); return; }
    $('#campo-busca').blur(); // fecha o teclado
    abrirYoutube(urlBusca(termo, filtrosBusca));
  });
  $('#btn-youtube-inicio').addEventListener('click', () => abrirYoutube(urlBusca('')));
}

// ============================================================ ligar tudo

function ligarEventos() {
  ligarBusca();
  // biblioteca
  $('#campo-link').addEventListener('input', validarFormulario);
  $('#btn-colar').addEventListener('click', colar);
  $('#arq-estudo').addEventListener('change', (ev) => { receberArquivos(ev.target.files, 'estudo'); ev.target.value = ''; });
  $('#arq-traducao').addEventListener('change', (ev) => { receberArquivos(ev.target.files, 'traducao'); ev.target.value = ''; });
  $('#arq-dupla').addEventListener('change', (ev) => { receberDupla(ev.target.files); ev.target.value = ''; });
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
  $('#ab-cancelar').addEventListener('click', () => cancelarTelaAB());
  $('#bloqueio-voltar').addEventListener('click', sairDoBloqueio);
  $('#ab-refazer').addEventListener('click', refazerA);
  $('#ab-lista').addEventListener('click', (ev) => {
    const bt = ev.target.closest?.('.ab-fala');
    if (bt) escolherPontoAB(Number(bt.dataset.i));
  });
  window.addEventListener('popstate', () => { if (telaABAberta()) cancelarTelaAB(true); });
  $('#btn-traducao').addEventListener('click', (ev) => { ev.stopPropagation(); abrirMenuTraducao(); });
  $('#btn-modo-legenda').addEventListener('click', alternarModoLegenda);
  window.addEventListener('resize', () => ajustarEscala());
  for (const op of $$('#menu-traducao [data-modo]')) {
    op.addEventListener('click', (ev) => { ev.stopPropagation(); definirModoTraducao(op.dataset.modo); seloTraducao(op.dataset.modo); });
  }
  $('#btn-tela-cheia').addEventListener('click', alternarTelaCheia);
  $('#btn-liberar').addEventListener('click', liberarToque);
  $('#btn-ajustes').addEventListener('click', () => {
    // Abrir os Ajustes pausa o vídeo na hora (volta a tocar só pelo play).
    // (Não enquanto a legenda carrega: aí o vídeo toca sem som, coberto, para o YouTube entregar a legenda.)
    if (S.player && S.primeiroPlay && !S.yt.preparando && !S.yt.fase && [1, 3].includes(S.player.estado())) S.player.pausar();
    abrirPainel('#painel-ajustes');
  });
  $('#btn-fechar-ajustes').addEventListener('click', fecharPaineis);
  $('#btn-ver-gestos').addEventListener('click', () => { fecharPaineis(); mostrarExplicacaoGestos(); });
  $('#fundo-painel').addEventListener('click', fecharPaineis);
  $('#btn-tentar-traducao').addEventListener('click', () => {
    if (S.yt.estado === 'erro') { escolherLegendaYoutube(); return; }
    cancelarTraducaoAuto();
    iniciarTraducaoAuto();
  });
  $('#sel-legenda-ajustes').addEventListener('change', aoTrocarLegendaAjustes);
  window.addEventListener('message', aoReceberLegenda);
  window.addEventListener('message', aoReceberAnuncio);
  window.addEventListener('message', aoReceberDoGancho);
  window.addEventListener('message', aoReceberVelocidade);
  // Voz mais clara: relógio exato do vídeo, mandado pelo gancho (v6) de dentro do player
  window.addEventListener('message', (ev) => {
    if (ANDROID && ev.data && ev.data.ldTempo === true && deQuadroDoPlayer(ev)) voz.aoRelogio(ev.data);
  });
  voz.ligarEventos();
  $('#carregando-diag').addEventListener('click', copiarDiagnostico);
  $('#btn-pular').addEventListener('click', pularAnuncio);
  $('#carregando-pular').addEventListener('click', pularAnuncio);
  $('#carregando-voltar').addEventListener('click', cancelarCarregando);
  $('#carregando-tentar').addEventListener('click', () => escolherLegendaYoutube(S.yt.trocando));
  $('#carregando-sem').addEventListener('click', () => {
    // Sem legenda: assiste mesmo assim, do começo e com som.
    S.yt.estado = 'ocioso';
    atualizarAviso();
    finalizarPreparo(true);
  });
  $('#btn-ir-youtube').addEventListener('click', () => abrirYoutube(''));
  $('#carregando-simples').addEventListener('click', pularPontuacao);
  // Pontuação melhorada: botões do cartão (escolha do idioma) e das linhas dos Ajustes
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('.pm-baixar, .pm-cancelar, .pm-apagar');
    const bloco = b?.closest('[data-pacote]');
    if (!bloco) return;
    const id = bloco.dataset.pacote;
    if (b.classList.contains('pm-baixar')) baixarPacoteUI(id);
    else if (b.classList.contains('pm-cancelar')) S.download?.ctrl?.abort();
    else apagarPacoteUI(id);
  });

  // barra de progresso
  const barra = $('#barra-progresso');
  barra.addEventListener('input', () => {
    S.arrastandoBarra = true;
    const x = Number(barra.value);
    S.player?.irPara(x, false);
    $('#tempo-atual').textContent = formatarTempo(x);
  });
  // Soltou sem mudar de valor: não há 'change'; só libera a barra para as atualizações.
  const soltar = () => { S.velArrastando = false; };
  barra.addEventListener('pointerup', soltar);
  barra.addEventListener('pointercancel', soltar);
  barra.addEventListener('blur', soltar);
  barra.addEventListener('change', () => {
    const x = Number(barra.value);
    S.player?.irPara(x, true);
    S.arrastandoBarra = false;
    barra.blur();
    S.memoriaNav = null;
    S.alvoNav = null;
    renderLegenda(true);
    // O histórico do YouTube fica com o ponto novo (inclusive quando a pessoa volta no vídeo).
    const p = S.player;
    setTimeout(() => { if (S.player === p) avisarHistorico('progresso', true); }, 1500);
  });

  // tela cheia ou deitado: tocar na faixa mantém ela visível por mais 3 s
  for (const sel of ['#faixa', '#barra-botoes', '#barra-topo']) {
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
    // Segurar o dedo no vídeo: anda em 2× até soltar (como no app do YouTube). Repetir a fala: tecla R ou ↓.
    segurar: () => acelerarSegurando(),
    soltar: () => soltarAceleracao(),
  });
  ligarGestos($('#caixa-legenda'), {
    arrastar: (dir) => navegarAcao(direcaoDoArraste(dir)),
    toque: (alvo) => toqueNaCaixa(alvo),
  });

  // ajustes
  for (const el of $$('[data-ajuste]')) {
    if (el.dataset.ajuste === 'fonteL1') {
      // Tamanho das letras: prévia enquanto arrasta; ao soltar, pergunta antes de salvar (versão 15).
      el.addEventListener('input', () => previaFonte(el));
      el.addEventListener('change', () => confirmarFonte(el));
      continue;
    }
    el.addEventListener(el.type === 'range' ? 'input' : 'change', () => aoMudarAjuste(el));
  }
  $('#btn-restaurar-padrao').addEventListener('click', restaurarAjustesPadrao);
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
      soltarAceleracao(); // saiu do app segurando o dedo no vídeo: volta à velocidade normal
      voz.desligar(); // o laço para: o áudio tratado também (volta ao tocar no app de novo)
      salvarPosicao();
      cancelAnimationFrame(S.raf);
      S.raf = 0;
    } else {
      voltouAoApp();
      if (S.player) iniciarLaco();
      if (S.player?.estado() === 1) pedirTelaLigada();
    }
  });
  window.addEventListener('pagehide', salvarPosicao);
}

async function iniciar() {
  document.body.classList.toggle('android', ANDROID);
  document.body.classList.toggle('app-novo', APP_NOVO);
  montarListasIdiomas();
  iniciarI18n();
  aplicarAparencia();
  ligarEventos();
  lerCompartilhamento();
  if (location.hash === '#assistir' || !location.hash) {
    history.replaceState(null, '', location.pathname + location.search + '#biblioteca');
  }
  mostrarBiblioteca();
  atualizarEstadoPacotes(); // sem esperar: só olha o cache do aparelho
  if (downloadNativo()) mandarAoApp({ acao: 'estadoModelos' }); // download do app em andamento ou terminado
  voz.pedirEstado(); // voz mais clara: o que o app já tratou ou está tratando
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
      textoDiagnostico,
      atualizarEstadoPacotes,
      PACOTES, // os testes trocam os tamanhos pelos do modelo falso
    };
  }
}

iniciar();
