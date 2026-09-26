'use client';

/**
 * Eine Topf-Zeile: Symbol, Name, Restbetrag, Balken.
 *
 * Die wichtigste Zahl ist „noch übrig“, nicht „ausgegeben“ — deshalb steht sie
 * groß rechts. Bei Töpfen ohne Limit gibt es kein „übrig“; dort tritt die
 * Ausgabensumme an diese Stelle.
 */

import Link from 'next/link';
import { useMemo } from 'react';
import { useData } from '../../lib/data/provider';
import { computeGoalState, type PotPeriodState } from '../../lib/domain/ledger';
import type { Pot } from '../../lib/domain/types';
import { ProgressBar } from '../../lib/ui/ProgressBar';
import { potColorVar } from '../../lib/ui/colors';
import { useFormat } from '../../lib/ui/useFormat';
import { PotIcon } from './PotIcon';

export function PotRow({ pot, state }: { pot: Pot; state: PotPeriodState }) {
  const format = useFormat();
  const { snapshot } = useData();
  const color = potColorVar(pot.color);
  const hasLimit = state.availableCents !== null;

  // Ein Sparziel ist nicht periodisch: Seine Zeile zeigt das Gesparte über die
  // ganze Lebenszeit, wie die Detailseite (`computeGoalState`). Vorher stand
  // hier der Periodenstand mit „ohne Limit" — derselbe Topf sah auf der Startseite
  // anders aus als auf seiner eigenen Seite.
  const goal = useMemo(
    () =>
      pot.kind === 'goal'
        ? computeGoalState(
            pot,
            snapshot.entries.filter((entry) => entry.potId === pot.id),
          )
        : null,
    [pot, snapshot.entries],
  );

  return (
    <Link
      href={`/toepfe/detail?pot=${pot.id}`}
      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-subtle"
    >
      <PotIcon pot={pot} className="h-10 w-10 rounded-lg text-lg" />

      {goal ? (
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className="truncate font-medium">{pot.name}</span>
            <span className="tabular shrink-0 text-right font-semibold">
              {format.money(goal.savedCents)}
            </span>
          </span>
          <span className="mt-1.5 block">
            <ProgressBar progress={goal.progress ?? 0} color={color} overspent={false} />
          </span>
          <span className="mt-1.5 flex items-baseline justify-between gap-3 text-xs text-ink-muted">
            <span className="truncate">
              {goal.goalCents === null ? 'gespart' : `gespart von ${format.money(goal.goalCents)}`}
            </span>
            {goal.locked && <span className="shrink-0">gesperrt</span>}
          </span>
        </span>
      ) : (
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className="truncate font-medium">{pot.name}</span>
            <span
              className={[
                'tabular shrink-0 text-right font-semibold',
                state.overspent ? 'text-negative' : '',
              ].join(' ')}
            >
              {hasLimit ? format.money(state.availableCents ?? 0) : format.money(state.netCents)}
            </span>
          </span>

          <span className="mt-1.5 block">
            <ProgressBar progress={state.progress} color={color} overspent={state.overspent} />
          </span>

          <span className="mt-1.5 flex items-baseline justify-between gap-3 text-xs text-ink-muted">
            <span className="truncate">
              {hasLimit
                ? `${format.money(state.netCents)} von ${format.money((state.limitCents ?? 0) + state.carriedInCents)}`
                : 'ohne Limit'}
            </span>
            {state.carriedInCents !== 0 && (
              <span className="tabular shrink-0">
                {state.carriedInCents > 0 ? '+' : ''}
                {format.money(state.carriedInCents)} Übertrag
              </span>
            )}
          </span>
        </span>
      )}
    </Link>
  );
}
