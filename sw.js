/* sw.js — permite instalar la app y abrirla aunque no haya señal (muestra la última versión guardada). */
const C = "clima-v1", ARCH = ["./", "index.html", "core.js", "config.js", "manifest.json", "icon-192.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(C).then(c => c.addAll(ARCH))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== C).map(x => caches.delete(x))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return;               // los datos del clima siempre se piden frescos
  e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); return r; })
    .catch(() => caches.match(e.request)));
});
