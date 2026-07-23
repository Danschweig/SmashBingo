const CACHE_NAME = "smash-bingo-v6";
const APP_FILES = [
  "./",
  "index.html",
  "pool.html",
  "styles.css",
  "board.js",
  "pool.js",
  "pool-store.js",
  "firebase-config.js",
  "manifest.webmanifest",
  "icon.svg",
  "assets/smash-ultimate-tier-list-2026.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);
  if (event.request.method !== "GET" || requestUrl.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(networkFirst(event.request, "./"));
    return;
  }

  if (["script", "style", "worker"].includes(event.request.destination)) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || cacheFromNetwork(event.request)),
  );
});

async function networkFirst(request, fallbackUrl) {
  try {
    return await cacheFromNetwork(request);
  } catch {
    const fallback = (await caches.match(request)) || (fallbackUrl ? await caches.match(fallbackUrl) : null);
    return fallback || new Response("Offline", { status: 503, statusText: "Offline" });
  }
}

async function cacheFromNetwork(request) {
  const response = await fetch(request);
  if (response && response.ok) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}
