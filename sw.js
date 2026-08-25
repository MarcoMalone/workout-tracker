const CACHE = 'workout-v77';
// Relative precache paths resolve against the service worker's own URL, so the
// app works both at a GitHub Pages subpath (/workout-tracker/) and at a Vercel
// domain root (/). Do not hardcode a base path here.
const PRECACHE = [
  './', 'index.html', 'styles.css', 'app.js', 'db.js',
  'ui-log.js', 'ui-history.js', 'ui-progress.js',
  'ui-coach.js', 'ui-settings.js', 'ui-help.js', 'claude-api.js',
  'template-import.js',
  'haptics.js', 'wakelock.js', 'help.js', 'ui-feedback.js', 'version.js', 'whatsnew.js', 'supersets.js',
  'onboarding.js', 'metrics.js', 'seed-data.js', 'migrate-data.js', 'rotation.js', 'variations.js', 'template-reorder.js', 'icons.js', 'strava-client.js', 'manifest.json',
  'icons/icon-192.png', 'icons/icon-512.png',
  'https://esm.sh/idb@8',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.9/dist/chart.umd.min.js'
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
  const url = new URL(e.request.url);
  if (url.hostname.includes('anthropic.com')) return;
  if (url.pathname.startsWith('/api/')) return; // never cache the Strava broker (Vercel functions)
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
