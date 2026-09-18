'use client';

/**
 * Das Gerüst um alle Seiten.
 *
 * Mobil: keine Kopfzeile. Sie trug zuletzt nur noch das Zahnrad, und das steht
 * jetzt in der unteren Leiste — damit ist die oberste Bildschirmzeile wieder
 * für Inhalt da. Navigation und Erfassen liegen unten, wo der Daumen ist.
 *
 * Ab `md`: Navigation als Seitenleiste, Inhalt breiter, kein schwebender
 * Knopf — dort tragen die Seiten ihre eigenen Knöpfe.
 *
 * Gleiche Routen, gleicher Funktionsumfang auf beiden Plattformen. Nur die
 * Anordnung unterscheidet sich.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { QuickEntryButton } from './QuickEntryButton';

interface NavItem {
  href: string;
  label: string;
  icon: string;
  /**
   * In der unteren Leiste ist Platz für vier Ziele. „Töpfe" fehlt dort
   * bewusst: Die Startseite listet dieselben Töpfe mit denselben
   * Restbeträgen, jede Zeile führt ins Detail. Eine eigene Übersichtsseite
   * wäre mobil eine Dopplung — in der Seitenleiste bleibt sie.
   */
  primary: boolean;
}

const NAV: readonly NavItem[] = [
  { href: '/', label: 'Heute', icon: '⌂', primary: true },
  { href: '/toepfe', label: 'Töpfe', icon: '◫', primary: false },
  { href: '/buchungen', label: 'Buchungen', icon: '≡', primary: true },
  { href: '/auswertung', label: 'Auswertung', icon: '◔', primary: true },
  { href: '/einstellungen', label: 'Einstellungen', icon: '⚙', primary: true },
];

function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

/** Impressum und Datenschutz müssen von jeder Seite aus erreichbar sein. */
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
          <p className="font-medium">Haushalt</p>
          <p className="text-sm text-ink-muted">Planung &amp; Töpfe</p>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-3" aria-label="Hauptnavigation">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(pathname, item.href) ? 'page' : undefined}
              className={[
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-[0.9375rem]',
                isActive(pathname, item.href)
                  ? 'bg-accent-subtle text-ink'
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
        {/*
          pt: Ohne Kopfzeile beginnt der Inhalt ganz oben — auf Geräten mit
          Aussparung liefe er sonst als installierte App unter die Statusleiste.
          pb-28: Platz für die untere Leiste und den schwebenden Knopf.
        */}
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-28 md:max-w-4xl md:px-8 md:pt-8 md:pb-10">
          {children}
          <footer className="mt-10 pt-4 text-xs text-ink-muted md:hidden">
            <LegalLinks />
          </footer>
        </main>

        <QuickEntryButton />

        <nav
          aria-label="Hauptnavigation"
          className={[
            'fixed inset-x-0 bottom-0 z-40 flex md:hidden',
            // Durchscheinend statt harter Fläche; die Haarlinie hält die
            // Leiste trotzdem vom Inhalt getrennt, wenn darunter Weiß liegt.
            'border-t border-line bg-surface/85 backdrop-blur-md',
            'pb-[env(safe-area-inset-bottom)]',
          ].join(' ')}
        >
          {NAV.filter((item) => item.primary).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(pathname, item.href) ? 'page' : undefined}
              className={[
                'flex min-w-0 flex-1 flex-col items-center gap-1 px-1 py-2.5',
                // Eine Stufe kleiner auf sehr schmalen Geräten: „Einstellungen“
                // ist das längste Wort und stößt bei 320 px sonst an den Rand.
                'text-[0.625rem] min-[360px]:text-[0.6875rem]',
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
