// Livroto Service Worker — PWA offline support
const CACHE = 'livroto-v26';
const ASSETS = [
  '/',
  '/catalog',
  '/auth',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/favicon-32.png',
  '/offline',
];

// Install: cache les ressources essentielles
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

// Activate: nettoie les anciens caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Fetch: network-first pour les pages, cache-first pour les assets
self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // Ignore les requêtes non-HTTP et les API Supabase
  if (!request.url.startsWith('http') || url.host.includes('supabase.co')) return;

  // Assets statiques → cache-first
  if (
    request.destination === 'image' ||
    request.destination === 'font' ||
    request.destination === 'style' ||
    request.destination === 'script' ||
    url.pathname.includes('/assets/')
  ) {
    e.respondWith(
      caches.match(request).then((cached) =>
        cached ?? fetch(request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(request, clone));
          }
          return res;
        })
      )
    );
    return;
  }

  // Pages → network-first, fallback cache, puis page offline
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(request, clone));
          }
          return res;
        })
        .catch(() =>
          caches.match(request).then((cached) =>
            cached ?? caches.match('/offline') ?? new Response(
              '<html><body style="font-family:sans-serif;text-align:center;padding:3rem"><h1>Livroto</h1><p>Tu es hors ligne. Reconnecte-toi à internet.</p><a href="/">Réessayer</a></body></html>',
              { headers: { 'Content-Type': 'text/html' } }
            )
          )
        )
    );
  }
});

// Message: force la mise à jour
self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
