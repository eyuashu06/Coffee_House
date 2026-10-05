// Service Worker for Artisanal Reserve Coffee PWA
const CACHE_NAME = 'artisanal-coffee-cache-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/manifest.json',
  '/favicon.ico',
  '/icon-192.png',
  '/icon-512.png'
];

// Authenticated API data must never be written to the cache: it is per-user,
// and a shared cache entry would hand one customer's orders or profile to
// whoever else opens the app next.
const isApiRequest = (url) =>
  url.pathname.startsWith('/api/') || url.pathname.startsWith('/media/');

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Add entries one at a time. cache.addAll() is atomic -- a single 404
      // (which is exactly what a missing favicon used to cause) rejects the
      // whole promise and the worker never activates, silently disabling every
      // other precached asset as well.
      await Promise.all(
        ASSETS_TO_CACHE.map((asset) =>
          cache.add(asset).catch((err) => {
            console.warn('[sw] precache skipped', asset, err);
          })
        )
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (!cache.startsWith('artisanal-coffee-cache-')) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Same-origin only, and never API traffic.
  if (url.origin !== self.location.origin || isApiRequest(url)) return;

  // Navigations: network first so a deploy is picked up immediately, falling
  // back to the cached shell only when genuinely offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/', copy));
          }
          return response;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  // Static assets: cache first, since their URLs are content-hashed or versioned.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response && response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});