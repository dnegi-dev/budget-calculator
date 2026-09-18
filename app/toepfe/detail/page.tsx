'use client';

/**
 * Topf-Detail.
 *
 * Die ID steckt im Query-Parameter, nicht im Pfad. Grund: v1 wird als
 * statisches Bundle ausgeliefert (`output: 'export'`), und eine dynamische
 * Route `[id]` bräuchte zur Bauzeit die Liste aller IDs — die es lokal auf dem
 * Gerät naturgemäß nicht gibt. Beim Wechsel auf den Serverbetrieb kann daraus
 * eine echte Route werden.
 */

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { EntryList } from '../../../components/entries/EntryList';
import { EntrySheet } from '../../../components/entries/EntrySheet';
import { PeriodSwitcher } from '../../../components/PeriodSwitcher';
import { PotSettingsForm } from '../../../components/pots/PotSettingsForm';
import { useCan } from '../../../lib/auth/provider';
import { useData, useSnapshot } from '../../../lib/data/provider';
import { todayIso } from '../../../lib/domain/dates';
import { computePotPeriodState, entriesInPeriod } from '../../../lib/domain/ledger';
import { periodForDate } from '../../../lib/domain/period';
import { describePotConfig, matchesPreset } from '../../../lib/domain/pot-kinds';
import { Banner } from '../../../lib/ui/Banner';
import { Button } from '../../../lib/ui/Button';
import { Card, CardHeader } from '../../../lib/ui/Card';
import { ProgressBar } from '../../../lib/ui/ProgressBar';
import { potColorVar } from '../../../lib/ui/colors';
import { useFormat } from '../../../lib/ui/useFormat';

export default function PotDetailPage() {
  return (
    <Suspense fallback={<p className="text-sm text-ink-muted">Wird geladen …</p>}>
      <PotDetail />
    </Suspense>
  );
}

function PotDetail() {
  const params = useSearchParams();
  const potId = params.get('pot');
  const snapshot = useSnapshot();
  const { repository } = useData();
  const format = useFormat();
  const can = useCan();

  const currentKey = useMemo(
    () => periodForDate(todayIso(), format.periodStartDay).key,
    [format.periodStartDay],
  );
  const [periodKey, setPeriodKey] = useState(currentKey);
  const [entryOpen, setEntryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const pot = snapshot.pots.find((candidate) => candidate.id === potId) ?? null;

  const potEntries = useMemo(
    () => (pot ? snapshot.entries.filter((entry) => entry.potId === pot.id) : []),
    [pot, snapshot.entries],
  );

  const state = useMemo(
    () => (pot ? computePotPeriodState(pot, potEntries, periodKey, format.periodStartDay) : null),
    [pot, potEntries, periodKey, format.periodStartDay],
  );

  const entriesOfPeriod = useMemo(
    () => entriesInPeriod(potEntries, periodKey, format.periodStartDay),
    [potEntries, periodKey, format.periodStartDay],
  );

  if (!pot || !state) {
    return (
      <div className="flex flex-col gap-4">
        <Banner tone="warning" icon="?">
          Dieser Topf existiert nicht mehr.
        </Banner>
        <Link href="/toepfe" className="text-sm text-accent underline">
          Zurück zur Übersicht
        </Link>
      </div>
    );
  }

  const color = potColorVar(pot.color);
  const hasLimit = state.availableCents !== null;
  const activePots = snapshot.pots.filter((candidate) => candidate.archivedAt === null);

  return (
    <div className="flex flex-col gap-5">
      <Link href="/toepfe" className="text-sm text-ink-muted hover:text-ink">
        ‹ Töpfe
      </Link>

      <Card className="px-4 py-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-2xl"
            style={{ background: `color-mix(in oklch, ${color} 18%, transparent)` }}
          >
            {pot.icon}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-semibold">{pot.name}</h1>
            <p className="text-sm text-ink-muted">
              {describePotConfig(pot, format.money)}
              {!matchesPreset(pot) ? ' · angepasst' : ''}
              {pot.archivedAt !== null ? ' · archiviert' : ''}
            </p>
          </div>
        </div>

        <div className="mt-4">
          <PeriodSwitcher periodKey={periodKey} onChange={setPeriodKey} currentKey={currentKey} />
        </div>

        <div className="mt-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-ink-muted">{hasLimit ? 'Noch übrig' : 'Ausgegeben'}</span>
            <span
              className={[
                'tabular text-2xl font-semibold',
                state.overspent ? 'text-negative' : '',
              ].join(' ')}
            >
              {format.money(hasLimit ? (state.availableCents ?? 0) : state.netCents)}
            </span>
          </div>
          <div className="mt-2">
            <ProgressBar progress={state.progress} color={color} overspent={state.overspent} />
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
            <div>
              <dt className="text-ink-muted">Ausgaben</dt>
              <dd className="tabular mt-0.5 font-medium">{format.money(state.spentCents)}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Erstattungen</dt>
              <dd className="tabular mt-0.5 font-medium">{format.money(state.refundCents)}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">{pot.carryOver ? 'Übertrag' : 'Limit'}</dt>
              <dd className="tabular mt-0.5 font-medium">
                {pot.carryOver
                  ? format.money(state.carriedInCents)
                  : format.money(state.limitCents ?? 0)}
              </dd>
            </div>
          </dl>
        </div>

        {can('entry.create') && pot.archivedAt === null && (
          <div className="mt-4">
            <Button variant="primary" block onClick={() => setEntryOpen(true)}>
              Auf „{pot.name}“ buchen
            </Button>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Buchungen dieser Periode" />
        <EntryList
          entries={entriesOfPeriod}
          pots={snapshot.pots}
          emptyHint={`In dieser Periode wurde noch nichts auf „${pot.name}“ gebucht.`}
        />
      </Card>

      {can('pot.edit') && (
        <Card>
          <CardHeader
            title="Einstellungen"
            action={
              <Button variant="ghost" size="sm" onClick={() => setSettingsOpen((open) => !open)}>
                {settingsOpen ? 'Zuklappen' : 'Bearbeiten'}
              </Button>
            }
          />
          {settingsOpen && (
            <>
              <PotSettingsForm pot={pot} />
              <div className="flex flex-wrap gap-3 border-t border-line px-4 py-4">
                <Button
                  variant="secondary"
                  onClick={() => void repository.setPotArchived(pot.id, pot.archivedAt === null)}
                >
                  {pot.archivedAt === null ? 'Archivieren' : 'Wieder aktivieren'}
                </Button>
                {can('pot.delete') && (
                  <Button variant="danger" onClick={() => setConfirmDelete(true)}>
                    Topf löschen
                  </Button>
                )}
              </div>
              <p className="px-4 pb-4 text-xs text-ink-muted">
                Archivieren blendet den Topf aus, behält aber alle Zahlen. Löschen entfernt den
                Topf; die Buchungen bleiben erhalten und stehen danach ohne Topf da.
              </p>
            </>
          )}
        </Card>
      )}

      {confirmDelete && (
        <Card className="border-[var(--negative)] px-4 py-4">
          <p className="font-medium">„{pot.name}“ wirklich löschen?</p>
          <p className="mt-1 text-sm text-ink-muted">
            {potEntries.length} Buchung{potEntries.length === 1 ? '' : 'en'} bleibt erhalten,
            verliert aber die Zuordnung. Das lässt sich nicht rückgängig machen.
          </p>
          <div className="mt-3 flex gap-3">
            <Button variant="danger" onClick={() => void repository.deletePot(pot.id)}>
              Endgültig löschen
            </Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Abbrechen
            </Button>
          </div>
        </Card>
      )}

      <EntrySheet
        open={entryOpen}
        onClose={() => setEntryOpen(false)}
        pots={activePots}
        defaultPotId={pot.id}
      />
    </div>
  );
}
