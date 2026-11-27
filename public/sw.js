// Service worker: makes Bol ke Khata installable and keeps it opening without internet.
// - The app itself (HTML, JS, CSS, icons) is cached, so the khata opens in a shop with bad network.
// - The ledger lives in the phone (localStorage), so entries typed offline are kept.
// - /api (Claude) is never cached; offline, the app's own keyword parser understands the sentence.
// Note: Chrome's speech recognition needs internet; offline the shopkeeper can type or use the number pad.
const VERSION = "bkk-v1";
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icon.svg", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Claude parsing and status: always live.
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) return;

  // Pages (including /pay links): network first so updates arrive; cached app when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put("/index.html", copy)); return res; })
        .catch(() => caches.match("/index.html").then((r) => r || caches.match("/"))),
    );
    return;
  }

  // Built files have content hashes in their names, so a cached copy is always correct.
  const sameOrigin = url.origin === self.location.origin;
  const isFont = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (sameOrigin || isFont) {
    event.respondWith(
      caches.match(req).then((hit) => {
        const live = fetch(req).then((res) => {
          if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
          return res;
        }).catch(() => hit);
        return hit || live;
      }),
    );
  }
});
