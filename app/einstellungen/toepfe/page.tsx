'use client';

/**
 * Töpfe verwalten — als eigene Unterseite der Einstellungen.
 *
 * Vorher stand hier nur ein Link nach `/toepfe` in der Karte „Ordnen". Das
 * war ein Verweis auf die Alltagsansicht, und die zeigt Restbeträge, nicht
 * Verwaltung. Wer in den Einstellungen nach Töpfen sucht, will umbenennen,
 * archivieren oder löschen — und dafür führt jede Zeile direkt in die
 * Einstellungen des Topfes.
 *
 * Aktive und archivierte getrennt: Ein archivierter Topf taucht im Alltag
 * nirgends mehr auf, und „wo ist der hin?" ist genau die Frage, die diese
 * Seite beantworten soll.
 */

import Link from 'next/link';
import { useMemo } from 'react';
import { SettingsPage } from '../../../components/settings/SettingsPage';
import { useSnapshot } from '../../../lib/data/provider';
import { describePotConfig } from '../../../lib/domain/pot-kinds';
import type { Pot } from '../../../lib/domain/types';
import { Card, CardHeader } from '../../../lib/ui/Card';
import { EmptyState } from '../../../lib/ui/EmptyState';
import { useFormat } from '../../../lib/ui/useFormat';

export default function PotSettingsPage() {
  const snapshot = useSnapshot();

  const { aktive, archivierte } = useMemo(() => {
    const sortiert = [...snapshot.pots].sort((a, b) => a.sortIndex - b.sortIndex);
    return {
      aktive: sortiert.filter((pot) => pot.archivedAt === null),
      archivierte: sortiert.filter((pot) => pot.archivedAt !== null),
    };
  }, [snapshot.pots]);

  return (
    <SettingsPage
      title="Töpfe"
      hint="Jede Zeile führt in die Einstellungen des Topfes — Name, Limit, Übertrag, wiederkehrende Buchungen."
    >
      <Card>
        <CardHeader title={`${aktive.length} aktiv`} />
        {aktive.length === 0 ? (
          <EmptyState
            icon="🫙"
            title="Keine Töpfe"
            hint="Angelegt wird ein Topf über „Neuer Topf“ auf der Startseite."
          />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {aktive.map((pot) => (
              <PotZeile key={pot.id} pot={pot} />
            ))}
          </ul>
        )}
      </Card>

      {archivierte.length > 0 && (
        <Card>
          <CardHeader title={`${archivierte.length} archiviert`} />
          <ul className="divide-y divide-[var(--border)]">
            {archivierte.map((pot) => (
              <PotZeile key={pot.id} pot={pot} />
            ))}
          </ul>
        </Card>
      )}
    </SettingsPage>
  );
}

function PotZeile({ pot }: { pot: Pot }) {
  const format = useFormat();

  return (
    <li>
      <Link
        href={`/toepfe/detail?pot=${pot.id}`}
        className="flex items-center gap-3 px-4 py-3 hover:bg-subtle"
      >
        <span aria-hidden className="text-lg">
          {pot.icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{pot.name}</span>
          <span className="block truncate text-xs text-ink-muted">
            {describePotConfig(pot, format.money)}
          </span>
        </span>
        <span aria-hidden className="text-ink-muted">
          ›
        </span>
      </Link>
    </li>
  );
}
