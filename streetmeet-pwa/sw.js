const CACHE_NAME = 'streetmeet-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/pages/community-dc.html',
  '/pages/community-wa.html',
  '/pages/community-md.html',
  '/pages/contact.html',
  '/pages/profile.html',
  '/pages/events.html',
  '/pages/chat.html',
  '/pages/admin.html',
  '/css/main.css',
  '/js/app.js',
  '/js/auth.js',
  '/js/chat.js',
  '/manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        return res;
      }).catch(() => caches.match('/index.html'));
    })
  );
});
