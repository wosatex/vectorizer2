/* Vectorizer Service Worker
   Grundsatz: Es wird ausschliesslich die App-Huelle zwischengespeichert.
   Analysen brauchen zwingend das Netz — jede Anfrage an einen Modellanbieter
   geht ungefiltert durch und wird nie aus dem Cache beantwortet. Eine
   gecachte Modellantwort waere schlimmer als gar keine. */

const VERSION = "vectorizer-2026-08-05-d";
const HUELLE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./favicon.png"
];

// Anbieter-Endpunkte: niemals anfassen.
const FREMD = /(anthropic\.com|googleapis\.com|openai\.com)/i;

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(VERSION)
      // Einzeln, damit eine fehlende Datei nicht die ganze Installation kippt.
      .then((c) => Promise.all(HUELLE.map((u) => c.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;                       // POST an die API: durchlassen
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;        // fremde Herkunft: durchlassen
  if (FREMD.test(url.href)) return;

  // Seitenaufrufe: erst Netz, bei Ausfall die gespeicherte Huelle.
  if (req.mode === "navigate") {
    e.respondWith(
      // no-store: sonst liefert der HTTP-Cache des Browsers die alte Seite
      // aus, und das Update kommt trotz Netzverbindung nicht an.
      fetch(req, { cache: "no-store" })
        .then((res) => {
          const kopie = res.clone();
          caches.open(VERSION).then((c) => c.put("./index.html", kopie));
          return res;
        })
        .catch(() => caches.match("./index.html").then((r) => r || caches.match("./")))
    );
    return;
  }

  // Dateien: erst Cache, sonst Netz und danach ablegen.
  e.respondWith(
    caches.match(req).then((treffer) => treffer || fetch(req).then((res) => {
      if (res && res.ok && res.type === "basic") {
        const kopie = res.clone();
        caches.open(VERSION).then((c) => c.put(req, kopie));
      }
      return res;
    }).catch(() => treffer))
  );
});
