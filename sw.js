const CACHE = 'workout-v38';
// Relative precache paths resolve against the service worker's own URL, so the
// app works both at a GitHub Pages subpath (/workout-tracker/) and at a Vercel
// domain root (/). Do not hardcode a base path here.
const PRECACHE = [
  './', 'index.html', 'styles.css', 'app.js', 'db.js',
  'ui-log.js', 'ui-history.js', 'ui-progress.js',
  'ui-coach.js', 'ui-settings.js', 'ui-help.js', 'claude-api.js',
  'template-import.js',
  'haptics.js', 'wakelock.js',
  'onboarding.js', 'metrics.js', 'seed-data.js', 'migrate-data.js', 'manifest.json',
  'icons/icon-192.png', 'icons/icon-512.png',
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
