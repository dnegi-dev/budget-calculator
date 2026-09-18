import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppGate } from '../components/AppGate';
import { AuthProvider } from '../lib/auth/provider';
import { DataProvider } from '../lib/data/provider';
import { withBasePath } from '../lib/base-path';
import { ServiceWorkerRegistration } from '../components/ServiceWorkerRegistration';
import { UpdateNotice } from '../components/UpdateNotice';
import { THEME_BOOTSTRAP_SCRIPT } from '../lib/prefs/device-prefs';

export const metadata: Metadata = {
  title: 'Haushalt',
  description: 'Haushaltsplanung mit Töpfen — Daten bleiben auf dem Gerät.',
  applicationName: 'Haushalt',
  // Absolut mit Präfix, nicht relativ: Ein relatives href im <head> würde je
  // nach Routentiefe unterschiedlich auflösen.
  manifest: withBasePath('/manifest.webmanifest'),
  appleWebApp: {
    capable: true,
    title: 'Haushalt',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [{ url: withBasePath('/icons/icon.svg'), type: 'image/svg+xml' }],
    apple: [{ url: withBasePath('/icons/icon-192.png'), sizes: '192x192' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Kein maximumScale: Zoom zu verbieten ist ein Barrierefreiheitsproblem.
  viewportFit: 'cover',
  // Kein `themeColor` hier. Zwei Media-Angaben können keine ausdrückliche Wahl
  // ausdrücken, und der Client-Router fügt die Tags nach einem Seitenwechsel
  // erneut ein — beim Prüfen standen danach drei im Dokument, eine davon mit
  // der alten Farbe. Der Browser nimmt die erste passende, das wäre Glücksspiel.
  // Stattdessen pflegt `applyTheme` in `lib/prefs/device-prefs.ts` genau eine.
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: Das Skript unten setzt `data-theme` am
    // Wurzelelement, bevor React übernimmt — das ist genau die Abweichung, vor
    // der die Warnung sonst zu Recht warnt.
    <html lang="de" suppressHydrationWarning>
      <body>
        {/*
          Vor allem anderen: Die gewählte Darstellung muss stehen, bevor der
          erste Pixel gezeichnet wird. Aus der Datenbank gelesen würde bei jedem
          Start kurz das helle Thema aufblitzen.
        */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
        <ServiceWorkerRegistration />
        <UpdateNotice />
        <DataProvider>
          <AuthProvider>
            <AppGate>{children}</AppGate>
          </AuthProvider>
        </DataProvider>
      </body>
    </html>
  );
}
