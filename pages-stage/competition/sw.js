const CACHE = "hema-competition-v1";
const SCOPE = "/hema-score-keeper/";
const CORE_ASSETS = [SCOPE, `${SCOPE}manifest.json`, `${SCOPE}icon.svg`];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(CACHE);
            await cache.put(SCOPE, response.clone());
          }
          return response;
        })
        .catch(async (error) => {
          const shell = await caches.match(SCOPE);
          if (shell) return shell;
          throw error;
        }),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(async (cached) => {
      if (cached) return cached;

      try {
        const response = await fetch(event.request);
        if (
          response.ok &&
          new URL(event.request.url).origin === self.location.origin
        ) {
          const cache = await caches.open(CACHE);
          await cache.put(event.request, response.clone());
        }
        return response;
      } catch (error) {
        throw error;
      }
    }),
  );
});
