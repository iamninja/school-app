// Modus service worker (installable app / PWA).
//
// Deliberately minimal: when a PAGE navigation fails because the phone is
// offline, it shows public/offline.html instead of the browser's error page.
// It caches nothing else - no pages, no data, no API responses. The portals
// show personal and financial information, and a stale cached copy would be
// both wrong and a privacy risk on a shared phone. Server Actions, form posts
// and every non-navigation request are left completely alone.
//
// Registered by components/register-service-worker.tsx (production only).
// Served with no-cache headers (next.config.ts) so updates apply on the next
// visit. The notifications phase will add its push handlers here.

const OFFLINE_CACHE = "modus-offline-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" }))),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches from any older version of this worker.
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== OFFLINE_CACHE).map((key) => caches.delete(key)),
      );
      // Lets the browser start the page request while the worker boots, so
      // having a worker never makes navigation slower.
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.mode !== "navigate" || request.method !== "GET") {
    return; // not a page load - the browser handles it as if we weren't here
  }

  event.respondWith(
    (async () => {
      try {
        const preloaded = await event.preloadResponse;
        if (preloaded) return preloaded;
        return await fetch(request);
      } catch {
        // Only reached when the network itself failed (offline), never for
        // an HTTP error page from the server.
        const cache = await caches.open(OFFLINE_CACHE);
        const offline = await cache.match(OFFLINE_URL);
        return offline ?? Response.error();
      }
    })(),
  );
});
