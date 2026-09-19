'use client';

/**
 * Buchungsliste, nach Monat und darin nach Tag gruppiert.
 *
 * Gruppierung statt einer flachen Liste mit Datum in jeder Zeile: In einer
 * Woche mit zwanzig Buchungen ist „welcher Tag war das?“ die häufigste Frage.
 *
 * **Beide Köpfe kleben**, und sie kleben übereinander: der Monat unter der
 * Werkzeugleiste, der Tag unter dem Monat. Vorher scrollte der Monat weg,
 * und in einer langen Liste stand dann „14. September" ohne Jahr und ohne
 * Monat darüber — man musste hochscrollen, um zu wissen, wo man ist.
 *
 * Zwei Klebezeilen sind das Maximum. Sie kosten zusammen rund 3,3 rem über
 * der Liste; eine dritte Ebene wäre bei 320 px mehr Kopf als Inhalt.
 */

import { useMemo, useState } from 'react';
import { useSnapshot } from '../../lib/data/provider';
import type { Entry, Pot } from '../../lib/domain/types';
import { EmptyState } from '../../lib/ui/EmptyState';
import { potColorVar } from '../../lib/ui/colors';
import { useFormat } from '../../lib/ui/useFormat';
import { EntrySheet } from './EntrySheet';

export function EntryList({
  entries,
  pots,
  emptyHint,
}: {
  entries: readonly Entry[];
  pots: readonly Pot[];
  emptyHint: string;
}) {
  const format = useFormat();
  const snapshot = useSnapshot();
  const [editing, setEditing] = useState<Entry | null>(null);

  const potsById = useMemo(() => new Map(pots.map((pot) => [pot.id, pot])), [pots]);
  const receiptCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const receipt of snapshot.receipts) {
      counts.set(receipt.entryId, (counts.get(receipt.entryId) ?? 0) + 1);
    }
    return counts;
  }, [snapshot.receipts]);

  /**
   * Belege und Umfang eines aufgeteilten Einkaufs.
   *
   * Der Beleg hängt an einer der Buchungen; die übrigen desselben Einkaufs
   * sollen ihn trotzdem anzeigen, sonst sucht man ihn bei der falschen Zeile.
   */
  const splitGroups = useMemo(() => {
    const info = new Map<string, { count: number; receipts: number }>();
    for (const entry of snapshot.entries) {
      if (!entry.splitGroupId) continue;
      const bisher = info.get(entry.splitGroupId) ?? { count: 0, receipts: 0 };
      bisher.count += 1;
      bisher.receipts += receiptCounts.get(entry.id) ?? 0;
      info.set(entry.splitGroupId, bisher);
    }
    return info;
  }, [snapshot.entries, receiptCounts]);

  /**
   * Monate, jeder mit seinen Tagen — beide absteigend sortiert.
   *
   * Der Monatsschlüssel ist `date.slice(0, 7)`: Bei ISO-Datumsangaben sortiert
   * die Zeichenkette wie das Datum, deshalb reicht `localeCompare` und es
   * braucht kein `Date`.
   */
  const months = useMemo(() => {
    const byMonth = new Map<string, Map<string, Entry[]>>();
    for (const entry of entries) {
      const monthKey = entry.date.slice(0, 7);
      let days = byMonth.get(monthKey);
      if (!days) {
        days = new Map();
        byMonth.set(monthKey, days);
      }
      const list = days.get(entry.date);
      if (list) list.push(entry);
      else days.set(entry.date, [entry]);
    }
    return [...byMonth.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([monthKey, days]) => ({
        monthKey,
        days: [...days.entries()].sort((a, b) => b[0].localeCompare(a[0])),
      }));
  }, [entries]);

  if (entries.length === 0) {
    return <EmptyState icon="≡" title="Keine Buchungen" hint={emptyHint} />;
  }

  return (
    <>
      <ul>
        {months.map(({ monthKey, days }) => (
          <li key={monthKey}>
            {/*
              Klebt unter der Werkzeugleiste, nicht am Fensterrand: Deren Höhe
              steht als `--list-toolbar-h` am Wurzelelement (gesetzt von
              `components/lists/ListToolbar.tsx`, und sie ändert sich, sobald
              Suche oder Filter aufklappen). Ohne den Versatz verschwände der
              Kopf hinter der Leiste. Der Rückfall `0px` gilt auf Seiten ohne
              Leiste; der Sicherheitsbereich kommt in beiden Fällen dazu, damit
              als installierte App nichts unter der Statusleiste klebt.

              Beschriftet wird mit dem neuesten Tag des Monats — `format.month`
              braucht ein vollständiges Datum, und der liegt hier ohnehin vor.
            */}
            <p className="sticky top-[calc(var(--list-toolbar-h,0px)+env(safe-area-inset-top))] z-20 h-[var(--month-head-h)] border-y border-line bg-accent-subtle px-4 py-1.5 text-xs font-semibold text-ink">
              {format.month(days[0]![0])}
            </p>
            <ul>
              {days.map(([date, dayEntries]) => (
                <li key={date}>
                  {/*
                    Klebt unter dem Monatskopf, nicht unter der Leiste — sonst
                    lägen beide aufeinander. `--month-head-h` ist ein fester
                    Wert aus `app/globals.css`; anders als bei der
                    Werkzeugleiste geht das hier, weil dieser Kopf immer genau
                    eine Zeile ist und nicht aufklappen kann.
                  */}
                  <p className="sticky top-[calc(var(--list-toolbar-h,0px)+env(safe-area-inset-top)+var(--month-head-h))] z-10 border-y border-line bg-subtle px-4 py-1.5 text-xs font-medium text-ink-muted">
                    {format.day(date)}
                  </p>
                  <ul className="divide-y divide-[var(--border)]">
                    {dayEntries.map((entry) => {
                      const pot = entry.potId ? potsById.get(entry.potId) : null;
                      const split = entry.splitGroupId ? splitGroups.get(entry.splitGroupId) : null;
                      const receiptCount = split
                        ? split.receipts
                        : (receiptCounts.get(entry.id) ?? 0);
                      return (
                        <li key={entry.id}>
                          <button
                            type="button"
                            onClick={() => setEditing(entry)}
                            className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-subtle"
                          >
                            <span
                              aria-hidden
                              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-base"
                              style={{
                                background: pot
                                  ? `color-mix(in oklch, ${potColorVar(pot.color)} 18%, transparent)`
                                  : 'var(--bg-subtle)',
                              }}
                            >
                              {pot?.icon ?? (entry.kind === 'income' ? '↓' : '–')}
                            </span>

                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium">
                                {entry.merchant ||
                                  entry.note ||
                                  pot?.name ||
                                  (entry.kind === 'income' ? 'Einnahme' : 'Ausgabe')}
                              </span>
                              <span className="block truncate text-xs text-ink-muted">
                                {[
                                  pot?.name ?? 'ohne Topf',
                                  // Tags in dieselbe Zeile und nicht als eigene
                                  // Marken: Die Liste soll bei 320 px nicht in die
                                  // Höhe wachsen, und hier zählt „welcher Tag war
                                  // das", nicht das Bearbeiten.
                                  (entry.tags ?? []).length > 0
                                    ? (entry.tags ?? []).map((tag) => `#${tag}`).join(' ')
                                    : null,
                                  entry.recurringRuleId ? 'wiederkehrend' : null,
                                  split && split.count > 1
                                    ? `Einkauf mit ${split.count} Buchungen`
                                    : null,
                                  receiptCount > 0
                                    ? `${receiptCount} Beleg${receiptCount > 1 ? 'e' : ''}`
                                    : null,
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </span>
                            </span>

                            <span
                              className={[
                                'tabular shrink-0 font-semibold',
                                entry.kind === 'income' ? 'text-positive' : '',
                              ].join(' ')}
                            >
                              {entry.kind === 'income' ? '+' : '−'}
                              {format.money(entry.amountCents)}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      <EntrySheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        pots={pots}
        entry={editing}
      />
    </>
  );
}
