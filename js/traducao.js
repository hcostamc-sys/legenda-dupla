// traducao.js — tradução automática quando só existe a legenda do idioma estudado.
// Cada fala (ou frase montada) é traduzida sozinha e a tradução fica presa a ela:
// por isso a tradução nunca sai de sincronia com a legenda original.
//
// Serviço: o mesmo tradutor que o Google usa no Chrome (endpoint público, sem chave).
// Não é documentado oficialmente; se o Google mudar, a tradução automática para de
// funcionar e o app mostra o aviso para tentar de novo (as legendas continuam funcionando).

const URL_TRADUTOR = 'https://translate.googleapis.com/translate_a/t?client=gtx';
export const MAX_CARACTERES_LOTE = 3500;
export const MAX_ITENS_LOTE = 80;

export const NOMES_IDIOMA = { pt: 'português', en: 'inglês', es: 'espanhol', fr: 'francês' };

/** Divide a lista de textos em lotes que cabem num pedido. Mantém a ordem. */
export function dividirEmLotes(textos, maxCar = MAX_CARACTERES_LOTE, maxItens = MAX_ITENS_LOTE) {
  const lotes = [];
  let atual = [];
  let tam = 0;
  for (const t of textos) {
    if (atual.length && (tam + t.length > maxCar || atual.length >= maxItens)) {
      lotes.push(atual);
      atual = [];
      tam = 0;
    }
    atual.push(t);
    tam += t.length;
  }
  if (atual.length) lotes.push(atual);
  return lotes;
}

/**
 * Textos ainda sem tradução, sem repetir, começando pela fala `inicio`
 * (o trecho que a pessoa vai ver primeiro) e depois o começo do vídeo.
 */
export function textosPendentes(unidades, mapa, inicio = 0) {
  const i0 = Math.min(Math.max(0, inicio | 0), unidades.length);
  const ordem = [...unidades.slice(i0), ...unidades.slice(0, i0)];
  const vistos = new Set();
  const saida = [];
  for (const u of ordem) {
    if (u.marca || !u.texto || vistos.has(u.texto)) continue;
    vistos.add(u.texto);
    if (!Object.hasOwn(mapa, u.texto)) saida.push(u.texto);
  }
  return saida;
}

/** Coloca em cada unidade a tradução que já está no mapa. */
export function aplicarMapa(unidades, mapa) {
  for (const u of unidades) {
    u.trad = !u.marca && Object.hasOwn(mapa, u.texto) ? mapa[u.texto] : '';
  }
  return unidades;
}

/** Lê a resposta do tradutor: uma tradução por texto enviado, na mesma ordem. */
export function lerResposta(dados, quantos) {
  let lista = dados;
  if (typeof lista === 'string') lista = [lista];
  if (!Array.isArray(lista)) return Array(quantos).fill('');
  // Com um texto só e idioma de origem automático, vem ["tradução", "en"].
  if (quantos === 1 && lista.length === 2 && typeof lista[0] === 'string' && typeof lista[1] === 'string' && /^[a-z]{2,3}(-[A-Za-z]+)?$/.test(lista[1])) {
    lista = [lista[0]];
  }
  const saida = [];
  for (let i = 0; i < quantos; i++) {
    let v = lista[i];
    if (Array.isArray(v)) v = v[0];
    saida.push(typeof v === 'string' ? v.trim() : '');
  }
  return saida;
}

/** Traduz um lote. Lança erro se o serviço falhar. */
export async function traduzirLote(textos, de, para, sinal) {
  const corpo = new URLSearchParams();
  for (const t of textos) corpo.append('q', t);
  const url = `${URL_TRADUTOR}&sl=${encodeURIComponent(de || 'auto')}&tl=${encodeURIComponent(para)}`;
  const r = await fetch(url, { method: 'POST', body: corpo, signal: sinal, credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!r.ok) throw new Error(`Tradutor respondeu ${r.status}`);
  return lerResposta(await r.json(), textos.length);
}

const esperarMs = (ms, sinal) => new Promise((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  sinal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('cancelado', 'AbortError')); }, { once: true });
});

/**
 * Traduz todos os textos, lote por lote, na ordem recebida.
 * aoLote(textosDoLote, traducoes) é chamado a cada lote pronto.
 * Lança erro se algum lote falhar depois de 3 tentativas (os lotes anteriores já foram entregues).
 */
export async function traduzirTodos(textos, { de = 'auto', para = 'pt', sinal, aoLote } = {}) {
  for (const lote of dividirEmLotes(textos)) {
    let ultimoErro = null;
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      if (sinal?.aborted) throw new DOMException('cancelado', 'AbortError');
      try {
        const traducoes = await traduzirLote(lote, de, para, sinal);
        aoLote?.(lote, traducoes);
        ultimoErro = null;
        break;
      } catch (e) {
        if (e?.name === 'AbortError') throw e;
        ultimoErro = e;
        if (tentativa < 2) await esperarMs(1500 * (tentativa + 1), sinal);
      }
    }
    if (ultimoErro) throw ultimoErro;
  }
}
