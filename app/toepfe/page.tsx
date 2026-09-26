'use client';

/**
 * Topf-Übersicht.
 *
 * Suche und der Filter aktiv/archiviert liegen in der klebenden Leiste. Bei
 * zwanzig Töpfen ist das Suchfeld der kürzere Weg als das Auge, und beim
 * Scrollen bleibt es erreichbar.
 */

import { useMemo, useState } from 'react';
import { ListToolbar } from '../../components/lists/ListToolbar';
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
import { Wallet } from 'lucide-react';
import { Icon } from '../../lib/ui/Icon';
import { EmptyState } from '../../lib/ui/EmptyState';
import { SegmentedControl } from '../../lib/ui/SegmentedControl';
import { useFormat } from '../../lib/ui/useFormat';
import { matchesQuery } from '../../lib/domain/search';

type Bereich = 'all' | 'active' | 'archived';

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
  const [suche, setSuche] = useState('');
  const [bereich, setBereich] = useState<Bereich>('all');

  const gefunden = useMemo(() => {
    return snapshot.pots.filter((pot) => matchesQuery(suche, pot.name));
  }, [snapshot.pots, suche]);

  const active = useMemo(
    () => (bereich === 'archived' ? [] : gefunden.filter((pot) => pot.archivedAt === null)),
    [gefunden, bereich],
  );
  const archived = useMemo(
    () => (bereich === 'active' ? [] : gefunden.filter((pot) => pot.archivedAt !== null)),
    [gefunden, bereich],
  );

  const activeStates = useMemo(
    () => computePotStates(active, snapshot.entries, periodKey, format.periodStartDay),
    [active, snapshot.entries, periodKey, format.periodStartDay],
  );
  const archivedStates = useMemo(
    () => computePotStates(archived, snapshot.entries, periodKey, format.periodStartDay),
    [archived, snapshot.entries, periodKey, format.periodStartDay],
  );

  const sucht = suche.trim() !== '';

  return (
    <div className="flex flex-col gap-5">
      <ListToolbar
        title="Töpfe"
        search={{ value: suche, onChange: setSuche, placeholder: 'Topf suchen' }}
        filters={
          <SegmentedControl
            label="Töpfe zeigen"
            value={bereich}
            onChange={setBereich}
            options={[
              { value: 'all', label: 'Alle' },
              { value: 'active', label: 'Aktiv' },
              { value: 'archived', label: 'Archiviert' },
            ]}
          />
        }
        filtersActive={bereich !== 'all'}
        onResetFilters={() => setBereich('all')}
        action={
          can('pot.create') ? (
            <Button variant="primary" size="sm" onClick={() => setWizardOpen(true)}>
              + Neuer Topf
            </Button>
          ) : undefined
        }
      />

      <Card className="px-4 py-3">
        <PeriodSwitcher periodKey={periodKey} onChange={setPeriodKey} currentKey={currentKey} />
      </Card>

      {bereich !== 'archived' && (
        <Card>
          {active.length === 0 ? (
            <EmptyState
              icon={<Icon icon={Wallet} size={30} />}
              title={sucht ? 'Kein Topf gefunden' : 'Keine aktiven Töpfe'}
              hint={
                sucht
                  ? 'Kein aktiver Topf trägt diesen Namen.'
                  : 'Lege einen Topf an, um Ausgaben zuordnen zu können.'
              }
              action={
                can('pot.create') && !sucht ? (
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
      )}

      {/*
        Archivierte Töpfe stehen sonst nur da, wenn es welche gibt — wer
        ausdrücklich danach filtert, soll aber auch die Antwort „keine"
        bekommen und nicht eine leere Seite.
      */}
      {(bereich === 'archived' || archived.length > 0) && (
        <Card>
          <CardHeader title="Archiviert" />
          {archived.length === 0 ? (
            <EmptyState
              icon={<Icon icon={Wallet} size={30} />}
              title={sucht ? 'Kein Topf gefunden' : 'Nichts archiviert'}
              hint={
                sucht
                  ? 'Kein archivierter Topf trägt diesen Namen.'
                  : 'Archivierte Töpfe behalten ihre Zahlen, tauchen aber beim Erfassen nicht mehr auf.'
              }
            />
          ) : (
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
          )}
        </Card>
      )}

      <PotWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
    </div>
  );
}
