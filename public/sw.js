/* Service Worker pour les notifications push UNIQUEMENT.
   Pas de cache des requêtes : un chauffeur doit toujours recevoir la
   dernière version du code (JS/CSS), jamais une version périmée servie
   depuis le cache du navigateur. */

// Installation du Service Worker
self.addEventListener('install', (event) => {
  console.log('[SW] Installed');
  self.skipWaiting();
});

// Activation du Service Worker
self.addEventListener('activate', (event) => {
  console.log('[SW] Activated');
  event.waitUntil(clients.claim());
});

// Écoute les messages push
self.addEventListener('push', (event) => {
  console.log('[SW] Push Received:', event.data?.text());

  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    console.error('[SW] Error parsing push data:', e);
  }

  const title = data.title || '🔔 Nouvelle Mission';
  const options = {
    body: data.body || 'Une nouvelle mission a été assignée.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    vibrate: [200, 100, 200],
    tag: 'new-mission',
    requireInteraction: true,
    data: {
      orderId: data.orderId,
      driverId: data.driverId
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Écoute les clics sur les notifications
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.notification.tag);
  event.notification.close();

  const orderId = event.notification.data?.orderId;
  const urlToOpen = orderId ? `/missions/${orderId}` : '/missions';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (let i = 0; i < clientList.length; i++) {
          const client = clientList[i];
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

// Volontairement PAS de handler 'fetch' : ce service worker ne sert qu'aux
// notifications push. Sans handler fetch, le navigateur va toujours chercher
// les fichiers sur le réseau (donc toujours la dernière version), et
// respecte le cache HTTP normal du serveur.

console.log('[SW] Service Worker script loaded');
