/**
 * Service worker: versioned cache-first shell. Precaches the static
 * app shell on install, serves it offline afterwards, prunes old
 * versions on activate. Network calls (image generation) are never
 * intercepted; nothing here logs or reads user data.
 */

'use strict';

const CACHE_NAME = 'chrono-shell-v1';

const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/tokens.css',
  './css/base.css',
  './css/components.css',
  './css/views.css',
  './fonts/inter-var.woff2',
  './fonts/jetbrains-mono-var.woff2',
  './icons/app-icon.svg',
  './icons/app-icon-192.png',
  './icons/app-icon-512.png',
  './icons/app-icon-maskable-192.png',
  './icons/app-icon-maskable-512.png',
  './js/config.js',
  './js/state.js',
  './js/router.js',
  './js/main.js',
  './js/lib/dates.js',
  './js/lib/timezones.js',
  './js/lib/recurrence.js',
  './js/lib/validate.js',
  './js/lib/color.js',
  './js/lib/uuid.js',
  './js/lib/genai.js',
  './js/lib/imageQueue.js',
  './js/lib/backup.js',
  './js/data/db.js',
  './js/data/events.js',
  './js/data/images.js',
  './js/data/settings.js',
  './js/ui/header.js',
  './js/ui/monthView.js',
  './js/ui/weekView.js',
  './js/ui/dayView.js',
  './js/ui/settingsView.js',
  './js/ui/picker.js',
  './js/ui/sheet.js',
  './js/ui/eventSheet.js',
  './js/ui/eventDetail.js',
  './js/ui/agendaCard.js',
  './js/ui/toast.js',
  './js/ui/refresh.js',
  './js/ui/gestures.js',
  './js/ui/imageJobs.js',
  './js/ui/serviceWorker.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
      .catch((error) => {
        console.error('sw: precache failed', error);
        return Promise.resolve();
      }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Cache-first for same-origin assets; fall back to network on miss
  // (never cache runtime misses).
  event.respondWith(
    caches.match(request, { ignoreSearch: request.mode !== 'navigation' ? true : false }).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response.ok && url.pathname !== '/' ) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          if (request.mode === 'navigation') {
            return caches.match('./index.html');
          }
          return new Response('', { status: 504, statusText: 'offline' });
        });
    }),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
