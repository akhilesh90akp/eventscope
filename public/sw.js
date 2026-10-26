/**
 * Service Worker - PWA install + smart caching
 * 
 * Strategy:
 * - Navigation requests: Network-first (avoids blank screens from stale HTML)
 * - Static assets (JS/CSS/images): Cache-first (fast loads)
 * - API calls (Firebase, etc.): Network-only (never cache)
 *
 * Also shows owners' event reminders (web push via Firebase Cloud Messaging,
 * sent each morning by tools/drive-backup/Reminders.gs) — even when the app
 * is closed, and on the iPhone lock screen for Home Screen apps.
 */

const CACHE_NAME = 'eventscope-v6'; // bump to drop old cached files (e.g. icons)
const BASE = '/';

// Assets to pre-cache on install
const PRECACHE_ASSETS = [
  BASE,
  BASE + 'manifest.json',
  BASE + 'eventscope-logo.svg',
  BASE + 'eventscope-logo-horizontal.svg',
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

  // Videos (login background) stream with Range requests — let the browser handle them
  if (request.headers.has('range') || /\.(mp4|webm)(\?.*)?$/.test(request.url)) return;

  // Navigation requests (HTML pages): Network-first, but don't hang on a
  // weak mobile signal — after 3 s serve the saved copy (if any) and let the
  // download finish in the background for next time. A fresh deploy still
  // shows up straight away whenever the network is reasonable.
  if (request.mode === 'navigate') {
    const network = fetch(request).then((response) => {
      if (response.ok) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(BASE, clone));
      }
      return response;
    });
    const saved = () => caches.match(request).then((c) => c || caches.match(BASE));
    const slow = new Promise((resolve) => setTimeout(resolve, 3000)).then(saved);
    event.respondWith(
      Promise.race([network.catch(saved), slow.then((c) => c || network)])
        .then((r) => r || saved())
    );
    event.waitUntil(network.catch(() => {}));
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

// ============================================================
// PUSH REMINDERS
// ============================================================

// A reminder arrives (data message from FCM): always show it — browsers
// (and iPhones) require every push to display a notification.
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  const d = payload.data || payload.notification || {};
  const title = d.title || 'EventScope';
  event.waitUntil(self.registration.showNotification(title, {
    body: d.body || '',
    icon: BASE + 'icons/icon-192.png',
    badge: BASE + 'icons/icon-192.png',
    tag: d.tag || undefined,           // same event → replaces, not stacks
    data: { url: d.url || BASE },
  }));
});

// Tapping the notification opens (or focuses) the app on that event
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || BASE, self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const mine = wins.find((w) => w.url.startsWith(self.location.origin + BASE));
    if (mine) { await mine.focus(); return mine.navigate(url); }
    return self.clients.openWindow(url);
  })());
});
