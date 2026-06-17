const CACHE = 'workout-v1';
const PRECACHE = [
  '/', '/index.html', '/styles.css', '/app.js', '/db.js',
  '/ui-log.js', '/ui-history.js', '/ui-progress.js',
  '/ui-coach.js', '/ui-settings.js', '/claude-api.js',
  '/onboarding.js', '/seed-data.js', '/manifest.json',
  '/icons/icon-192.png', '/icons/icon-512.png',
  'https://esm.sh/idb@8'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.url.includes('anthropic.com')) return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
