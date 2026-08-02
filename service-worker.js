importScripts('./data/motivations.js');

const CACHE_NAME = 'nclex-video-library-v10';
const APP_SHELL = [
  './',
  './index.html',
  './src/styles.css?v=10',
  './src/app.js?v=10',
  './data/library.js',
  './data/motivations.js',
  './assets/favicon.svg?v=10',
  './assets/logo.svg?v=10',
  './assets/fallback.svg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/badge-96.png',
  './manifest.webmanifest'
];

let lastMotivationIndex = -1;

function randomMotivation() {
  const messages = Array.isArray(self.NCLEX_MOTIVATIONS) ? self.NCLEX_MOTIVATIONS : [];
  if (!messages.length) return '';
  let index = Math.floor(Math.random() * messages.length);
  if (messages.length > 1 && index === lastMotivationIndex) index = (index + 1 + Math.floor(Math.random() * (messages.length - 1))) % messages.length;
  lastMotivationIndex = index;
  return messages[index];
}

async function showHourlyMotivation() {
  const body = randomMotivation();
  if (!body) return;
  await self.registration.showNotification('NCLEX Play · ਪੜ੍ਹਾਈ ਦਾ ਵੇਲਾ', {
    body,
    icon: './assets/icon-192.png',
    badge: './assets/badge-96.png',
    tag: 'nclex-hourly-motivation',
    renotify: true,
    requireInteraction: false,
    silent: false,
    vibrate: [70, 45, 35],
    data: { url: './index.html#home', motivation: true }
  });
}

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))),
      self.clients.claim()
    ])
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request).then(response => {
        if (response && response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
        return response;
      }).catch(() => cached);
      return cached || network;
    })
  );
});

self.addEventListener('periodicsync', event => {
  if (event.tag === 'nclex-hourly-motivation') event.waitUntil(showHourlyMotivation());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SHOW_MOTIVATION') event.waitUntil(showHourlyMotivation());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification.data && event.notification.data.url ? event.notification.data.url : './index.html#home';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow ? self.clients.openWindow(target) : undefined;
    })
  );
});
