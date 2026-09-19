/*
 * Service Worker — von Hand geschrieben, absichtlich klein.
 *
 * Aufgabe: Die App soll offline starten. Die Daten liegen ohnehin lokal in
 * IndexedDB; es fehlt nur die Hülle (HTML, JS, CSS).
 *
 * Strategie:
 * - Dateien mit Hash im Namen (`_next/static/…`) und die Symbole: erst Cache.
 *   Ein Treffer ist dort immer die passende Fassung, denn eine geänderte Datei
 *   hat einen anderen Namen.
 * - Alles andere: erst Netz, Cache nur als Rückfall. Das schließt die
 *   Navigationen ein, aber auch die RSC-Nutzlasten (`index.txt`,
 *   `__next.*.txt`), die der Router bei jedem Wechsel innerhalb der App holt.
 *
 * Genau daran lag der Fehler „nach dem Update läuft die alte Version weiter":
 * Vorher galt „erst Cache" für alles außer Navigationen, mit der Begründung,
 * Next hänge an jeden Dateinamen einen Hash. Das stimmt für `_next/static`,
 * nicht aber für die `.txt`-Nutzlasten des statischen Exports. Die lagen damit
 * unbegrenzt im Cache: Die Hülle war nach einem Deploy neu, jede Unterseite
 * alt. Der Cachename `haushalt-v1` war zudem ein Literal, das sich nie
 * änderte — die Aufräumschleife beim `activate` hat nie etwas geworfen.
 *
 * Kein Workbox, kein next-pwa: Das wären für drei Regeln ein paar hundert
 * Kilobyte Abhängigkeit und eine Build-Integration, die bei jedem
 * Next-Update bricht.
 *
 * Der Unterpfad wird aus der eigenen Adresse abgeleitet statt eingebaut: Auf
 * GitHub Pages liegt die App unter `/<repo>/`, lokal unter `/`. So passt
 * dieselbe Datei auf beides, ohne sie beim Build zu erzeugen.
 */

/** Hochzählen, wenn alte Einträge weg sollen — `activate` räumt dann auf. */
const CACHE = 'haushalt-v3';

/** '/' lokal, '/budget-calculator/' auf GitHub Pages. */
const SCOPE = new URL('./', self.location).pathname;

const APP_SHELL = [
  SCOPE,
  `${SCOPE}toepfe/`,
  `${SCOPE}buchungen/`,
  `${SCOPE}buchungen/wiederkehrend/`,
  `${SCOPE}auswertung/`,
  `${SCOPE}einstellungen/`,
  `${SCOPE}einstellungen/haushalt/`,
  `${SCOPE}einstellungen/erfassen/`,
  `${SCOPE}einstellungen/darstellung/`,
  `${SCOPE}einstellungen/organisieren/`,
  `${SCOPE}einstellungen/daten/`,
  `${SCOPE}einstellungen/rollen/`,
  `${SCOPE}einstellungen/gefahrenzone/`,
  `${SCOPE}impressum/`,
  `${SCOPE}datenschutz/`,
  `${SCOPE}manifest.webmanifest`,
];

/**
 * Unveränderlich, weil der Name den Inhalt trägt.
 *
 * `/vendor/` enthält fremde Dateien mit der Version im Dateinamen (heute der
 * pdf.js-Worker). Eine neue Version bekommt einen neuen Namen, deshalb ist ein
 * Cache-Treffer dort immer der richtige — und das Einlesen eines Bons
 * funktioniert offline.
 */
function isImmutable(pathname) {
  return (
    pathname.startsWith(`${SCOPE}_next/static/`) ||
    pathname.startsWith(`${SCOPE}icons/`) ||
    pathname.startsWith(`${SCOPE}vendor/`)
  );
}

/** Die Versionsdatei beantwortet die Frage, ob der Cache veraltet ist. */
function isVersionFile(pathname) {
  return pathname === `${SCOPE}version.json`;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Einzeln, damit ein fehlender Pfad nicht die gesamte Installation kippt.
      await Promise.allSettled(
        APP_SHELL.map((path) => cache.add(new Request(path, { cache: 'reload' }))),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Nie aus dem Cache und nie hinein: Eine gecachte Versionsnummer wäre die
  // eigene, und die Prüfung könnte nie etwas feststellen.
  if (isVersionFile(url.pathname)) return;

  if (isImmutable(url.pathname)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response.ok && response.type === 'basic') {
            const cache = await caches.open(CACHE);
            cache.put(request, response.clone());
          }
          return response;
        } catch {
          return Response.error();
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);
        if (response.ok && response.type === 'basic') {
          const cache = await caches.open(CACHE);
          cache.put(request, response.clone());
        }
        return response;
      } catch {
        const cached = await caches.match(request);
        if (cached) return cached;
        // Für eine Navigation ist die Startseite besser als die Fehlerseite
        // des Browsers; alles andere darf scheitern.
        if (request.mode === 'navigate') {
          return (await caches.match(SCOPE)) ?? Response.error();
        }
        return Response.error();
      }
    })(),
  );
});
