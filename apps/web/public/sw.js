/**
 * Static assets only.
 *
 * Pages and React Server Component payloads are NEVER cached, and neither is
 * anything under /api/. A server-rendered page carries the figures its viewer
 * was allowed to see at render time: cached, it outlives a switch to Private,
 * and on a shared tablet it shows the previous member's finances to the next.
 *
 * What is left is content-hashed build output and the icons — bytes that never
 * change for a given URL, so serving them from cache cannot show anything stale.
 */

// Bumping the name purges every older cache on activate, including v1, which
// held whole pages.
const CACHE = "family-hub-static-v2";
const PRECACHE = ["/manifest.webmanifest", "/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      // Take over from a worker that caches pages now, not after every tab closes.
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

function isImmutable(url) {
  return url.pathname.startsWith("/_next/static/") || PRECACHE.includes(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !isImmutable(url)) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
