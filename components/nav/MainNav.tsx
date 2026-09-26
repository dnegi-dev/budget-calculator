'use client';

/**
 * Hauptnavigation: Seitenleiste ab `md`, untere Leiste darunter.
 *
 * Vier feste Ziele — Töpfe (Startseite), Buchungen, Auswertung, Einstellungen
 * — und dazu die Lieblings-Töpfe dieses Geräts (`lib/domain/nav-favorites.ts`):
 * am Desktop bis zu vier unter „Töpfe", mobil einer an zweiter Stelle der
 * unteren Leiste. Mit ihm sind es dort fünf Einträge; bei 320 px Breite prüft
 * das `e2e/favoriten.spec.ts`.
 *
 * Der geöffnete Topf kommt aus `?pot=` in der Adresse. Dafür braucht es
 * `useSearchParams` und damit eine `Suspense`-Grenze — die stehen in
 * `AppShell`, und ihr Ersatzinhalt ist dieselbe Leiste ohne diese Angabe.
 * Mit `null` als Ersatz stünde im vorgerenderten HTML gar kein Menü.
 */

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import { ChartPie, ListOrdered, Settings, Wallet } from 'lucide-react';
import { useSnapshot } from '../../lib/data/provider';
import {
  MAX_DESKTOP_FAVORITES,
  MAX_MOBILE_FAVORITES,
  resolveFavoritePots,
} from '../../lib/domain/nav-favorites';
import type { Pot } from '../../lib/domain/types';
import type { NavLayout } from '../../lib/prefs/device-prefs';
import { useNavFavoriteIds } from '../../lib/prefs/useDevicePref';
import { Icon } from '../../lib/ui/Icon';
import { PotIcon } from '../pots/PotIcon';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/**
 * „Heute" stand hier früher an erster Stelle und zeigte dieselben Topf-Zeilen
 * wie „Töpfe", nur ohne Suche. Jetzt ist die Töpfe-Seite die Startseite, und
 * alle vier Ziele stehen in beiden Leisten.
 */
const NAV: readonly NavItem[] = [
  { href: '/', label: 'Töpfe', icon: Wallet },
  { href: '/buchungen', label: 'Buchungen', icon: ListOrdered },
  { href: '/auswertung', label: 'Auswertung', icon: ChartPie },
  { href: '/einstellungen', label: 'Einstellungen', icon: Settings },
];

const MAX_FAVORITES: Record<NavLayout, number> = {
  desktop: MAX_DESKTOP_FAVORITES,
  mobile: MAX_MOBILE_FAVORITES,
};

function favoriteHref(pot: Pot): string {
  return `/toepfe/detail?pot=${pot.id}`;
}

/**
 * Ob ein festes Ziel aktiv ist. „Töpfe" deckt die Startseite und jede
 * Topf-Detailseite ab — außer der geöffnete Topf steht selbst als Favorit im
 * Menü, dann ist **er** markiert und nicht beide.
 */
function isActive(
  pathname: string,
  href: string,
  openPotId: string | null,
  favorites: readonly Pot[],
): boolean {
  if (href !== '/') return pathname.startsWith(href);
  if (pathname === '/') return true;
  if (!pathname.startsWith('/toepfe')) return false;
  return !favorites.some((pot) => pot.id === openPotId);
}

function isFavoriteActive(pathname: string, openPotId: string | null, pot: Pot): boolean {
  return pathname.startsWith('/toepfe/detail') && openPotId === pot.id;
}

/** Die Leiste mit dem geöffneten Topf aus der Adresse — innerhalb einer `Suspense`. */
export function MainNavWithParams({ layout }: { layout: NavLayout }) {
  const params = useSearchParams();
  return <MainNav layout={layout} openPotId={params.get('pot')} />;
}

export function MainNav({ layout, openPotId }: { layout: NavLayout; openPotId: string | null }) {
  const pathname = usePathname();
  const snapshot = useSnapshot();
  const favorites = resolveFavoritePots(
    useNavFavoriteIds(layout),
    snapshot.pots,
    MAX_FAVORITES[layout],
  );
  const props = { pathname, openPotId, favorites };
  return layout === 'desktop' ? <SideNav {...props} /> : <BottomNav {...props} />;
}

interface NavProps {
  pathname: string;
  openPotId: string | null;
  favorites: readonly Pot[];
}

function SideNav({ pathname, openPotId, favorites }: NavProps) {
  return (
    <nav className="flex flex-1 flex-col gap-0.5 px-3" aria-label="Hauptnavigation">
      {NAV.map((item) => {
        const active = isActive(pathname, item.href, openPotId, favorites);
        return (
          <div key={item.href} className="flex flex-col gap-0.5">
            <Link
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={[
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-[0.9375rem]',
                active
                  ? 'bg-accent-subtle text-ink'
                  : 'text-ink-muted hover:bg-subtle hover:text-ink',
              ].join(' ')}
            >
              <Icon icon={item.icon} size={20} />
              {item.label}
            </Link>
            {item.href === '/' &&
              favorites.map((pot) => {
                const favoriteActive = isFavoriteActive(pathname, openPotId, pot);
                return (
                  <Link
                    key={pot.id}
                    href={favoriteHref(pot)}
                    aria-current={favoriteActive ? 'page' : undefined}
                    className={[
                      'ml-6 flex min-w-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm',
                      favoriteActive
                        ? 'bg-accent-subtle text-ink'
                        : 'text-ink-muted hover:bg-subtle hover:text-ink',
                    ].join(' ')}
                  >
                    <PotIcon pot={pot} className="h-6 w-6 rounded-md text-xs" />
                    <span className="truncate">{pot.name}</span>
                  </Link>
                );
              })}
          </div>
        );
      })}
    </nav>
  );
}

const MOBILE_ENTRY = [
  // `px-0.5` statt `px-1`: Mit einem Lieblings-Topf sind es fünf Einträge,
  // bei 320 px also 64 px je Eintrag — und „Einstellungen“ braucht davon 58.
  // Mit 4 px Rand je Seite lief die Leiste um 2 px über (gemessen im
  // E2E-Test, der genau das prüft).
  'flex min-w-0 flex-1 flex-col items-center gap-1 px-0.5 py-2.5',
  // Eine Stufe kleiner auf sehr schmalen Geräten: „Einstellungen“ ist das
  // längste Wort und stößt bei 320 px sonst an den Rand.
  'text-[0.625rem] min-[360px]:text-[0.6875rem]',
].join(' ');

/**
 * Die Beschriftung darf kürzen statt überlaufen — bei größerer Systemschrift
 * reicht auch `px-0.5` nicht, und dann ist ein „Einstellu…“ besser als eine
 * Leiste, die seitlich scrollt.
 */
const MOBILE_LABEL = 'w-full truncate text-center';

function BottomNav({ pathname, openPotId, favorites }: NavProps) {
  return (
    <nav
      aria-label="Hauptnavigation"
      className={[
        'fixed inset-x-0 bottom-0 z-40 flex md:hidden',
        // Durchscheinend statt harter Fläche; die Haarlinie hält die Leiste
        // trotzdem vom Inhalt getrennt, wenn darunter Weiß liegt.
        'border-t border-line bg-surface/85 backdrop-blur-md',
        'pb-[env(safe-area-inset-bottom)]',
      ].join(' ')}
    >
      {NAV.map((item) => {
        const active = isActive(pathname, item.href, openPotId, favorites);
        return (
          <div key={item.href} className="contents">
            <Link
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`${MOBILE_ENTRY} ${active ? 'text-accent' : 'text-ink-muted'}`}
            >
              <Icon icon={item.icon} size={22} />
              <span className={MOBILE_LABEL}>{item.label}</span>
            </Link>
            {item.href === '/' &&
              favorites.map((pot) => {
                const favoriteActive = isFavoriteActive(pathname, openPotId, pot);
                return (
                  <Link
                    key={pot.id}
                    href={favoriteHref(pot)}
                    aria-current={favoriteActive ? 'page' : undefined}
                    className={`${MOBILE_ENTRY} ${favoriteActive ? 'text-accent' : 'text-ink-muted'}`}
                  >
                    <PotIcon pot={pot} className="h-[22px] w-[22px] rounded-md text-xs" />
                    <span className={MOBILE_LABEL}>{pot.name}</span>
                  </Link>
                );
              })}
          </div>
        );
      })}
    </nav>
  );
}
