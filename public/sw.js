const VERSION = "biloo-fast-navigation-20261021-v1";
const CORE_CACHE = VERSION + "-core";
const RUNTIME_CACHE = VERSION + "-runtime";
// Keep install lightweight: large images, fonts, and audio cache on first demand.
const CORE_ASSETS = [
  "/offline.html",
  "/manifest.webmanifest",
  "/driver.webmanifest",
  "/brand/biloo-mark.svg",
  "/brand/biloo-driver-get-started.webp",
  "/brand/biloo-rider-get-started.jpg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CORE_CACHE)
      .then((cache) => Promise.allSettled(CORE_ASSETS.map((asset) => cache.add(asset))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => (key.startsWith("nexride-") || key.startsWith("biloo-")) && key !== CORE_CACHE && key !== RUNTIME_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    // Never store user-specific SSR HTML or show a stale authenticated shell.
    // The offline fallback contains no private account, trip, or payment data.
    event.respondWith(fetch(request).catch(async () =>
      (await caches.match("/offline.html")) || Response.error()
    ));
    return;
  }

  const cacheable =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/brand/") ||
    url.pathname === "/brand/biloo-driver-get-started.webp" ||
    url.pathname === "/brand/biloo-rider-get-started.jpg" ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/fonts/") ||
    url.pathname.startsWith("/audio/") ||
    url.pathname === "/favicon.svg" ||
    url.pathname === "/favicon.ico" ||
    url.pathname.startsWith("/favicon-") ||
    url.pathname.startsWith("/driver-favicon") ||
    url.pathname === "/driver-apple-touch-icon.png" ||
    url.pathname === "/apple-touch-icon.png" ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/driver.webmanifest";

  if (!cacheable) return;

  // Immutable build assets are content-hashed; avoid redundant mobile requests.
  const immutable = url.pathname.startsWith("/_next/static/");
  event.respondWith(caches.match(request).then((cached) => {
    if (cached && immutable) return cached;
    const update = fetch(request).then(response => {
      if (response.ok && response.type === "basic" && !response.headers.has("Set-Cookie")) {
        const copy = response.clone();
        event.waitUntil(caches.open(RUNTIME_CACHE).then(cache => cache.put(request, copy)).catch(() => {}));
      }
      return response;
    }).catch(() => cached || Response.error());
    if (cached) {
      event.waitUntil(update.then(() => {}).catch(() => {}));
      return cached;
    }
    return update;
  }));
});


self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }

  const title = typeof data.title === "string" && data.title ? data.title : "Biloo";
  const body = typeof data.body === "string" ? data.body : "";
  const url = typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/";
  const tag = typeof data.tag === "string" ? data.tag : undefined;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      icon: url.startsWith("/driver")
        ? "/icons/driver-icon-192.png" : "/icons/icon-192.png",
      badge: url.startsWith("/driver")
        ? "/driver-favicon-32x32.png" : "/favicon-32x32.png",
      data: { url },
      renotify: false,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow ? self.clients.openWindow(target) : undefined;
    })
  );
});
