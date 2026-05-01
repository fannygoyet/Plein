/* Service worker — stratégie network-first pour le shell de l'app
 * (HTML/JS/CSS), cache-first pour les icônes. Les mises à jour
 * atteignent toujours l'utilisateur en ligne, et l'app reste
 * fonctionnelle hors-ligne avec la dernière version cachée.
 */
const VERSION = "v5-2026-05-01";
const CACHE = `plein-${VERSION}`;
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "https://cdn.jsdelivr.net/npm/chart.js@4.4.6/dist/chart.umd.min.js",
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(APP_SHELL).catch(() => null))
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
    const list = await self.clients.matchAll({ type: "window" });
    list.forEach((c) => c.postMessage({ type: "SW_UPDATED", version: VERSION }));
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;

  // Network-first pour le shell : HTML, JS, CSS, JSON, racine.
  const isShell = sameOrigin && (
    url.pathname === "/" ||
    url.pathname.endsWith("/") ||
    /\.(html|js|css|json)$/.test(url.pathname)
  );

  if (isShell) {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: "no-store" });
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone()).catch(() => null);
        return fresh;
      } catch {
        const cached = await caches.match(req);
        return cached || caches.match("./index.html");
      }
    })());
    return;
  }

  // Cache-first pour les icônes / fonts / CDN (rarement modifiés).
  e.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      if (sameOrigin || url.host.includes("jsdelivr.net")) {
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone()).catch(() => null);
      }
      return fresh;
    } catch {
      return caches.match("./index.html");
    }
  })());
});
