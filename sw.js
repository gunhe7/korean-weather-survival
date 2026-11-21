const CACHE_NAME = 'k-weather-survival-v20261121hd25';
const CORE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './js/data.js',
  './js/audio.js',
  './js/online.js',
  './js/renderer.js',
  './js/game.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const isCodeOrDoc =
    event.request.mode === 'navigate' ||
    url.pathname.endsWith('/') ||
    /\.(html|js|css|json)$/i.test(url.pathname);

  if (isCodeOrDoc) {
    // NETWORK-FIRST for HTML/JS/CSS/JSON so returning phones NEVER get mismatched old/new code!
    event.respondWith(
      fetch(event.request)
        .then((resp) => {
          if (resp && resp.status === 200) {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return resp;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Stale-while-revalidate for static sprites/images/fonts
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((resp) => {
          if (resp && resp.status === 200) {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return resp;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
