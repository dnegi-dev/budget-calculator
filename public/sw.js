/*
 * Service Worker — von Hand geschrieben, absichtlich klein.
 *
 * Aufgabe: Die App soll offline starten. Die Daten liegen ohnehin lokal in
 * IndexedDB; es fehlt nur die Hülle (HTML, JS, CSS).
 *
 * Strategie:
 * - Navigationen: erst Netz, bei Fehlschlag die letzte gecachte Seite. So
 *   bekommt man nach einem Deploy sofort die neue Version, bleibt aber offline
 *   bedienbar.
 * - Alles andere (JS/CSS/Bilder): erst Cache, dann Netz. Next.js hängt Hashes
 *   an die Dateinamen, deshalb ist ein Treffer immer die passende Version.
 *
 * Kein Workbox, kein next-pwa: Das wären für zwei Regeln ein paar hundert
 * Kilobyte Abhängigkeit und eine Build-Integration, die bei jedem
 * Next-Update bricht.
 */

const CACHE = 'haushalt-v1';
const APP_SHELL = [
  '/',
  '/toepfe',
  '/buchungen',
  '/auswertung',
  '/einstellungen',
  '/manifest.webmanifest',
];

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

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          const cache = await caches.open(CACHE);
          cache.put(request, response.clone());
          return response;
        } catch {
          const cached = await caches.match(request);
          // Fällt auf die Startseite zurück: besser als die Fehlerseite des Browsers.
          return cached ?? (await caches.match('/')) ?? Response.error();
        }
      })(),
    );
    return;
  }

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
});
