'use client';

/**
 * Wiederkehrende Buchungen.
 *
 * Eigene Unterseite von „Buchungen“ und nicht mehr in den Einstellungen: Eine
 * Regel ist eine Buchung, die sich wiederholt, keine Einstellung. Weil
 * `isActive` in `components/AppShell.tsx` mit `startsWith` arbeitet, bleibt
 * „Buchungen“ in der unteren Leiste dabei markiert — die Leiste behält ihre
 * vier Einträge.
 */

import Link from 'next/link';
import { RecurringSection } from '../../../components/recurring/RecurringSection';

export default function RecurringPage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/buchungen" className="text-sm text-accent hover:underline">
          ← Buchungen
        </Link>
        <h1 className="mt-1 text-xl font-medium">Wiederkehrende Buchungen</h1>
      </div>

      <RecurringSection />

      <p className="text-sm text-ink-muted">
        Regeln erzeugen ihre Buchungen beim Öffnen der App — rückwirkend bis zum Beginn der Regel.
        Eine pausierte Regel erzeugt nichts, bleibt aber erhalten.
      </p>
    </div>
  );
}
