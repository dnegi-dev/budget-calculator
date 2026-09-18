'use client';

/**
 * Buchungsliste mit Filtern.
 *
 * Mobil liegen Suche und Filter hinter je einem Symbol: Die oberste Zeile
 * gehört der Liste, nicht der Bedienung. Ab Tablet-Breite stehen sie
 * aufgeklappt in einer Karte, weil dort der Platz da ist und typischerweise
 * die Auswertung gemacht wird.
 *
 * Eingeklappt und trotzdem wirksam wäre ein Filter, den niemand sieht.
 * Deshalb räumt das Schließen der Suche den Suchbegriff weg, und ein aktiver
 * Filter zeigt sich als Zeile mit „zurücksetzen“.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { EntryList } from '../../components/entries/EntryList';
import { EntrySheet } from '../../components/entries/EntrySheet';
import { PeriodSwitcher } from '../../components/PeriodSwitcher';
import { useCan } from '../../lib/auth/provider';
import { useSnapshot } from '../../lib/data/provider';
import { todayIso } from '../../lib/domain/dates';
import { entriesInPeriod } from '../../lib/domain/ledger';
import { periodForDate } from '../../lib/domain/period';
import { collectTags, hasTag } from '../../lib/domain/tags';
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
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [entryOpen, setEntryOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Wer die Lupe tippt, will tippen — nicht erst noch das Feld treffen.
  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  const activePots = useMemo(
    () => snapshot.pots.filter((pot) => pot.archivedAt === null),
    [snapshot.pots],
  );

  const tagsEnabled = snapshot.household?.tagsEnabled ?? false;
  /**
   * Alle benutzten Tags, nicht nur die der gewählten Periode: Wer nach
   * „Urlaub" filtert, will die Periode finden, in der etwas drinsteht — und
   * nicht erst raten, in welcher der Tag auftaucht.
   */
  const alleTags = useMemo(
    () => collectTags(snapshot.entries).map((usage) => usage.tag),
    [snapshot.entries],
  );

  const visible = useMemo(() => {
    let entries = entriesInPeriod(snapshot.entries, periodKey, format.periodStartDay);
    if (kindFilter !== 'all') entries = entries.filter((entry) => entry.kind === kindFilter);
    if (potFilter === 'none') entries = entries.filter((entry) => entry.potId === null);
    else if (potFilter !== 'all') entries = entries.filter((entry) => entry.potId === potFilter);

    if (tagFilter === 'none') entries = entries.filter((entry) => (entry.tags ?? []).length === 0);
    else if (tagFilter !== 'all')
      entries = entries.filter((entry) => hasTag(entry.tags, tagFilter));

    const needle = search.trim().toLowerCase();
    if (needle !== '') {
      entries = entries.filter(
        (entry) =>
          (entry.note ?? '').toLowerCase().includes(needle) ||
          (entry.merchant ?? '').toLowerCase().includes(needle),
      );
    }
    return entries;
  }, [
    snapshot.entries,
    periodKey,
    format.periodStartDay,
    kindFilter,
    potFilter,
    tagFilter,
    search,
  ]);

  const total = useMemo(
    () =>
      visible.reduce(
        (sum, entry) => sum + (entry.kind === 'income' ? entry.amountCents : -entry.amountCents),
        0,
      ),
    [visible],
  );

  const filtersActive = kindFilter !== 'all' || potFilter !== 'all' || tagFilter !== 'all';

  function closeSearch() {
    setSearch('');
    setSearchOpen(false);
  }

  function resetFilters() {
    setKindFilter('all');
    setPotFilter('all');
    setTagFilter('all');
  }

  /**
   * Zweimal im Baum, einmal sichtbar — mobil aufgeklappt, ab `md` in der
   * Karte. Nur die mobile Fassung bekommt die Referenz: Sonst zeigte sie auf
   * das per CSS verborgene Feld, und der Fokus nach dem Tippen auf die Lupe
   * ginge ins Leere.
   */
  const searchField = (withRef: boolean) => (
    <input
      ref={withRef ? searchRef : undefined}
      className={inputClass}
      value={search}
      onChange={(event) => setSearch(event.target.value)}
      placeholder="In Notiz und Ort suchen"
      type="search"
      aria-label="Suche"
    />
  );

  const filterFields = (
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
      {/* Ohne benutzte Tags gibt es nichts zu filtern — dann auch kein Feld. */}
      {tagsEnabled && alleTags.length > 0 && (
        <select
          className={selectClass}
          value={tagFilter}
          onChange={(event) => setTagFilter(event.target.value)}
          aria-label="Tag"
        >
          <option value="all">Alle Tags</option>
          <option value="none">Ohne Tag</option>
          {alleTags.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-medium">Buchungen</h1>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="px-2.5 text-base md:hidden"
            aria-label="Suchen"
            aria-expanded={searchOpen}
            onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
          >
            <span aria-hidden>🔍</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`px-2.5 text-base md:hidden ${filtersActive ? 'text-accent' : ''}`}
            aria-label="Filter"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <span aria-hidden>⚙</span>
          </Button>
          {/*
            Erfassen nur ab md: mobil macht das der schwebende Knopf.

            Das `hidden` gehört an die Hülle, nicht an den Knopf: `Button`
            bringt `inline-flex` als Grundklasse mit, und Tailwind gibt
            `.inline-flex` **nach** `.hidden` aus — an der Klassenliste des
            Knopfes gewinnt also `inline-flex`, und der Knopf wäre mobil
            trotzdem da. (`md:hidden` funktioniert umgekehrt schon, weil es in
            einer Media-Query steht.)
          */}
          {can('entry.create') && (
            <span className="hidden md:inline-flex">
              <Button variant="primary" size="sm" onClick={() => setEntryOpen(true)}>
                + Erfassen
              </Button>
            </span>
          )}
        </div>
      </div>

      <Card className="px-4 py-3">
        <PeriodSwitcher periodKey={periodKey} onChange={setPeriodKey} currentKey={currentKey} />
      </Card>

      {/* Mobil: Suche und Filter auf Wunsch. Desktop: eine Karte mit beidem. */}
      <div className="flex flex-col gap-3 md:hidden">
        {/*
          Kein eigenes ✕ daneben: `type="search"` bringt schon eines zum Leeren
          mit, und geschlossen wird über dieselbe Lupe, die geöffnet hat. Zwei
          Kreuze nebeneinander haben bei 390 px nur Platz gekostet.
        */}
        {searchOpen && searchField(true)}
        {filtersOpen && filterFields}
        {!filtersOpen && filtersActive && (
          <p className="text-sm text-ink-muted">
            Filter aktiv ·{' '}
            <button type="button" className="text-accent hover:underline" onClick={resetFilters}>
              zurücksetzen
            </button>
          </p>
        )}
      </div>
      <Card className="hidden px-4 py-4 md:block">
        <div className="flex flex-col gap-3">
          {filterFields}
          {searchField(false)}
        </div>
      </Card>

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

      <Card>
        <div className="px-4 py-3.5">
          <Link href="/buchungen/wiederkehrend" className="text-sm text-accent hover:underline">
            Wiederkehrende Buchungen →
          </Link>
        </div>
      </Card>

      <EntrySheet open={entryOpen} onClose={() => setEntryOpen(false)} pots={activePots} />
    </div>
  );
}
