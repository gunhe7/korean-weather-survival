const CACHE_NAME = 'k-weather-survival-v20261121hd121';
const ASSET_CACHE_NAME = 'k-weather-survival-assets-v1';
const CORE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './js/data.js',
  './js/ui-icons.js',
  './js/weather-live.js',
  './js/audio.js',
  './js/studio-intro.js',
  './js/online.js',
  './js/renderer.js',
  './js/game.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== ASSET_CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  // Let browser handle MP4/Range requests natively (critical for iOS Safari <video> playback!)
  if (event.request.headers.has('range') || /\.(mp4|webm|mov)$/i.test(url.pathname)) return;

  const isCodeOrDoc =
    event.request.mode === 'navigate' ||
    url.pathname.endsWith('/') ||
    /\.(html|js|css|json)$/i.test(url.pathname);

  if (isCodeOrDoc) {
    // STRICT NETWORK-FIRST (bypass GitHub Pages 10-min HTTP cache!) so mobile phones NEVER run stale HTML/JS!
    event.respondWith(
      fetch(event.request, { cache: 'no-cache' })
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

  // PERSISTENT CACHE-FIRST for versioned images & fonts (survives code updates for instant mobile loading!)
  event.respondWith(
    caches.open(ASSET_CACHE_NAME).then((assetCache) =>
      assetCache.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((resp) => {
          if (resp && resp.status === 200) {
            const copy = resp.clone();
            assetCache.put(event.request, copy);
          }
          return resp;
        });
      })
    )
  );
});
