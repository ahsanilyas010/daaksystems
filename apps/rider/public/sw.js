// Minimal app-shell cache so the rider PWA is installable and the shell
// loads offline. Pending pickup/delivery actions are queued in IndexedDB
// by the app itself (see src/lib/offlineQueue.ts) — this service worker
// only handles static asset caching, not API request queuing.
const CACHE_NAME = "daak-rider-shell-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(["/"])));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Never cache API calls — only the static app shell.
  if (url.pathname.startsWith("/api")) return;
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
          }
          return response;
        })
        .catch(() => cached);
      return cached ?? network;
    })
  );
});
