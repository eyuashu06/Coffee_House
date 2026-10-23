// Service Worker for Artisanal Reserve Coffee PWA
//
// Bump this whenever a deploy changes the app.
const CACHE_NAME = 'artisanal-coffee-cache-v4';
const ASSETS_TO_CACHE = [
  '/',
  '/manifest.json',
  '/favicon.ico',
  '/icon-192.png',
  '/icon-512.png'
];

const isLocalhost =
  self.location.hostname === 'localhost' ||
  self.location.hostname === '127.0.0.1' ||
  self.location.hostname.endsWith('.local');

// Never intercept API, media, or Next.js build/HMR chunks
const shouldBypass = (url) =>
  isLocalhost ||
  url.pathname.startsWith('/api/') ||
  url.pathname.startsWith('/media/') ||
  url.pathname.startsWith('/_next/') ||
  url.pathname.startsWith('/__next');

self.addEventListener('install', (event) => {
  if (isLocalhost) {
    self.skipWaiting();
    return;
  }
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
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
    caches.keys().then(async (cacheNames) => {
      if (isLocalhost) {
        await Promise.all(cacheNames.map((cache) => caches.delete(cache)));
        if (self.registration) {
          await self.registration.unregister();
        }
        return;
      }
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache.startsWith('artisanal-coffee-cache-') && cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
          return undefined;
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

  // Same-origin only, and bypass ignored routes
  if (url.origin !== self.location.origin || shouldBypass(url)) return;

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

  // Static assets (icons, manifest): cache first
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