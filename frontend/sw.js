const CACHE_NAME = "goodwill-v4";
const APP_SHELL = [
  "/",
  "/index.html",
  "/css/style.css",
  "/js/config.js",
  "/js/api.js",
  "/js/ui.js",
  "/js/nav.js",
  "/js/yamaps.js",
  "/manifest.json",
  "/logo.png",
  "/favicon.ico",
  "/assets/satellite.webp",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || event.request.url.includes("/api/")) return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).catch(() => cached))
  );
});

/* Web Push: показываем системное уведомление, даже если ни одна вкладка сайта не открыта. */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "GoodWill", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "GoodWill";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: data.url || "/notifications" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/notifications";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsArr) => {
      const existing = clientsArr.find((c) => {
        try {
          return new URL(c.url).pathname === url;
        } catch (e) {
          return false;
        }
      });
      if (existing) return existing.focus();
      const client = clientsArr[0];
      if (client && "navigate" in client) return client.focus().then(() => client.navigate(url));
      return self.clients.openWindow(url);
    })
  );
});
