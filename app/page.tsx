'use client';

/**
 * Startseite „Heute“.
 *
 * Bewusst karg: Periode, ein Knopf, die Töpfe. Alles andere (Auswertung,
 * Verlauf, Einstellungen) hat eigene Seiten. Wer die App öffnet, will in der
 * Regel genau zwei Dinge — etwas eintragen oder sehen, was noch übrig ist.
 */

import { useMemo, useState } from 'react';
import { EntrySheet } from '../components/entries/EntrySheet';
import { PeriodSwitcher } from '../components/PeriodSwitcher';
import { PotRow } from '../components/pots/PotRow';
import { PotWizard } from '../components/pots/PotWizard';
import { useCan } from '../lib/auth/provider';
import { useSnapshot } from '../lib/data/provider';
import { todayIso } from '../lib/domain/dates';
import { computeHouseholdSummary, computePotStates } from '../lib/domain/ledger';
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

  const summary = useMemo(
    () => computeHouseholdSummary(snapshot.pots, snapshot.entries, periodKey, format.periodStartDay),
    [snapshot.pots, snapshot.entries, periodKey, format.periodStartDay],
  );

  return (
    <div className="flex flex-col gap-5">
      <Card className="px-4 py-4">
        <PeriodSwitcher periodKey={periodKey} onChange={setPeriodKey} currentKey={currentKey} />
        <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
          <div>
            <dt className="text-xs text-ink-muted">Ausgaben</dt>
            <dd className="tabular mt-0.5 font-semibold">{format.moneyCompact(summary.expenseCents)}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">Einnahmen</dt>
            <dd className="tabular mt-0.5 font-semibold">{format.moneyCompact(summary.incomeCents)}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">Saldo</dt>
            <dd
              className={[
                'tabular mt-0.5 font-semibold',
                summary.balanceCents < 0 ? 'text-negative' : 'text-positive',
              ].join(' ')}
            >
              {format.moneyCompact(summary.balanceCents)}
            </dd>
          </div>
        </dl>
      </Card>

      {can('entry.create') && (
        <Button variant="primary" size="lg" block onClick={() => setEntryOpen(true)}>
          Ausgabe erfassen
        </Button>
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
        )}
      </Card>

      <EntrySheet open={entryOpen} onClose={() => setEntryOpen(false)} pots={activePots} />
      <PotWizard open={potWizardOpen} onClose={() => setPotWizardOpen(false)} />
    </div>
  );
}
