// busca.js — endereço de busca do YouTube com filtros (app Android, PLANO.md 15.11).
// Os filtros vão no parâmetro "sp", que o próprio YouTube usa: uma mensagem protobuf em base64.
// Não é documentado: se o YouTube mudar, os filtros param de valer, mas a busca continua.
//   campo 1 (ordem): 0 relevância, 1 classificação, 2 data de envio, 3 visualizações
//   campo 2 (filtros): 1 data de envio (1 última hora … 5 este ano), 2 tipo (1 vídeo),
//                      3 duração (1 menos de 4 min, 2 mais de 20 min, 3 de 4 a 20 min), 5 legendas (1)

export const FILTROS_PADRAO = Object.freeze({ data: 0, duracao: 0, ordem: 0, legendas: false });

export const OPCOES_FILTROS = {
  data: [[0, 'Qualquer data'], [1, 'Última hora'], [2, 'Hoje'], [3, 'Esta semana'], [4, 'Este mês'], [5, 'Este ano']],
  duracao: [[0, 'Qualquer duração'], [1, 'Menos de 4 min'], [3, 'De 4 a 20 min'], [2, 'Mais de 20 min']],
  ordem: [[0, 'Relevância'], [2, 'Data de envio'], [3, 'Visualizações'], [1, 'Classificação']],
};

const valido = (lista, v) => lista.some(([n]) => n === v);

/** Mistura filtros salvos com os padrões, descartando valores inválidos. */
export function misturarFiltros(f) {
  const r = { ...FILTROS_PADRAO };
  if (f && typeof f === 'object') {
    for (const k of ['data', 'duracao', 'ordem']) if (valido(OPCOES_FILTROS[k], f[k])) r[k] = f[k];
    if (typeof f.legendas === 'boolean') r.legendas = f.legendas;
  }
  return r;
}

/** Valor do parâmetro sp (base64). Sempre filtra por vídeos (sem canais e playlists). */
export function montarSp(filtros = {}) {
  const f = misturarFiltros(filtros);
  const sub = [];
  if (f.data) sub.push(0x08, f.data);
  sub.push(0x10, 1); // tipo: vídeo
  if (f.duracao) sub.push(0x18, f.duracao);
  if (f.legendas) sub.push(0x28, 1);
  const bytes = [];
  if (f.ordem) bytes.push(0x08, f.ordem);
  bytes.push(0x12, sub.length, ...sub);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Endereço do YouTube para celular: busca com filtros, ou a página inicial se o termo estiver vazio. */
export function urlBusca(termo, filtros = {}) {
  const t = String(termo || '').trim();
  if (!t) return 'https://m.youtube.com/';
  return `https://m.youtube.com/results?search_query=${encodeURIComponent(t)}&sp=${encodeURIComponent(montarSp(filtros))}`;
}
