'use client';

/**
 * Suchen und Filtern über einer Buchungsliste.
 *
 * Stand vorher als 30 Zeilen `useMemo` in `app/buchungen/page.tsx` und fehlte
 * auf der Topf-Detailseite ganz — die zeigt aber dieselbe Liste. Zweimal
 * geschrieben wäre es zweimal zu ändern, und die zweite Fassung wäre die
 * schlechtere.
 *
 * Die Periode gehört **nicht** hierher: Sie ist keine Einschränkung der
 * Liste, sondern deren Bezugsrahmen (jede Seite hat einen eigenen
 * `PeriodSwitcher`). Was hier hereinkommt, ist schon die Liste einer Periode.
 */

import { useCallback, useMemo, useState } from 'react';
import { hasTag } from '../../lib/domain/tags';
import type { Entry, EntryKind } from '../../lib/domain/types';

export type KindFilter = EntryKind | 'all';

/** `'all'` = kein Filter, `'none'` = ausdrücklich ohne Topf bzw. ohne Tag. */
export type PotFilter = string;
export type TagFilter = string;

export interface EntryFilters {
  kind: KindFilter;
  setKind: (value: KindFilter) => void;
  pot: PotFilter;
  setPot: (value: PotFilter) => void;
  tag: TagFilter;
  setTag: (value: TagFilter) => void;
  search: string;
  setSearch: (value: string) => void;
  /** Ob ein Filter gesetzt ist — die Suche zählt nicht mit, die sieht man. */
  active: boolean;
  reset: () => void;
  /** Die Buchungen, die durchkommen. */
  visible: Entry[];
}

export function useEntryFilters(entries: readonly Entry[]): EntryFilters {
  const [kind, setKind] = useState<KindFilter>('all');
  const [pot, setPot] = useState<PotFilter>('all');
  const [tag, setTag] = useState<TagFilter>('all');
  const [search, setSearch] = useState('');

  const visible = useMemo(() => {
    let gefiltert = [...entries];
    if (kind !== 'all') gefiltert = gefiltert.filter((entry) => entry.kind === kind);

    if (pot === 'none') gefiltert = gefiltert.filter((entry) => entry.potId === null);
    else if (pot !== 'all') gefiltert = gefiltert.filter((entry) => entry.potId === pot);

    if (tag === 'none') gefiltert = gefiltert.filter((entry) => (entry.tags ?? []).length === 0);
    else if (tag !== 'all') gefiltert = gefiltert.filter((entry) => hasTag(entry.tags, tag));

    const needle = search.trim().toLowerCase();
    if (needle !== '') {
      gefiltert = gefiltert.filter(
        (entry) =>
          (entry.note ?? '').toLowerCase().includes(needle) ||
          (entry.merchant ?? '').toLowerCase().includes(needle),
      );
    }
    return gefiltert;
  }, [entries, kind, pot, tag, search]);

  const reset = useCallback(() => {
    setKind('all');
    setPot('all');
    setTag('all');
  }, []);

  return {
    kind,
    setKind,
    pot,
    setPot,
    tag,
    setTag,
    search,
    setSearch,
    active: kind !== 'all' || pot !== 'all' || tag !== 'all',
    reset,
    visible,
  };
}
