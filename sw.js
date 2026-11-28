// sw.js — rede primeiro, cache como reserva, só para arquivos do próprio site (PLANO.md seção 4).
// Ao mudar qualquer arquivo do site, troque o nome do cache (ld-v2, ld-v4...).
const CACHE = 'ld-v34';
const ARQUIVOS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/legendas.js',
  './js/traducao.js',
  './js/timedtext.js',
  './js/busca.js',
  './js/player.js',
  './js/gestos.js',
  './js/armazenamento.js',
  './js/idiomas.js',
  './js/i18n.js',
  './js/modelos.js',
  './js/pontuador.js',
  './js/pontuador-worker.js',
  './js/voz.js',
  './vendor/ort/ort.wasm.bundle.min.mjs',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).catch(() => {}).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n.startsWith('ld-') && n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Nada do YouTube (youtube.com, ytimg.com, googlevideo.com) nem de outros sites passa por aqui.
  if (url.origin !== self.location.origin) return;
  // O motor da pontuação melhorada (15 MB) fica no cache dos pacotes (js/modelos.js), não aqui.
  if (url.pathname.endsWith('.wasm')) return;
  // Pacote baixado pelo app Android, entregue pelo próprio app (centenas de MB): passa direto.
  if (url.pathname.includes('/__ld_modelo/')) return;
  // Áudio tratado da voz mais clara (app Android, entregue pelo próprio app em pedaços) e qualquer pedido
  // de um pedaço (Range, usado pelo <audio> para pular): passa direto, sem cache.
  if (url.pathname.includes('/__ld_voz/') || req.headers.has('range')) return;
  ev.respondWith(
    // no-cache: confere com o servidor, para nunca misturar arquivos novos com antigos do cache HTTP.
    fetch(req, { cache: 'no-cache' })
      .then((resp) => {
        if (resp.ok && resp.type === 'basic') {
          const copia = resp.clone();
          const chave = url.origin + url.pathname; // sem parâmetros (?text=..., ?mock=1)
          caches.open(CACHE).then((c) => c.put(chave, copia)).catch(() => {});
        }
        return resp;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))),
  );
});
