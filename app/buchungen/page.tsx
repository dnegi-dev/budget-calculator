'use client';

/**
 * Buchungsliste mit Filtern.
 *
 * Auf dem Telefon sind die Filter eingeklappt — dort will man scrollen, nicht
 * filtern. Ab Tablet-Breite stehen sie aufgeklappt daneben, weil dort der
 * Platz da ist und typischerweise die Auswertung gemacht wird.
 */

import { useMemo, useState } from 'react';
import { EntryList } from '../../components/entries/EntryList';
import { EntrySheet } from '../../components/entries/EntrySheet';
import { PeriodSwitcher } from '../../components/PeriodSwitcher';
import { useCan } from '../../lib/auth/provider';
import { useSnapshot } from '../../lib/data/provider';
import { todayIso } from '../../lib/domain/dates';
import { entriesInPeriod } from '../../lib/domain/ledger';
import { periodForDate } from '../../lib/domain/period';
import type { EntryKind } from '../../lib/domain/types';
import { Button } from '../../lib/ui/Button';
import { Card, CardHeader } from '../../lib/ui/Card';
import { SegmentedControl } from '../../lib/ui/SegmentedControl';
import { inputClass, selectClass } from '../../lib/ui/Field';
import { useFormat } from '../../lib/ui/useFormat';

type KindFilter = EntryKind | 'all';

export default function EntriesPage() {
  const snapshot = useSnapshot();
  const format = useFormat();
  const can = useCan();

  const currentKey = useMemo(
    () => periodForDate(todayIso(), format.periodStartDay).key,
    [format.periodStartDay],
  );
  const [periodKey, setPeriodKey] = useState(currentKey);
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [potFilter, setPotFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [entryOpen, setEntryOpen] = useState(false);

  const activePots = useMemo(
    () => snapshot.pots.filter((pot) => pot.archivedAt === null),
    [snapshot.pots],
  );

  const visible = useMemo(() => {
    let entries = entriesInPeriod(snapshot.entries, periodKey, format.periodStartDay);
    if (kindFilter !== 'all') entries = entries.filter((entry) => entry.kind === kindFilter);
    if (potFilter === 'none') entries = entries.filter((entry) => entry.potId === null);
    else if (potFilter !== 'all') entries = entries.filter((entry) => entry.potId === potFilter);

    const needle = search.trim().toLowerCase();
    if (needle !== '') {
      entries = entries.filter(
        (entry) =>
          (entry.note ?? '').toLowerCase().includes(needle) ||
          (entry.merchant ?? '').toLowerCase().includes(needle),
      );
    }
    return entries;
  }, [snapshot.entries, periodKey, format.periodStartDay, kindFilter, potFilter, search]);

  const total = useMemo(
    () =>
      visible.reduce(
        (sum, entry) => sum + (entry.kind === 'income' ? entry.amountCents : -entry.amountCents),
        0,
      ),
    [visible],
  );

  const filterControls = (
    <div className="flex flex-col gap-3">
      <SegmentedControl
        label="Art"
        value={kindFilter}
        onChange={setKindFilter}
        options={[
          { value: 'all', label: 'Alle' },
          { value: 'expense', label: 'Ausgaben' },
          { value: 'income', label: 'Einnahmen' },
        ]}
      />
      <select
        className={selectClass}
        value={potFilter}
        onChange={(event) => setPotFilter(event.target.value)}
        aria-label="Topf"
      >
        <option value="all">Alle Töpfe</option>
        <option value="none">Ohne Topf</option>
        {snapshot.pots.map((pot) => (
          <option key={pot.id} value={pot.id}>
            {pot.icon} {pot.name}
          </option>
        ))}
      </select>
      <input
        className={inputClass}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="In Notiz und Ort suchen"
        type="search"
        aria-label="Suche"
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Buchungen</h1>
        {can('entry.create') && (
          <Button variant="primary" size="sm" onClick={() => setEntryOpen(true)}>
            + Erfassen
          </Button>
        )}
      </div>

      <Card className="px-4 py-3">
        <PeriodSwitcher periodKey={periodKey} onChange={setPeriodKey} currentKey={currentKey} />
      </Card>

      {/* Mobil: Filter auf Wunsch. Desktop: immer sichtbar. */}
      <div className="md:hidden">
        <Button variant="secondary" block onClick={() => setFiltersOpen((open) => !open)}>
          {filtersOpen ? 'Filter ausblenden' : 'Filtern und suchen'}
        </Button>
        {filtersOpen && <div className="mt-3">{filterControls}</div>}
      </div>
      <Card className="hidden px-4 py-4 md:block">{filterControls}</Card>

      <Card>
        <CardHeader
          title={`${visible.length} Buchung${visible.length === 1 ? '' : 'en'}`}
          action={
            <span
              className={`tabular text-sm font-semibold ${total < 0 ? 'text-negative' : 'text-positive'}`}
            >
              {format.moneyCompact(total)}
            </span>
          }
        />
        <EntryList
          entries={visible}
          pots={snapshot.pots}
          emptyHint="In dieser Periode gibt es keine Buchungen, die zu den Filtern passen."
        />
      </Card>

      <EntrySheet open={entryOpen} onClose={() => setEntryOpen(false)} pots={activePots} />
    </div>
  );
}
