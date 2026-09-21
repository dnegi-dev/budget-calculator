'use client';

/**
 * Töpfe verwalten — als eigene Unterseite der Einstellungen.
 *
 * Vorher stand hier nur ein Link nach `/toepfe` in der Karte „Ordnen". Das
 * war ein Verweis auf die Alltagsansicht, und die zeigt Restbeträge, nicht
 * Verwaltung. Wer in den Einstellungen nach Töpfen sucht, will Name, Art,
 * Limit oder Aussehen ändern — dafür öffnet jede Zeile direkt das bestehende
 * Bearbeiten-Sheet (`PotSettingsForm`), ohne Umweg über die Detailseite.
 *
 * Bewusst **kein** Umweg über die Detailseite mehr: Buchungen, wiederkehrende
 * Regeln, Archivieren und Löschen bleiben dort — der Kontext (Verlauf,
 * Buchungsliste) gehört dort hin, nicht in ein schnelles Eigenschaften-Sheet.
 * Wer Buchungen dieses Topfes sehen will, geht weiter über „Heute" → „Töpfe".
 *
 * Aktive und archivierte getrennt: Ein archivierter Topf taucht im Alltag
 * nirgends mehr auf, und „wo ist der hin?" ist genau die Frage, die diese
 * Seite beantworten soll.
 */

import { useMemo, useState } from 'react';
import { SettingsPage } from '../../../components/settings/SettingsPage';
import { PotSettingsForm } from '../../../components/pots/PotSettingsForm';
import { useCan } from '../../../lib/auth/provider';
import { useSnapshot } from '../../../lib/data/provider';
import { describePotConfig } from '../../../lib/domain/pot-kinds';
import type { Pot } from '../../../lib/domain/types';
import { Card, CardHeader } from '../../../lib/ui/Card';
import { EmptyState } from '../../../lib/ui/EmptyState';
import { Sheet } from '../../../lib/ui/Sheet';
import { useFormat } from '../../../lib/ui/useFormat';

export default function PotSettingsPage() {
  const snapshot = useSnapshot();
  const can = useCan();
  // Die ID, nicht der Topf selbst: Nach dem Speichern im Sheet soll es die
  // frische Revision aus dem Snapshot zeigen, nicht den Stand vom Antippen.
  const [bearbeitenId, setBearbeitenId] = useState<string | null>(null);
  const bearbeiten = snapshot.pots.find((pot) => pot.id === bearbeitenId) ?? null;

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
      hint="Jede Zeile öffnet die Einstellungen des Topfes — Name, Art, Limit, Symbol und Farbe."
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
              <PotZeile key={pot.id} pot={pot} onClick={() => setBearbeitenId(pot.id)} />
            ))}
          </ul>
        )}
      </Card>

      {archivierte.length > 0 && (
        <Card>
          <CardHeader title={`${archivierte.length} archiviert`} />
          <ul className="divide-y divide-[var(--border)]">
            {archivierte.map((pot) => (
              <PotZeile key={pot.id} pot={pot} onClick={() => setBearbeitenId(pot.id)} />
            ))}
          </ul>
        </Card>
      )}

      <Sheet
        open={bearbeiten !== null && can('pot.edit')}
        onClose={() => setBearbeitenId(null)}
        title={`„${bearbeiten?.name ?? ''}“ bearbeiten`}
      >
        {bearbeiten && <PotSettingsForm pot={bearbeiten} />}
      </Sheet>
    </SettingsPage>
  );
}

function PotZeile({ pot, onClick }: { pot: Pot; onClick: () => void }) {
  const format = useFormat();

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-subtle"
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
      </button>
    </li>
  );
}
