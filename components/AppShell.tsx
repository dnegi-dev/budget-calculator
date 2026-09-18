'use client';

/**
 * Das Gerüst um alle Seiten.
 *
 * Mobil: Kopfzeile plus Navigation am unteren Rand — dort, wo der Daumen ist.
 * Ab `md`: Navigation als Seitenleiste, Inhalt breiter.
 *
 * Gleiche Routen, gleicher Funktionsumfang auf beiden Plattformen. Nur die
 * Anordnung unterscheidet sich.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

interface NavItem {
  href: string;
  label: string;
  icon: string;
  /** In der unteren Navigation ist nur Platz für die Wege des Alltags. */
  primary: boolean;
}

const NAV: readonly NavItem[] = [
  { href: '/', label: 'Heute', icon: '⌂', primary: true },
  { href: '/toepfe', label: 'Töpfe', icon: '◫', primary: true },
  { href: '/buchungen', label: 'Buchungen', icon: '≡', primary: true },
  { href: '/auswertung', label: 'Auswertung', icon: '◔', primary: true },
  { href: '/einstellungen', label: 'Einstellungen', icon: '⚙', primary: false },
];

function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

/**
 * Impressum und Datenschutz müssen von jeder Seite aus erreichbar sein.
 * Sie gehören aber nicht in die untere Navigation — die hat vier Plätze, und
 * die gehören dem Alltag.
 */
export function LegalLinks({ className = '' }: { className?: string }) {
  return (
    <p className={`flex gap-3 ${className}`}>
      <Link href="/impressum" className="hover:text-ink hover:underline">
        Impressum
      </Link>
      <Link href="/datenschutz" className="hover:text-ink hover:underline">
        Datenschutz
      </Link>
    </p>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-dvh md:flex">
      {/* Seitenleiste ab Tablet */}
      <aside className="hidden w-60 shrink-0 border-r border-line bg-surface md:flex md:flex-col">
        <div className="px-5 py-6">
          <p className="text-base font-semibold">Haushalt</p>
          <p className="text-sm text-ink-muted">Planung &amp; Töpfe</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3" aria-label="Hauptnavigation">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(pathname, item.href) ? 'page' : undefined}
              className={[
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-[0.9375rem]',
                isActive(pathname, item.href)
                  ? 'bg-accent-subtle font-medium text-ink'
                  : 'text-ink-muted hover:bg-subtle hover:text-ink',
              ].join(' ')}
            >
              <span aria-hidden className="w-5 text-center text-lg">
                {item.icon}
              </span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="px-5 py-4 text-xs text-ink-muted">
          <p>Daten liegen nur auf diesem Gerät.</p>
          <LegalLinks className="mt-2" />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Kopfzeile nur mobil: auf dem Desktop trägt die Seitenleiste den Titel */}
        <header className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 md:hidden">
          <p className="font-semibold">Haushalt</p>
          <Link
            href="/einstellungen"
            aria-label="Einstellungen"
            className="rounded-lg px-2 py-1 text-lg text-ink-muted hover:bg-subtle"
          >
            ⚙
          </Link>
        </header>

        {/* pb-24: Platz für die untere Navigation, damit sie nichts verdeckt */}
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-5 pb-24 md:max-w-4xl md:px-8 md:pt-8 md:pb-10">
          {children}
          <footer className="mt-10 border-t border-line pt-4 text-xs text-ink-muted md:hidden">
            <LegalLinks />
          </footer>
        </main>

        <nav
          aria-label="Hauptnavigation"
          className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
        >
          {NAV.filter((item) => item.primary).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(pathname, item.href) ? 'page' : undefined}
              className={[
                'flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[0.6875rem]',
                isActive(pathname, item.href) ? 'text-accent' : 'text-ink-muted',
              ].join(' ')}
            >
              <span aria-hidden className="text-lg leading-none">
                {item.icon}
              </span>
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
