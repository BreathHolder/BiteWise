// BiteWise Service Worker
// Provides offline capability and asset caching

const CACHE_NAME = 'bitewise-v9';
const STATIC_ASSETS = [
  '/BiteWise/',
  '/BiteWise/index.html',
  '/BiteWise/css/app.css',
  '/BiteWise/js/app.js',
  '/BiteWise/js/db.js',
  '/BiteWise/js/onboarding.js',
  '/BiteWise/js/food.js',
  '/BiteWise/js/log.js',
  '/BiteWise/js/dashboard.js',
  '/BiteWise/js/settings.js',
  '/BiteWise/manifest.json',
  'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,600;0,9..144,700;1,9..144,400&family=DM+Sans:wght@300;400;500;600&display=swap'
];

// Install: cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: cache-first for static assets, network-first for API calls
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Always go to network for USDA API and OAuth endpoints
  if (url.hostname.includes('usda.gov') ||
      url.hostname.includes('googleapis.com') ||
      url.hostname.includes('microsoftonline.com') ||
      url.hostname.includes('graph.microsoft.com')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Cache-first strategy for static assets
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
