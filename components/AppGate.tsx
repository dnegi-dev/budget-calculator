'use client';

/**
 * Entscheidet, was der Nutzer überhaupt sieht.
 *
 * Drei Fälle:
 *
 * 1. Snapshot noch nicht geladen → ruhiger Ladezustand (kein Flackern von
 *    leeren Listen, die sofort wieder gefüllt werden).
 * 2. Kein Haushalt oder Ersteinrichtung nicht abgeschlossen → Wizard, und
 *    zwar **inline** statt per Weiterleitung. Eine Weiterleitung würde bei
 *    jedem Direktaufruf einer Unterseite kurz die falsche Seite zeigen.
 * 3. Sonst → die eigentliche Anwendung.
 *
 * Außerdem läuft hier einmal pro Sitzung die Materialisierung wiederkehrender
 * Buchungen. Das ist der einzige sinnvolle Zeitpunkt ohne Server: wenn die App
 * geöffnet wird.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { OnboardingWizard } from './onboarding/OnboardingWizard';
import { AppShell } from './AppShell';
import { useData } from '../lib/data/provider';
import { todayIso } from '../lib/domain/dates';

export function AppGate({ children }: { children: ReactNode }) {
  const { repository, snapshot, loading, error } = useData();
  const materializedRef = useRef(false);

  const setupComplete =
    snapshot.household !== null && snapshot.household.onboardingCompletedAt !== null;

  useEffect(() => {
    if (!setupComplete || materializedRef.current) return;
    materializedRef.current = true;
    // Fehler hier dürfen die App nicht blockieren: im schlimmsten Fall fehlen
    // wiederkehrende Buchungen, die beim nächsten Start nachgezogen werden.
    void repository.materializeRecurringRules(todayIso()).catch(() => {
      materializedRef.current = false;
    });
  }, [repository, setupComplete]);

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6">
        <p className="text-sm text-ink-muted">Daten werden geladen …</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-lg font-semibold">Die Daten lassen sich nicht öffnen</p>
        <p className="text-sm text-ink-muted">
          Wahrscheinlich blockiert der Browser die lokale Datenbank — das passiert im privaten Modus
          oder bei gesperrten Website-Daten.
        </p>
        <p className="text-xs text-ink-muted">{error.message}</p>
      </div>
    );
  }

  if (!setupComplete) return <OnboardingWizard />;

  return <AppShell>{children}</AppShell>;
}
