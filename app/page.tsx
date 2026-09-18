'use client';

/**
 * Startseite „Heute“.
 *
 * Eine Seite, eine Aufgabe: sehen, was in den Töpfen noch übrig ist. Sonst
 * nichts.
 *
 * Die Kennzahlen Ausgaben/Einnahmen/Saldo standen hier früher als Karte —
 * sie stehen identisch auf der Auswertungsseite, und wer sie sucht, geht
 * ohnehin dorthin. Der Erfassen-Knopf ist mobil in den schwebenden Knopf
 * gewandert; auf dem Desktop bleibt er, weil es dort keinen gibt.
 */

import { useMemo, useState } from 'react';
import { EntrySheet } from '../components/entries/EntrySheet';
import { PeriodSwitcher } from '../components/PeriodSwitcher';
import { PotRow } from '../components/pots/PotRow';
import { PotWizard } from '../components/pots/PotWizard';
import { useCan } from '../lib/auth/provider';
import { useSnapshot } from '../lib/data/provider';
import { todayIso } from '../lib/domain/dates';
import { computePotStates } from '../lib/domain/ledger';
import { periodForDate } from '../lib/domain/period';
import { Button } from '../lib/ui/Button';
import { Card } from '../lib/ui/Card';
import { EmptyState } from '../lib/ui/EmptyState';
import { useFormat } from '../lib/ui/useFormat';

export default function HomePage() {
  const snapshot = useSnapshot();
  const format = useFormat();
  const can = useCan();

  const currentKey = useMemo(
    () => periodForDate(todayIso(), format.periodStartDay).key,
    [format.periodStartDay],
  );
  const [periodKey, setPeriodKey] = useState(currentKey);
  const [entryOpen, setEntryOpen] = useState(false);
  const [potWizardOpen, setPotWizardOpen] = useState(false);

  const activePots = useMemo(
    () => snapshot.pots.filter((pot) => pot.archivedAt === null),
    [snapshot.pots],
  );

  const states = useMemo(
    () => computePotStates(activePots, snapshot.entries, periodKey, format.periodStartDay),
    [activePots, snapshot.entries, periodKey, format.periodStartDay],
  );

  return (
    <div className="flex flex-col gap-4">
      <PeriodSwitcher periodKey={periodKey} onChange={setPeriodKey} currentKey={currentKey} />

      {/* Der große Erfassen-Knopf nur ab md — mobil macht das der schwebende. */}
      {can('entry.create') && activePots.length > 0 && (
        <div className="hidden md:block">
          <Button variant="primary" size="lg" block onClick={() => setEntryOpen(true)}>
            Ausgabe erfassen
          </Button>
        </div>
      )}

      <Card>
        {activePots.length === 0 ? (
          <EmptyState
            icon="◫"
            title="Noch keine Töpfe"
            hint="Ein Topf sammelt Ausgaben eines Bereichs — etwa Lebensmittel oder Sport."
            action={
              can('pot.create') ? (
                <Button variant="primary" onClick={() => setPotWizardOpen(true)}>
                  Ersten Topf anlegen
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <ul className="divide-y divide-[var(--border)]">
              {activePots.map((pot, index) => {
                const state = states[index];
                if (!state) return null;
                return (
                  <li key={pot.id}>
                    <PotRow pot={pot} state={state} />
                  </li>
                );
              })}
            </ul>
            {/*
              Der Weg zum nächsten Topf. Mobil führt kein Navigationseintrag
              mehr auf die Topf-Seite — ohne diese Zeile ließe sich dort kein
              zweiter Topf mehr anlegen.
            */}
            {can('pot.create') && (
              <button
                type="button"
                onClick={() => setPotWizardOpen(true)}
                className="flex w-full items-center gap-3 border-t border-line px-4 py-3 text-left text-ink-muted hover:bg-subtle hover:text-ink"
              >
                <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center text-lg">
                  +
                </span>
                Neuer Topf
              </button>
            )}
          </>
        )}
      </Card>

      <EntrySheet open={entryOpen} onClose={() => setEntryOpen(false)} pots={activePots} />
      <PotWizard open={potWizardOpen} onClose={() => setPotWizardOpen(false)} />
    </div>
  );
}
