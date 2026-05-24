const CACHE_VERSION = "20260522-mobile-ux-v2";
const CACHE_NAME = "halisaha-static--profilefix" + CACHE_VERSION;

const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/style.css",
  "/manifest.json",
  "/js/firebase.js",
  "/js/config.js",
  "/js/ui.js",
  "/js/auth.js",
  "/js/dashboard.js",
  "/js/players.js",
  "/js/stats.js",
  "/js/kadro.js",
  "/js/pro-kadro.js",
  "/js/admin.js",
  "/js/advanced.js",
  "/js/advanced-v2.js",
  "/js/main.js",
  "/img/profil.png",
  "/img/kart.png",
  "/img/arkaplan.jpg",
  "/img/saha.jpg",
  "/img/sahayatay.jpg",
  "/img/Kırmızı.png",
  "/img/Mavi.png"
];

const isStaticRequest = (request) => {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  return /\.(html|css|js|png|jpg|jpeg|webp|svg|json)$/i.test(url.pathname) || url.pathname === "/";
};

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  if (!isStaticRequest(e.request)) return;

  e.respondWith(
    caches.match(e.request).then((cached) => {
      const networkFetch = fetch(e.request).then((res) => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || networkFetch;
    })
  );
});
