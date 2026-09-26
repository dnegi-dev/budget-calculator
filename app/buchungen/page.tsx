'use client';

/**
 * Buchungsliste mit Filtern.
 *
 * Suche und Filter liegen in der klebenden Leiste über der Liste
 * (`ListToolbar`) — beim Scrollen bleiben sie erreichbar, und genau darum
 * geht es: In einer Liste mit zweihundert Zeilen ist Suchen das, was man
 * unten braucht, nicht oben.
 *
 * Das Symbol zu den wiederkehrenden Buchungen stand hier auch einmal. Es ist
 * weg: Eine Regel legt man einmal an und sieht sie jahrelang nicht wieder —
 * der Platz in der Leiste ist für das da, was täglich gebraucht wird. Der
 * Weg führt jetzt über die Einstellungen.
 *
 * Das Filtern selbst steckt in `useEntryFilters`, weil die Topf-Detailseite
 * dieselbe Liste zeigt.
 */

import { useMemo, useState } from 'react';
import { EntryFilterFields } from '../../components/lists/EntryFilterFields';
import { ListToolbar } from '../../components/lists/ListToolbar';
import { useEntryFilters } from '../../components/lists/useEntryFilters';
import { EntryList } from '../../components/entries/EntryList';
import { EntrySheet } from '../../components/entries/EntrySheet';
import { PeriodSwitcher } from '../../components/PeriodSwitcher';
import { useCan } from '../../lib/auth/provider';
import { useSnapshot } from '../../lib/data/provider';
import { todayIso } from '../../lib/domain/dates';
import { entriesInPeriod } from '../../lib/domain/ledger';
import { periodForDate } from '../../lib/domain/period';
import { bookablePots } from '../../lib/domain/pot-kinds';
import { collectTags } from '../../lib/domain/tags';
import { Button } from '../../lib/ui/Button';
import { Card, CardHeader } from '../../lib/ui/Card';
import { useFormat } from '../../lib/ui/useFormat';
import { signedCents, sumCents } from '../../lib/domain/money';

export default function EntriesPage() {
  const snapshot = useSnapshot();
  const format = useFormat();
  const can = useCan();

  const currentKey = useMemo(
    () => periodForDate(todayIso(), format.periodStartDay).key,
    [format.periodStartDay],
  );
  const [periodKey, setPeriodKey] = useState(currentKey);
  const [entryOpen, setEntryOpen] = useState(false);

  const activePots = useMemo(() => bookablePots(snapshot.pots), [snapshot.pots]);

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

  const derPeriode = useMemo(
    () => entriesInPeriod(snapshot.entries, periodKey, format.periodStartDay),
    [snapshot.entries, periodKey, format.periodStartDay],
  );
  const filters = useEntryFilters(derPeriode);
  const visible = filters.visible;

  const total = useMemo(
    () => sumCents(visible.map((entry) => signedCents(entry.kind, entry.amountCents))),
    [visible],
  );

  return (
    <div className="flex flex-col gap-5">
      <ListToolbar
        title="Buchungen"
        search={{
          value: filters.search,
          onChange: filters.setSearch,
          placeholder: 'In Notiz und Ort suchen',
        }}
        filters={
          <EntryFilterFields
            filters={filters}
            pots={snapshot.pots}
            tags={alleTags}
            tagsEnabled={tagsEnabled}
          />
        }
        filtersActive={filters.active}
        onResetFilters={filters.reset}
        action={
          /*
            Erfassen nur ab md: mobil macht das der schwebende Knopf.

            Das `hidden` gehört an die Hülle, nicht an den Knopf: `Button`
            bringt `inline-flex` als Grundklasse mit, und Tailwind gibt
            `.inline-flex` **nach** `.hidden` aus — an der Klassenliste des
            Knopfes gewinnt also `inline-flex`, und der Knopf wäre mobil
            trotzdem da.
          */
          can('entry.create') ? (
            <span className="hidden md:inline-flex">
              <Button variant="primary" size="sm" onClick={() => setEntryOpen(true)}>
                + Erfassen
              </Button>
            </span>
          ) : undefined
        }
      />

      <Card className="px-4 py-3">
        <PeriodSwitcher periodKey={periodKey} onChange={setPeriodKey} currentKey={currentKey} />
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

      <EntrySheet open={entryOpen} onClose={() => setEntryOpen(false)} pots={activePots} />
    </div>
  );
}
