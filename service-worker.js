// =========================================================
// service-worker.js - Faster App
// Kaam: (1) offline/fast loading ke liye basic caching
//       (2) push notifications receive + dikhana (app band ho tab bhi)
// =========================================================

const CACHE_NAME = 'faster-shell-v1';
const SHELL_FILES = [
  './index.html',
  './home.html',
  './home.css',
  './home.js',
  './contacts.html',
  './contacts.css',
  './contacts.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// ---- Install: app-shell files cache karo ----
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(SHELL_FILES).catch(err => {
        console.warn('Kuch shell files cache nahi ho payi (theek hai, baaki kaam karega):', err);
      });
    })
  );
  self.skipWaiting();
});

// ---- Activate: purani cache versions saaf karo ----
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ---- Fetch: pehle network try karo, fail ho to cache se do (data hamesha fresh chahiye) ----
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// ---- PUSH NOTIFICATION receive karo (app band/background ho tab bhi yeh chalta hai) ----
self.addEventListener('push', (event) => {
  let data = { title: 'Faster', body: 'Naya message aaya hai', url: './contacts.html' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) { /* plain text ho to default hi use karo */ }

  const options = {
    body: data.body,
    icon: './icon-192.png',
    badge: './icon-192.png',
    sound: './custom-ringtone.mp3', // Android notification channel ke through respect hota hai (TWA build)
    vibrate: [200, 100, 200],
    data: { url: data.url },
    tag: data.tag || 'faster-message'
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// ---- Notification pe tap karne pe sahi page kholo ----
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || './contacts.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl.replace('./', '')) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
