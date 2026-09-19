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
import { EntryFilterFields } from '../../../components/lists/EntryFilterFields';
import { ListToolbar } from '../../../components/lists/ListToolbar';
import { ToolbarButton } from '../../../components/lists/ToolbarLink';
import { RecurringSection } from '../../../components/recurring/RecurringSection';
import { useEntryFilters } from '../../../components/lists/useEntryFilters';
import { PeriodSwitcher } from '../../../components/PeriodSwitcher';
import { PotSettingsForm } from '../../../components/pots/PotSettingsForm';
import { useCan } from '../../../lib/auth/provider';
import { useData, useSnapshot } from '../../../lib/data/provider';
import { todayIso } from '../../../lib/domain/dates';
import { computePotPeriodState, entriesInPeriod } from '../../../lib/domain/ledger';
import { periodForDate } from '../../../lib/domain/period';
import { describePotConfig, matchesPreset } from '../../../lib/domain/pot-kinds';
import { collectTags } from '../../../lib/domain/tags';
import { CircleHelp, Settings } from 'lucide-react';
import { Icon } from '../../../lib/ui/Icon';
import { Banner } from '../../../lib/ui/Banner';
import { Button } from '../../../lib/ui/Button';
import { Card, CardHeader } from '../../../lib/ui/Card';
import { ProgressBar } from '../../../lib/ui/ProgressBar';
import { Sheet } from '../../../lib/ui/Sheet';
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

  /**
   * Vor dem Ausstieg unten: Ein Haken darf nicht hinter einem `return`
   * stehen. Der Topf kann verschwunden sein, die Liste ist dann leer — das
   * kostet nichts.
   */
  const filters = useEntryFilters(entriesOfPeriod);
  const alleTags = useMemo(
    () => collectTags(snapshot.entries).map((usage) => usage.tag),
    [snapshot.entries],
  );

  if (!pot || !state) {
    return (
      <div className="flex flex-col gap-4">
        <Banner tone="warning" icon={<Icon icon={CircleHelp} size={18} />}>
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

  const tagsEnabled = snapshot.household?.tagsEnabled ?? false;

  /**
   * Die wiederkehrenden Regeln **dieses** Topfes. Regeln ohne Topf (Gehalt
   * auf den Haushalt) stehen weiter nur unter Einstellungen →
   * „Wiederkehrende Buchungen" — hier wären sie fehl am Platz.
   */
  const regeln = snapshot.recurringRules.filter((rule) => rule.potId === pot.id);

  return (
    <div className="flex flex-col gap-5">
      {/*
        Die Überschrift trägt die klebende Leiste, samt Suche und Filter für
        die Buchungsliste weiter unten. Der Topf steht fest, deshalb ohne
        Topf-Feld: Ein Filter, der nur einen Wert kennt, ist kein Filter.
      */}
      <ListToolbar
        title={pot.name}
        back={{ href: '/toepfe', label: 'Töpfe' }}
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
            withPot={false}
          />
        }
        filtersActive={filters.active}
        onResetFilters={filters.reset}
        links={
          /*
            Die Einstellungen lagen vorher als Karte unter der Buchungsliste
            — man musste an allen Buchungen vorbeiscrollen, um das Limit zu
            ändern. Jetzt hängen sie am Zahnrad in der Leiste, die ohnehin
            klebt, und damit auf jeder Höhe der Seite.
          */
          can('pot.edit') ? (
            <ToolbarButton
              icon={Settings}
              label="Einstellungen dieses Topfes"
              expanded={settingsOpen}
              onClick={() => setSettingsOpen(true)}
            />
          ) : undefined
        }
      />

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
            <p className="truncate font-medium">{pot.name}</p>
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

        {/*
          Nur ab `md`. Mobil macht das der schwebende Knopf, und der weiß,
          welcher Topf gemeint ist: Er liest `?pot=` aus derselben Adresse, die
          diese Seite öffnet. Ein zweiter Knopf mit demselben Ziel war eine
          Dopplung — und stand genau da, wo die Zahlen stehen sollen.

          Das `hidden` gehört an die Hülle: `Button` bringt `inline-flex` mit,
          und Tailwind gibt `.inline-flex` nach `.hidden` aus.
        */}
        {can('entry.create') && pot.archivedAt === null && (
          <div className="mt-4 hidden md:block">
            <Button variant="primary" block onClick={() => setEntryOpen(true)}>
              Auf „{pot.name}“ buchen
            </Button>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          title={`${filters.visible.length} Buchung${filters.visible.length === 1 ? '' : 'en'} dieser Periode`}
        />
        <EntryList
          entries={filters.visible}
          pots={snapshot.pots}
          emptyHint={
            filters.active || filters.search.trim() !== ''
              ? 'Keine Buchung passt zu Suche und Filtern.'
              : `In dieser Periode wurde noch nichts auf „${pot.name}“ gebucht.`
          }
        />
      </Card>

      <Sheet
        open={settingsOpen && can('pot.edit')}
        onClose={() => setSettingsOpen(false)}
        title={`„${pot.name}“ einstellen`}
      >
        <div className="flex flex-col gap-5">
          <PotSettingsForm pot={pot} />

          {/*
            Die Regeln dieses Topfes stehen hier und nicht auf einer eigenen
            Seite: „Miete" gehört zu „Wohnen", und wer den Topf offen hat,
            sucht sie dort. Der Topf ist beim Anlegen vorbelegt — nach dem
            zu fragen, den man gerade offen hat, wäre eine Frage ohne
            Antwortmöglichkeit.
          */}
          <RecurringSection rules={regeln} defaultPotId={pot.id} />

          <div className="flex flex-wrap gap-3 border-t border-line pt-4">
            <Button
              variant="secondary"
              onClick={() => void repository.setPotArchived(pot.id, pot.archivedAt === null)}
            >
              {pot.archivedAt === null ? 'Archivieren' : 'Wieder aktivieren'}
            </Button>
            {can('pot.delete') && (
              <Button
                variant="danger"
                onClick={() => {
                  setSettingsOpen(false);
                  setConfirmDelete(true);
                }}
              >
                Topf löschen
              </Button>
            )}
          </div>
          <p className="text-xs text-ink-muted">
            Archivieren blendet den Topf aus, behält aber alle Zahlen. Löschen entfernt den Topf;
            die Buchungen bleiben erhalten und stehen danach ohne Topf da.
          </p>
        </div>
      </Sheet>

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
