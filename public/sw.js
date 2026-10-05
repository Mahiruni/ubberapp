const VERSION = "nexride-brand-v1";
const CORE_CACHE = VERSION + "-core";
const RUNTIME_CACHE = VERSION + "-runtime";
const CORE_ASSETS = [
  "/offline.html",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/favicon.ico",
  "/favicon-32x32.png",
  "/apple-touch-icon.png",
  "/brand/nexride-mark.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/fonts/noto-sans-ethiopic-400.woff2",
  "/fonts/noto-sans-ethiopic-700.woff2"
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
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("nexride-brand-") && key !== CORE_CACHE && key !== RUNTIME_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () =>
          (await caches.match(request)) ||
          (await caches.match("/")) ||
          (await caches.match("/offline.html"))
        )
    );
    return;
  }

  const cacheable =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/brand/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/fonts/") ||
    url.pathname === "/favicon.svg" ||
    url.pathname === "/favicon.ico" ||
    url.pathname.startsWith("/favicon-") ||
    url.pathname === "/apple-touch-icon.png" ||
    url.pathname === "/manifest.webmanifest";

  if (!cacheable) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const update = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || update;
    })
  );
});
