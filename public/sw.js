/**
 * Service Worker - PWA install + smart caching
 * 
 * Strategy:
 * - Navigation requests: Network-first (avoids blank screens from stale HTML)
 * - Static assets (JS/CSS/images): Cache-first (fast loads)
 * - API calls (Firebase, etc.): Network-only (never cache)
 */

const CACHE_NAME = 'bluebell-v5';
const BASE = '/bluebell-app/';

// Assets to pre-cache on install
const PRECACHE_ASSETS = [
  BASE,
  BASE + 'manifest.json',
  BASE + 'logo-gold.png',
  BASE + 'logo-purple-horizontal.svg',
  BASE + 'icons/icon-192.png',
  BASE + 'icons/icon-512.png',
  BASE + 'favicon.svg',
];

// Domains/paths that should NEVER be cached
const NEVER_CACHE = [
  'firestore.googleapis.com',
  'firebase',
  'identitytoolkit',
  'securetoken',
  'googleapis.com/identitytoolkit',
  'accounts.google.com',
  'nominatim',
  'chrome-extension',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .catch((err) => console.log('Precache failed:', err))
  );
  // Activate immediately without waiting for old SW to finish
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  // Take control of all open clients immediately
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // Never cache API/auth requests
  if (NEVER_CACHE.some((domain) => request.url.includes(domain))) return;

  // Navigation requests (HTML pages): Network-first
  // This prevents blank screens when a new version is deployed
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache the fresh HTML for offline use
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => {
          // Offline: serve cached version or fallback to index.html
          return caches.match(request).then((cached) => {
            return cached || caches.match(BASE);
          });
        })
    );
    return;
  }

  // Static assets (JS, CSS, images, fonts): Cache-first
  if (
    request.url.match(/\.(js|css|png|jpg|jpeg|svg|gif|woff2?|ttf|eot|ico)(\?.*)?$/) ||
    request.url.includes('/assets/')
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      }).catch(() => caches.match(BASE))
    );
    return;
  }

  // Everything else: Network-first with cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});

// Listen for skip-waiting message from the app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
