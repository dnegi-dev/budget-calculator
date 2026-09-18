import type { NextConfig } from 'next';

/**
 * v1 ist eine rein clientseitige PWA: alle Daten liegen in IndexedDB auf dem
 * Gerät, es gibt keinen Server-Anteil. Deshalb `output: 'export'` — das Ergebnis
 * ist ein statisches Bundle in `out/`, das von jedem Webserver ausgeliefert
 * werden kann.
 *
 * Für den späteren Schritt (zentrale DB + SSO) wird genau diese Zeile entfernt.
 * Danach stehen Route Handlers, Server Actions und Middleware zur Verfügung,
 * ohne dass am Anwendungscode etwas geändert werden muss — siehe
 * docs/roadmap-server.md.
 */
const nextConfig: NextConfig = {
  output: 'export',
  reactStrictMode: true,
  images: {
    // Ohne Server gibt es keine Bildoptimierung. Belege werden ohnehin als
    // Blob-URLs aus IndexedDB angezeigt.
    unoptimized: true,
  },
};

export default nextConfig;
