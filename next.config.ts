import type { NextConfig } from 'next';

/**
 * v1 ist eine rein clientseitige PWA: alle Daten liegen in IndexedDB auf dem
 * Gerät, es gibt keinen Server-Anteil. Deshalb `output: 'export'` — das Ergebnis
 * ist ein statisches Bundle in `out/`, das von jedem Webserver ausgeliefert
 * werden kann.
 *
 * Für den späteren Schritt (zentrale DB + SSO) wird genau diese Zeile entfernt.
 * Danach stehen Route Handlers, Server Actions und Proxy zur Verfügung,
 * ohne dass am Anwendungscode etwas geändert werden muss — siehe
 * docs/roadmap-server.md.
 */

/**
 * Unterpfad, unter dem die App ausgeliefert wird.
 *
 * GitHub Pages liefert ein Projekt-Repo unter `/<repo>/` aus, nicht unter `/`.
 * Der Wert wird laut Next-Doku **zur Bauzeit** in die Client-Bundles eingebacken
 * und ist danach nicht mehr änderbar — deshalb eine Umgebungsvariable und kein
 * fester Wert: lokal und im Test bleibt sie leer, der Deploy-Workflow setzt sie
 * auf `/budget-calculator`. Bei eigener Domain bleibt sie ebenfalls leer.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

const nextConfig: NextConfig = {
  output: 'export',
  reactStrictMode: true,
  ...(basePath ? { basePath } : {}),
  /**
   * Erzeugt `/toepfe/index.html` statt `/toepfe.html`. Damit funktionieren
   * Deep-Links auf jedem statischen Host ohne Sonderregel für
   * Dateiendungen — auf GitHub Pages lässt sich keine konfigurieren.
   */
  trailingSlash: true,
  images: {
    // Ohne Server gibt es keine Bildoptimierung. Belege werden ohnehin als
    // Blob-URLs aus IndexedDB angezeigt.
    unoptimized: true,
  },
};

export default nextConfig;
