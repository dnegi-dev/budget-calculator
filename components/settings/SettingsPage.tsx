'use client';

/**
 * Der Rahmen jeder Einstellungs-Unterseite: Zurück-Link, Titel, ein Satz.
 *
 * Kopfzeile und Titel kommen aus `ListToolbar` — derselben Leiste, die über
 * den Listenseiten klebt. Zwei Bauweisen für dieselbe Kopfzeile wären eine zu
 * viel, und auch hier gilt: Auf „Ordnen“ stehen Listen, die lang werden, und
 * der Weg zurück soll beim Scrollen nicht verschwinden.
 *
 * Weil `isActive` in `components/AppShell.tsx` mit `startsWith` arbeitet,
 * bleibt „Einstellungen“ in der unteren Leiste markiert — die Leiste behält
 * ihre vier Einträge, egal wie tief man steht.
 */

import type { ReactNode } from 'react';
import { ListToolbar } from '../lists/ListToolbar';

export function SettingsPage({
  title,
  hint,
  search,
  children,
}: {
  title: string;
  hint?: string;
  /** Nur für Unterseiten mit Listen — etwa „Ordnen“. */
  search?: { value: string; onChange: (value: string) => void; placeholder: string };
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5">
      <ListToolbar
        title={title}
        back={{ href: '/einstellungen', label: 'Einstellungen' }}
        search={search}
      />
      {hint && <p className="text-sm text-ink-muted">{hint}</p>}
      {children}
    </div>
  );
}
