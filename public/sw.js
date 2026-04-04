const CACHE_NAME = 'dispatch-one-cache-v2';
const CORE_ASSETS = ['/', '/index.html', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        }).catch(() => cached);
      })
    );
  }
});

// ─── PUSH : reçu même app fermée / GPS ouvert ───────────────────
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Nouvelle course 📦', body: event.data?.text() || '' };
  }

  const title = data.title || 'Nouvelle course 📦';
  const options = {
    body: data.body || 'Une nouvelle mission vous a été assignée.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: 'new-mission',
    renotify: true,
    requireInteraction: true,   // ← reste visible jusqu'à interaction
    vibrate: [300, 100, 300, 100, 300],
    data: { url: data.url || '/missions' },
    actions: [
      { action: 'open', title: '📦 Voir la mission' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ─── CLICK sur notification ──────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/missions';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Si l'app est déjà ouverte → focus + navigate
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus();
          client.postMessage({ type: 'NAVIGATE', url });
          return;
        }
      }
      // Sinon → ouvre l'app
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
