'use client';

/**
 * Entscheidet, was der Nutzer überhaupt sieht.
 *
 * Drei Fälle:
 *
 * 1. Rechtsseiten (Impressum, Datenschutz) → immer durchlassen, in einer
 *    schlanken Hülle. Sie müssen von überall erreichbar sein, auch bevor ein
 *    Haushalt existiert — sonst führt der Link aus dem Onboarding oder aus
 *    einer Suchmaschine in den Wizard statt aufs Impressum.
 * 2. Nicht entsperrt → Anmeldefenster. Steht **hinter** Punkt 1: Ein
 *    Impressum hinter einer Anmeldung wäre nicht ohne Hürde erreichbar.
 * 3. Snapshot noch nicht geladen → ruhiger Ladezustand (kein Flackern von
 *    leeren Listen, die sofort wieder gefüllt werden).
 * 4. Kein Haushalt oder Ersteinrichtung nicht abgeschlossen → Wizard, und
 *    zwar **inline** statt per Weiterleitung. Eine Weiterleitung würde bei
 *    jedem Direktaufruf einer Unterseite kurz die falsche Seite zeigen.
 * 5. Sonst → die eigentliche Anwendung.
 *
 * Außerdem läuft hier einmal pro Sitzung die Materialisierung wiederkehrender
 * Buchungen. Das ist der einzige sinnvolle Zeitpunkt ohne Server: wenn die App
 * geöffnet wird.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, type ReactNode } from 'react';
import { OnboardingWizard } from './onboarding/OnboardingWizard';
import { AppShell } from './AppShell';
import { LoginGate } from './LoginGate';
import { useData } from '../lib/data/provider';
import { useUnlocked } from '../lib/auth/useUnlocked';
import { todayIso } from '../lib/domain/dates';

/** Routen, die ohne eingerichteten Haushalt erreichbar bleiben müssen. */
const PUBLIC_ROUTES = ['/impressum', '/datenschutz'];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export function AppGate({ children }: { children: ReactNode }) {
  const { repository, snapshot, loading, error } = useData();
  const pathname = usePathname();
  const unlocked = useUnlocked();
  const materializedRef = useRef(false);

  const setupComplete =
    snapshot.household !== null && snapshot.household.onboardingCompletedAt !== null;

  useEffect(() => {
    // Hinter dem Anmeldefenster passiert nichts — auch wenn das Gate keinen
    // Schutz darstellt, soll es keine Buchungen erzeugen, die niemand sieht.
    if (!unlocked || !setupComplete || materializedRef.current) return;
    materializedRef.current = true;
    // Fehler hier dürfen die App nicht blockieren: im schlimmsten Fall fehlen
    // wiederkehrende Buchungen, die beim nächsten Start nachgezogen werden.
    void repository.materializeRecurringRules(todayIso()).catch(() => {
      materializedRef.current = false;
    });
    // Dieselbe Begründung gilt für abgelaufene Sparziele: Im schlimmsten Fall
    // sperrt eines erst beim nächsten Start.
    void repository.lockDueGoalPots(todayIso()).catch(() => {});
  }, [repository, setupComplete, unlocked]);

  // Vor allem anderen — auch vor dem Ladezustand, denn diese Seiten brauchen
  // die Datenbank nicht.
  if (isPublicRoute(pathname)) {
    return (
      <div className="mx-auto min-h-dvh w-full max-w-2xl px-5 py-8">
        <Link href="/" className="text-sm text-ink-muted hover:text-ink">
          ‹ Zur App
        </Link>
        <div className="mt-6">{children}</div>
      </div>
    );
  }

  if (!unlocked) return <LoginGate />;

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
