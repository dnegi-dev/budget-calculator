'use client';

/**
 * Der Rahmen jeder Einstellungs-Unterseite: Zurück-Link, Titel, ein Satz.
 *
 * Gleiches Muster wie `app/buchungen/wiederkehrend/page.tsx`. Weil `isActive`
 * in `components/AppShell.tsx` mit `startsWith` arbeitet, bleibt
 * „Einstellungen“ in der unteren Leiste markiert — die Leiste behält ihre vier
 * Einträge, egal wie tief man steht.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';

export function SettingsPage({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/einstellungen" className="text-sm text-accent hover:underline">
          ← Einstellungen
        </Link>
        <h1 className="mt-1 text-xl font-medium">{title}</h1>
        {hint && <p className="mt-1 text-sm text-ink-muted">{hint}</p>}
      </div>
      {children}
    </div>
  );
}
