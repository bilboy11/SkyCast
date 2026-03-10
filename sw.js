const CACHE_NAME = 'skycast-v1';
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './icon-192x192.png',
  './icon-512x512.png'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache.map(url => new Request(url, { cache: 'reload' }))))
      .catch(err => console.error('Cache installation failed:', err))
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(cacheNames
        .filter(name => name !== CACHE_NAME)
        .map(name => (console.log('Deleting old cache:', name), caches.delete(name)))
      )
    )
  );
  return self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip API requests (they should always go to network)
  if (event.request.url.includes('api.openweathermap.org')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(response =>
      response || fetch(event.request).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, res.clone()));
        }
        return res;
      }).catch(() => event.request.mode === 'navigate' ? caches.match('./index.html') : undefined)
    )
  );
});

// Handle background sync
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    event.waitUntil(Promise.resolve(console.log('Background sync triggered')));
  }
});

// Handle push notifications
self.addEventListener('push', (event) => {
  event.waitUntil(
    self.registration.showNotification('SkyCast', {
      body: event.data?.text() || 'New weather update available',
      icon: '/icon-192x192.png',
      badge: '/icon-96x96.png',
      vibrate: [200, 100, 200],
      tag: 'weather-update'
    })
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow('./'));
});
