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
import { Suspense, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ChartPie, House, ListOrdered, Settings, Wallet } from 'lucide-react';
import { Icon } from '../lib/ui/Icon';
import { QuickEntryButton } from './QuickEntryButton';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /**
   * In der unteren Leiste ist Platz für vier Ziele. „Töpfe" fehlt dort
   * bewusst: Die Startseite listet dieselben Töpfe mit denselben
   * Restbeträgen, jede Zeile führt ins Detail. Eine eigene Übersichtsseite
   * wäre mobil eine Dopplung — in der Seitenleiste bleibt sie.
   */
  primary: boolean;
}

const NAV: readonly NavItem[] = [
  { href: '/', label: 'Heute', icon: House, primary: true },
  { href: '/toepfe', label: 'Töpfe', icon: Wallet, primary: false },
  { href: '/buchungen', label: 'Buchungen', icon: ListOrdered, primary: true },
  { href: '/auswertung', label: 'Auswertung', icon: ChartPie, primary: true },
  { href: '/einstellungen', label: 'Einstellungen', icon: Settings, primary: true },
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
              <Icon icon={item.icon} size={20} />
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

          Der Platz unten (8,25 rem für untere Leiste und schwebenden Knopf,
          mit pb-28 lag die letzte Listenzeile dauerhaft darunter) steckt
          mobil **nicht** mehr im `pb`, sondern in einem Abstandhalter nach
          der Rechtsleiste. Der Grund steht dort: Ein `sticky` mit `top`
          greift nur, wenn unter dem Element noch Platz **im Inhaltsfluss**
          seines Containers ist — Polsterung zählt nicht dazu.
        */}
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-[max(1.25rem,env(safe-area-inset-top))] md:max-w-4xl md:px-8 md:pt-8 md:pb-10">
          {children}
          {/*
            Klebt, sobald sie einmal im Bild war — und wandert dann nicht
            weiter nach oben weg. Vorher stand sie am Ende einer langen Seite
            und war nur mit viel Scrollen erreichbar.

            **`top` und nicht `bottom`, und das ist der Kern:** `bottom` heftet
            ein Element von Anfang an an den Fensterboden; die Leiste wäre auf
            jeder Seite dauerhaft sichtbar und kostete überall eine Zeile. Ein
            großer `top`-Wert klebt erst, wenn das Element von unten ins Bild
            gekommen ist — genau das gewünschte Verhalten, und kurze Seiten
            zahlen nichts dafür.

            `pr-24` hält die rechte Ecke frei: Dort liegt der schwebende Knopf
            (`z-40`), und diese Leiste liegt darunter auf `z-20`.
          */}
          <footer
            className={[
              'sticky top-[calc(100dvh_-_var(--legal-bar-h)_-_var(--nav-bar-h))] z-20 md:hidden',
              'mt-10 -mx-4 pl-4 pr-24',
              'h-[var(--legal-bar-h)] border-t border-line bg-surface/85 backdrop-blur-md',
              'text-xs text-ink-muted',
            ].join(' ')}
          >
            <LegalLinks className="py-1.5" />
          </footer>
          {/*
            Der Platz, der vorher als `pb-36` am `main` hing — und zugleich
            das, was die Leiste darüber überhaupt kleben lässt: Ein `sticky`
            mit `top` kann ein Element nur bis zum Ende des **Inhalts** seines
            Containers nach unten schieben. Als letztes Kind war die Leiste
            damit unverschiebbar und klebte nie, obwohl der `top`-Wert stimmte.
          */}
          <div aria-hidden className="h-36 md:hidden" />
        </main>

        {/*
          Die `Suspense`-Grenze gehört hierhin und nicht in den Knopf: Er liest
          mit `useSearchParams` den Topf aus der Adresse, und unter
          `output: 'export'` verlangt der Build für jeden solchen Leser eine
          Grenze **um** ihn. Ohne sie schlägt nicht die Laufzeit fehl, sondern
          das Bauen.
        */}
        <Suspense fallback={null}>
          <QuickEntryButton />
        </Suspense>

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
              <Icon icon={item.icon} size={22} />
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
