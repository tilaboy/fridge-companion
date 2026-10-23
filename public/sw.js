/* Fridge Door Companion — service worker (roadmap M0: installable + offline).
 *
 * Strategy:
 *   - navigations: network first, cache fallback (so a fresh deploy is picked
 *     up on the next load, and the app still opens with no network).
 *   - other same-origin GETs: cache first, refreshed in the background
 *     (stale-while-revalidate), so assets never pin a user to an old build
 *     forever as long as this file is re-checked.
 *   - cross-origin requests: never touched. The app makes none.
 *
 * Bump CACHE when the shell list changes, so the old entries are dropped on
 * activate. The build stamps both the list and the name: `tools/postbuild.mjs`
 * replaces `__BUILD_HASH__` and the asset placeholder with the hashed URLs
 * Vite actually emitted. */
'use strict';

var CACHE = 'fdc-shell-__BUILD_HASH__';

var SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './privacy.html',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  /*__SHELL_ASSETS__*/
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function (cache) { return cache.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (key) {
          return key === CACHE ? null : caches.delete(key);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;

  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(function (response) {
          if (response && response.ok) {
            var copy = response.clone();
            caches.open(CACHE).then(function (cache) { cache.put(request, copy); });
          }
          return response;
        })
        .catch(function () {
          return caches.match(request).then(function (hit) {
            return hit || caches.match('./index.html');
          });
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(function (cached) {
      var network = fetch(request)
        .then(function (response) {
          if (response && response.ok && response.type === 'basic') {
            var copy = response.clone();
            caches.open(CACHE).then(function (cache) { cache.put(request, copy); });
          }
          return response;
        })
        .catch(function () { return cached; });
      return cached || network;
    })
  );
});
