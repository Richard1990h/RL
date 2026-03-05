const SW_VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE_NAME = `rally-live-shell-${SW_VERSION}`;
const APP_SHELL = [
  "/",
  "/home",
  "/settings",
  "/upload-stream",
  "/messages",
  "/offline",
  "/manifest.json",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim()).then(() => {
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => client.postMessage({ type: "SW_ACTIVATED", version: SW_VERSION }));
      });
    })
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "FORCE_REFRESH") {
    caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))).then(() => {
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => client.postMessage("CACHE_CLEARED"));
      });
    });
  }

  if (event.data === "ACTIVATE_PENDING") {
    self.skipWaiting();
  }
});

function isApiRequest(requestUrl) {
  return requestUrl.pathname.startsWith("/api/");
}

function isNavigationRequest(request) {
  return request.mode === "navigate";
}

function isAdminPath(requestUrl) {
  return requestUrl.pathname === "/admin" || requestUrl.pathname.startsWith("/admin/");
}

function isNextStaticAsset(requestUrl) {
  return requestUrl.pathname.startsWith("/_next/static/");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (isApiRequest(url)) {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(JSON.stringify({ error: "Offline" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    return;
  }

  if (isNavigationRequest(request)) {
    if (isAdminPath(url)) {
      event.respondWith(
        fetch(request).catch(() => new Response("Admin requires a secure online connection.", { status: 503 }))
      );
      return;
    }

    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          return caches.match("/home");
        })
    );
    return;
  }

  // Always prefer network for JS/CSS runtime chunks so stale cached bundles
  // cannot pin old app code on mobile.
  if (isNextStaticAsset(url)) {
    event.respondWith(
      fetch(request, { cache: "no-store" })
        .then((response) => response)
        .catch(() => caches.match(request).then((cached) => cached || new Response("Offline", { status: 503 })))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response.ok && response.type !== "opaque") {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => new Response("Offline", { status: 503 }));
    })
  );
});
