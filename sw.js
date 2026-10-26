/* Repère Musculation : fonctionne hors connexion à la salle, et se met à jour toute seule. */
const CACHE = "repere-v10";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png"
];

// Toujours aller chercher la dernière version sur le serveur, sans passer par le cache du téléphone.
const fresh = (url) => fetch(url, { cache: "no-store", credentials: "same-origin" });

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(SHELL.map((u) => fresh(u).then((r) => { if (r.ok) return c.put(u, r); }).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  const ready = caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim());
  e.waitUntil(ready);
  // Les pages déjà ouvertes avec l'ancienne version se rechargent sur la nouvelle,
  // une fois le service worker actif (sinon le rechargement attendrait le service worker lui-même).
  ready.then(() => new Promise((r) => setTimeout(r, 300)))
    .then(() => self.clients.matchAll({ type: "window" }))
    .then((cs) => cs.forEach((c) => { if (c.navigate) c.navigate(c.url).catch(() => {}); }));
});

self.addEventListener("message", (e) => { if (e.data === "skip") self.skipWaiting(); });

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // La page : toujours la version du serveur ; la copie en cache ne sert que hors connexion.
  if (req.mode === "navigate") {
    e.respondWith(
      fresh(req.url)
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put("./index.html", copy)); }
          return res;
        })
        .catch(() => caches.match("./index.html").then((r) => r || caches.match("./")))
    );
    return;
  }

  // Fichier de version : jamais en cache.
  if (url.origin === self.location.origin && url.pathname.endsWith("/version.txt")) {
    e.respondWith(fresh(req.url).catch(() => new Response("", { status: 504 })));
    return;
  }

  // Fichiers de l'app (icônes, manifeste) : cache d'abord.
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }))
    );
    return;
  }

  // Polices : copie en cache tout de suite, mise à jour en arrière-plan.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(
      caches.open(CACHE).then((c) => c.match(req).then((hit) => {
        const net = fetch(req).then((res) => { c.put(req, res.clone()); return res; }).catch(() => hit);
        return hit || net;
      }))
    );
  }
});
