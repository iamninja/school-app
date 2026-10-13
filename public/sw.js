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
// visit.
//
// It also shows push notifications (lib/push/notify.ts sends them) and opens
// the right portal page when one is tapped.

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

// ---- Push notifications ----

/** Only ever open pages of this site - never a URL from the payload's host. */
function sameOriginPath(url) {
  try {
    const target = new URL(url || "/start", self.location.origin);
    return target.origin === self.location.origin ? target.pathname + target.search : "/start";
  } catch {
    return "/start";
  }
}

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "Modus";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      tag: payload.tag || undefined,
      lang: "el",
      data: { url: sameOriginPath(payload.url) },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = sameOriginPath(event.notification.data && event.notification.data.url);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        if ("navigate" in open) return open.navigate(path);
        return undefined;
      }
      return self.clients.openWindow(path);
    })(),
  );
});

// The browser replaced this device's subscription (keys rotated, push
// service change). Subscribe again and tell the server, or this device would
// silently stop getting notifications. The session cookie identifies the
// user; the server only swaps a subscription that user already owns.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const oldEndpoint = event.oldSubscription ? event.oldSubscription.endpoint : null;
      let subscription = event.newSubscription;
      if (!subscription) {
        let key =
          event.oldSubscription &&
          event.oldSubscription.options &&
          event.oldSubscription.options.applicationServerKey;
        if (!key) {
          const response = await fetch("/api/push/resubscribe", { credentials: "same-origin" });
          if (!response.ok) return;
          key = (await response.json()).publicKey;
        }
        if (!key) return;
        subscription = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        });
      }
      await fetch("/api/push/resubscribe", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldEndpoint, subscription: subscription.toJSON() }),
      });
    })(),
  );
});
