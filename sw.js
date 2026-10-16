'use strict';
/** Service worker placeholder — versioned cache-first shell lands in milestone 10. */
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(Promise.resolve());
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
