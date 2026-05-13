// tokmato service worker — app-shell caching + Web Push delivery.
//
// QStash → /api/push/fire → web-push (VAPID) → push provider → here.
// Push handling stays independent from the fetch cache below.

const STATIC_CACHE = "tokmato-static-v1";
const PAGE_CACHE = "tokmato-pages-v1";
const STATIC_PATHS = [
  "/",
  "/home",
  "/journey",
  "/redeem",
  "/kanban",
  "/settings",
  "/manifest.webmanifest",
  "/icon.png",
  "/apple-icon.png",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

function isSameOrigin(request) {
  return new URL(request.url).origin === self.location.origin;
}

function isNextStatic(request) {
  return new URL(request.url).pathname.startsWith("/_next/static/");
}

function isPublicAsset(request) {
  const pathname = new URL(request.url).pathname;
  return STATIC_PATHS.includes(pathname);
}

function shouldCacheResponse(response) {
  return response && response.ok && response.type === "basic";
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (shouldCacheResponse(response)) {
    await cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fresh = fetch(request)
    .then(async (response) => {
      if (shouldCacheResponse(response)) {
        await cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);
  return cached || (await fresh) || Response.error();
}

async function warmStaticCache() {
  const cache = await caches.open(STATIC_CACHE);
  await Promise.all(
    STATIC_PATHS.map(async (path) => {
      try {
        const response = await fetch(path);
        if (shouldCacheResponse(response)) await cache.put(path, response);
      } catch {}
    })
  );
}

self.addEventListener("install", (event) => {
  // Take over old SWs immediately so a hot-deployed version starts
  // delivering pushes without a manual reload.
  event.waitUntil(
    (async () => {
      await warmStaticCache();
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([STATIC_CACHE, PAGE_CACHE]);
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => (keep.has(key) ? undefined : caches.delete(key)))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || !isSameOrigin(request)) return;

  const { pathname } = new URL(request.url);
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/data/") ||
    pathname.includes("__next_action")
  ) {
    return;
  }

  if (isNextStatic(request)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(staleWhileRevalidate(request, PAGE_CACHE));
    return;
  }

  if (isPublicAsset(request)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
  }
});

self.addEventListener("push", (event) => {
  let payload = { title: "tokmato", body: "" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // Non-JSON payload — fall back to text body.
    try {
      payload.body = event.data ? event.data.text() : "";
    } catch {}
  }
  const { title, body, tag } = payload;
  event.waitUntil(
    self.registration.showNotification(title || "tokmato", {
      body: body || "",
      icon: "/icon.png",
      badge: "/icon.png",
      // tag collapses successive notifications onto the same slot so
      // a backgrounded user with three boundary alerts sees one, not
      // a stack. Caller can override.
      tag: tag || "tokmato-pomodoro",
      // Re-vibrate / re-alert when a same-tag push lands.
      renotify: true,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = "/home";
  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Prefer focusing an existing tokmato tab over opening a new one.
      for (const client of allClients) {
        if ("focus" in client) {
          try {
            await client.focus();
            if ("navigate" in client) await client.navigate(target);
            return;
          } catch {}
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(target);
    })()
  );
});
