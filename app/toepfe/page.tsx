'use client';

import { useMemo, useState } from 'react';
import { PeriodSwitcher } from '../../components/PeriodSwitcher';
import { PotRow } from '../../components/pots/PotRow';
import { PotWizard } from '../../components/pots/PotWizard';
import { useCan } from '../../lib/auth/provider';
import { useSnapshot } from '../../lib/data/provider';
import { todayIso } from '../../lib/domain/dates';
import { computePotStates } from '../../lib/domain/ledger';
import { periodForDate } from '../../lib/domain/period';
import { Button } from '../../lib/ui/Button';
import { Card, CardHeader } from '../../lib/ui/Card';
import { EmptyState } from '../../lib/ui/EmptyState';
import { useFormat } from '../../lib/ui/useFormat';

export default function PotsPage() {
  const snapshot = useSnapshot();
  const format = useFormat();
  const can = useCan();

  const currentKey = useMemo(
    () => periodForDate(todayIso(), format.periodStartDay).key,
    [format.periodStartDay],
  );
  const [periodKey, setPeriodKey] = useState(currentKey);
  const [wizardOpen, setWizardOpen] = useState(false);

  const active = useMemo(
    () => snapshot.pots.filter((pot) => pot.archivedAt === null),
    [snapshot.pots],
  );
  const archived = useMemo(
    () => snapshot.pots.filter((pot) => pot.archivedAt !== null),
    [snapshot.pots],
  );

  const activeStates = useMemo(
    () => computePotStates(active, snapshot.entries, periodKey, format.periodStartDay),
    [active, snapshot.entries, periodKey, format.periodStartDay],
  );
  const archivedStates = useMemo(
    () => computePotStates(archived, snapshot.entries, periodKey, format.periodStartDay),
    [archived, snapshot.entries, periodKey, format.periodStartDay],
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-medium">Töpfe</h1>
        {can('pot.create') && (
          <Button variant="primary" size="sm" onClick={() => setWizardOpen(true)}>
            + Neuer Topf
          </Button>
        )}
      </div>

      <Card className="px-4 py-3">
        <PeriodSwitcher periodKey={periodKey} onChange={setPeriodKey} currentKey={currentKey} />
      </Card>

      <Card>
        {active.length === 0 ? (
          <EmptyState
            icon="◫"
            title="Keine aktiven Töpfe"
            hint="Lege einen Topf an, um Ausgaben zuordnen zu können."
            action={
              can('pot.create') ? (
                <Button variant="primary" onClick={() => setWizardOpen(true)}>
                  Topf anlegen
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {active.map((pot, index) => {
              const state = activeStates[index];
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

      {archived.length > 0 && (
        <Card>
          <CardHeader title="Archiviert" />
          <ul className="divide-y divide-[var(--border)] opacity-60">
            {archived.map((pot, index) => {
              const state = archivedStates[index];
              if (!state) return null;
              return (
                <li key={pot.id}>
                  <PotRow pot={pot} state={state} />
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <PotWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
    </div>
  );
}
