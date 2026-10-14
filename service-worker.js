const CACHE_NAME = "smash-bingo-v13";
const APP_FILES = [
  "./",
  "index.html",
  "pool.html",
  "styles.css",
  "board.js",
  "leaderboard-store.js",
  "pool.js",
  "pool-store.js",
  "firebase-config.js",
  "manifest.webmanifest",
  "icon.svg",
  "assets/smash-ultimate-tier-list-2026.png",
  "assets/triple-bingo.mp3",
  "assets/Double-Bingo.mp3",
  "assets/5-bingo.mp3",
  "assets/Alle%20Voll.mp3",
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

  if (requestUrl.pathname.toLowerCase().endsWith(".mp3")) {
    event.respondWith(serveAudio(event.request));
    return;
  }

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
  if (response && response.ok && response.status !== 206) {
    const cache = await caches.open(CACHE_NAME);
    try {
      await cache.put(request, response.clone());
    } catch (error) {
      // Cache failures must not block successful network responses.
      console.warn("Antwort konnte nicht zwischengespeichert werden:", error);
    }
  }
  return response;
}

async function serveAudio(request) {
  // Media players request byte ranges. Only slice complete cached responses.
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request.url);
  if (!cached || cached.status !== 200) return cacheFromNetwork(request);

  const range = request.headers.get("Range");
  if (!range) return cached;
  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!match || (!match[1] && !match[2])) return fetch(request);

  const data = await cached.arrayBuffer();
  const size = data.byteLength;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  const headers = new Headers(cached.headers);
  headers.set("Accept-Ranges", "bytes");
  headers.delete("Content-Encoding");
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) {
    headers.set("Content-Range", "bytes */" + size);
    headers.set("Content-Length", "0");
    return new Response(null, { status: 416, headers });
  }
  headers.set("Content-Range", "bytes " + start + "-" + end + "/" + size);
  headers.set("Content-Length", String(end - start + 1));
  return new Response(data.slice(start, end + 1), { status: 206, headers });
}
