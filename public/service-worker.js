const CACHE_NAME = "excelcalc-cache-v1";
const BASE_PATH = self.location.pathname.replace(/service-worker\.js$/, "");
const PRECACHE_URLS = [
  "",
  "index.html",
  "styles.css",
  "app.js",
  "site.webmanifest",
  "assets/brandons_calculator_patch_1_120px.png",
].map((path) => new URL(path, self.registration.scope).toString());

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
          return undefined;
        })
      )
    )
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    if (event.request.method !== "GET") {
      return fetch(event.request);
    }
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (
          !networkResponse ||
          networkResponse.status !== 200 ||
          networkResponse.type !== 'basic'
        ) {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      });
    })
  );
});
