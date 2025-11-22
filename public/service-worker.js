const CACHE_NAME = "excelcalc-cache-v5";
const BASE_PATH = self.location.pathname.replace(/service-worker\.js$/, "");
const PRECACHE_URLS = [
  "",
  "index.html",
  "site.webmanifest",
  "assets/brandons_calculator_patch_1_120px.png",
].map((path) => new URL(path, self.registration.scope).toString());

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
});

self.addEventListener("activate", (event) => {
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

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);

  // Skip service worker for development mode (Vite dev server)
  // Don't cache @vite URLs, localhost:5173, or HMR requests
  if (
    requestUrl.pathname.includes("@vite") ||
    requestUrl.pathname.includes("node_modules") ||
    requestUrl.hostname === "localhost" ||
    requestUrl.search.includes("t=") // Vite timestamp query param
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request)
        .then((networkResponse) => {
          if (
            !networkResponse ||
            networkResponse.status !== 200 ||
            networkResponse.type !== "basic"
          ) {
            return networkResponse;
          }

          if (requestUrl.protocol === "chrome-extension:") {
            return networkResponse;
          }

          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache).catch(() => {
              /* ignore cache put errors */
            });
          });

          return networkResponse;
        })
        .catch((error) => {
          console.warn("[service-worker] Network fetch failed", error);
          throw error;
        });
    })
  );
});
