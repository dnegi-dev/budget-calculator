import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppGate } from '../components/AppGate';
import { AuthProvider } from '../lib/auth/provider';
import { DataProvider } from '../lib/data/provider';
import { ServiceWorkerRegistration } from '../components/ServiceWorkerRegistration';

export const metadata: Metadata = {
  title: 'Haushalt',
  description: 'Haushaltsplanung mit Töpfen — Daten bleiben auf dem Gerät.',
  applicationName: 'Haushalt',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Haushalt',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [{ url: '/icons/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/icons/icon-192.png', sizes: '192x192' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Kein maximumScale: Zoom zu verbieten ist ein Barrierefreiheitsproblem.
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbfbfd' },
    { media: '(prefers-color-scheme: dark)', color: '#1b1d22' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        <ServiceWorkerRegistration />
        <DataProvider>
          <AuthProvider>
            <AppGate>{children}</AppGate>
          </AuthProvider>
        </DataProvider>
      </body>
    </html>
  );
}
