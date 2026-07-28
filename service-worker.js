const CACHE_NAME = 'nclex-video-library-v6';
const APP_SHELL = [
  './',
  './index.html',
  './src/styles.css?v=6',
  './src/app.js?v=6',
  './data/library.js',
  './assets/favicon.svg?v=6',
  './assets/logo.svg?v=6',
  './assets/fallback.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  event.respondWith(caches.match(request).then(cached => cached || fetch(request)));
});
