'use client';

/**
 * Die Leiste über einer Liste: Überschrift, Suche, Filter, freie Aktionen —
 * und sie bleibt beim Scrollen oben.
 *
 * Vorher verschwand auf jeder Listenseite beim Scrollen zuerst die
 * Überschrift und mit ihr Lupe und Filter. Wer in einer langen Liste etwas
 * sucht, muss also erst wieder hochscrollen, um suchen zu können. Genau das
 * ist der Grund, warum die Leiste klebt und nicht bloß hübscher sitzt.
 *
 * Vier Dinge, die daran nicht offensichtlich sind:
 *
 * 1. **`top` ist nicht 0.** Als installierte App liegt die oberste
 *    Bildschirmzeile unter der Statusleiste; `main` rechnet das mit
 *    `pt-[max(1.25rem,env(safe-area-inset-top))]` ein, und die klebende
 *    Leiste muss es selbst tun — sonst klebt sie unter der Uhr.
 * 2. **Sie gibt ihre Höhe als `--list-toolbar-h` bekannt.** Der Datumskopf in
 *    `EntryList` klebt selbst (`sticky`) und lag sonst *hinter* dieser Leiste.
 *    Die Höhe ändert sich, sobald Suche oder Filter aufklappen, deshalb ein
 *    `ResizeObserver` und kein fester Wert. Die Variable steht am
 *    Wurzelelement, weil der Datumskopf in einem anderen Teilbaum sitzt
 *    (Karte → Liste) und ein gemeinsamer Vorfahre sonst nicht existiert.
 * 3. **Sie greift über die Seitenränder.** Ohne `-mx-4 px-4` scrollt Inhalt
 *    sichtbar an ihren Rändern vorbei.
 * 4. **`z-30`.** Untere Leiste und schwebender Knopf liegen auf `z-40`, ein
 *    `Sheet` auf `z-50`, der Datumskopf auf `z-10`.
 *
 * Suche und Filter klappen an jeder Breite auf und zu. Vorher standen sie ab
 * `md` in einer eigenen Karte dauerhaft offen — zwei Fassungen desselben
 * Feldes, von denen nur eine die Referenz für den Fokus tragen durfte. Eine
 * Leiste, die überall gleich funktioniert, ist eine Erklärung weniger.
 *
 * Ein eingeklappter, still wirksamer Filter wäre ein Fehler: Das Schließen der
 * Suche räumt den Begriff weg, und ein aktiver Filter zeigt sich als Zeile mit
 * „zurücksetzen".
 */

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';
import { Button } from '../../lib/ui/Button';
import { Icon } from '../../lib/ui/Icon';
import { inputClass } from '../../lib/ui/Field';

export interface ListToolbarProps {
  title: string;
  /** Zurück-Link über der Überschrift, für Unterseiten. */
  back?: { href: string; label: string };
  /**
   * Die Suche. `onChange('')` beim Schließen kommt von hier — wer die Lupe
   * wieder zutippt, will nicht weiter gefiltert sein.
   */
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
  };
  /** Die Filterfelder. Was sie bedeuten, weiß die Seite; die Leiste zeigt sie nur. */
  filters?: ReactNode;
  filtersActive?: boolean;
  onResetFilters?: () => void;
  /** Symbole oder Links links von Lupe und Filter — etwa auf „Wiederkehrend". */
  links?: ReactNode;
  /** Rechts außen, etwa der Erfassen-Knopf ab `md`. */
  action?: ReactNode;
}

export function ListToolbar({
  title,
  back,
  search,
  filters,
  filtersActive = false,
  onResetFilters,
  links,
  action,
}: ListToolbarProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const leiste = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Wer die Lupe tippt, will tippen — nicht erst noch das Feld treffen.
  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    const element = leiste.current;
    if (!element) return;

    const melden = () => {
      document.documentElement.style.setProperty(
        '--list-toolbar-h',
        `${Math.round(element.getBoundingClientRect().height)}px`,
      );
    };
    melden();

    const beobachter = new ResizeObserver(melden);
    beobachter.observe(element);
    return () => {
      beobachter.disconnect();
      // Ohne das Aufräumen behielte die nächste Seite ohne Leiste den Wert,
      // und ihr Datumskopf klebte 100 px zu tief.
      document.documentElement.style.removeProperty('--list-toolbar-h');
    };
  }, []);

  function schliesseSuche() {
    search?.onChange('');
    setSearchOpen(false);
  }

  return (
    <div
      ref={leiste}
      className={[
        'sticky top-[env(safe-area-inset-top)] z-30',
        '-mx-4 px-4 md:-mx-8 md:px-8',
        'border-b border-line bg-surface/85 backdrop-blur-md',
      ].join(' ')}
    >
      {back && (
        <Link href={back.href} className="mt-2 block text-sm text-accent hover:underline">
          ← {back.label}
        </Link>
      )}
      <div className="flex items-center justify-between gap-2 py-3">
        <h1 className="min-w-0 truncate text-xl font-medium">{title}</h1>
        <div className="flex shrink-0 items-center gap-1">
          {links}
          {search && (
            <Button
              variant="ghost"
              size="sm"
              className="px-2.5"
              aria-label="Suchen"
              aria-expanded={searchOpen}
              onClick={() => (searchOpen ? schliesseSuche() : setSearchOpen(true))}
            >
              <Icon icon={Search} size={20} />
            </Button>
          )}
          {filters && (
            <Button
              variant="ghost"
              size="sm"
              className={`px-2.5 ${filtersActive ? 'text-accent' : ''}`}
              aria-label="Filter"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <Icon icon={SlidersHorizontal} size={20} />
            </Button>
          )}
          {action}
        </div>
      </div>

      {searchOpen && search && (
        <div className="pb-3">
          {/*
            Kein eigenes ✕ daneben: `type="search"` bringt schon eines zum
            Leeren mit, und geschlossen wird über dieselbe Lupe, die geöffnet
            hat.
          */}
          <input
            ref={searchRef}
            className={inputClass}
            value={search.value}
            onChange={(event) => search.onChange(event.target.value)}
            placeholder={search.placeholder}
            type="search"
            aria-label="Suche"
          />
        </div>
      )}

      {filtersOpen && filters && <div className="pb-3">{filters}</div>}

      {!filtersOpen && filtersActive && (
        <p className="pb-3 text-sm text-ink-muted">
          Filter aktiv
          {onResetFilters && (
            <>
              {' · '}
              <button
                type="button"
                className="text-accent hover:underline"
                onClick={onResetFilters}
              >
                zurücksetzen
              </button>
            </>
          )}
        </p>
      )}
    </div>
  );
}
