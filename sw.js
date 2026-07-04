const CACHE = 'workout-v25';
const BASE = '/workout-tracker';
const PRECACHE = [
  BASE + '/', BASE + '/index.html', BASE + '/styles.css', BASE + '/app.js', BASE + '/db.js',
  BASE + '/ui-log.js', BASE + '/ui-history.js', BASE + '/ui-progress.js',
  BASE + '/ui-coach.js', BASE + '/ui-settings.js', BASE + '/claude-api.js',
  BASE + '/onboarding.js', BASE + '/metrics.js', BASE + '/seed-data.js', BASE + '/migrate-data.js', BASE + '/manifest.json',
  BASE + '/icons/icon-192.png', BASE + '/icons/icon-512.png',
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
