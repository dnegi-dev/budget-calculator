/**
 * Die vier Topf-Arten.
 *
 * `kind` ist ein **Preset** über den beiden eigentlichen Schaltern
 * `limitCents` und `carryOver`. Der Wizard setzt das Preset, das Topf-Detail
 * erlaubt abweichende Kombinationen. Damit bleibt das Modell flexibel, ohne
 * dass der Nutzer beim Anlegen zwei abstrakte Schalter verstehen muss.
 *
 * `goal` fällt aus diesem Schema heraus: Es hat weder ein Perioden-Limit noch
 * einen Übertrag, sondern läuft über die eigenen Felder `goalCents` und
 * `targetDate` (`requiresGoal`, nicht `requiresLimit`) — ein Sparziel ist
 * nicht periodisch, sondern läuft über die gesamte Lebenszeit des Topfes bis
 * zur Frist.
 */

import type { Pot, PotKind } from './types';

export interface PotKindPreset {
  kind: PotKind;
  label: string;
  /** Ein Satz, der im Wizard unter dem Label steht. */
  explanation: string;
  example: string;
  requiresLimit: boolean;
  carryOver: boolean;
  /** Nur bei `kind: 'goal'` wahr — steuert den Zielbetrag/Frist-Schritt im Wizard. */
  requiresGoal: boolean;
}

export const POT_KIND_PRESETS: Record<PotKind, PotKindPreset> = {
  budget: {
    kind: 'budget',
    label: 'Monatsbudget',
    explanation: 'Fester Betrag pro Periode. Jede Periode startet wieder bei voller Höhe.',
    example: 'Lebensmittel: 400 € im Monat, Reste verfallen.',
    requiresLimit: true,
    carryOver: false,
    requiresGoal: false,
  },
  envelope: {
    kind: 'envelope',
    label: 'Budget mit Übertrag',
    explanation:
      'Wie Monatsbudget, aber Restbetrag und Überziehung wandern in die nächste Periode.',
    example: 'Sport: 50 € im Monat — nach drei sparsamen Monaten sind 150 € für Schuhe da.',
    requiresLimit: true,
    carryOver: true,
    requiresGoal: false,
  },
  category: {
    kind: 'category',
    label: 'Nur Kategorie',
    explanation: 'Kein Limit. Zeigt nur, was tatsächlich ausgegeben wurde.',
    example: 'Sonstiges: interessiert in der Auswertung, soll aber nicht begrenzt sein.',
    requiresLimit: false,
    carryOver: false,
    requiresGoal: false,
  },
  goal: {
    kind: 'goal',
    label: 'Sparziel',
    explanation: 'Betrag und Frist. Danach ist der Topf gesperrt, egal wie viel zusammenkam.',
    example: 'Urlaub: 1.200 € bis Juni 2026 zusammensparen.',
    requiresLimit: false,
    carryOver: false,
    requiresGoal: true,
  },
};

export const POT_KINDS: readonly PotKind[] = ['budget', 'envelope', 'category', 'goal'];

export function potKindPreset(kind: PotKind): PotKindPreset {
  return POT_KIND_PRESETS[kind];
}

/** Die Felder, die ein Preset setzt. Bei 'category' wird das Limit verworfen. */
export function applyPotKindPreset(
  kind: PotKind,
  limitCents: number | null,
): Pick<Pot, 'kind' | 'limitCents' | 'carryOver'> {
  const preset = potKindPreset(kind);
  return {
    kind,
    limitCents: preset.requiresLimit ? (limitCents ?? 0) : null,
    carryOver: preset.carryOver,
  };
}

export function hasLimit(pot: Pick<Pot, 'limitCents'>): pot is Pick<Pot, 'limitCents'> & {
  limitCents: number;
} {
  return typeof pot.limitCents === 'number';
}

export function hasGoal(pot: Pick<Pot, 'goalCents'>): pot is Pick<Pot, 'goalCents'> & {
  goalCents: number;
} {
  return typeof pot.goalCents === 'number';
}

/**
 * Stimmen die Felder noch mit dem Preset überein? Wenn nicht, zeigt die UI
 * „angepasst“ statt eines Preset-Namens, der dann nur in die Irre führt.
 */
export function matchesPreset(
  pot: Pick<Pot, 'kind' | 'limitCents' | 'carryOver' | 'goalCents'>,
): boolean {
  const preset = potKindPreset(pot.kind);
  return (
    preset.carryOver === pot.carryOver &&
    preset.requiresLimit === hasLimit(pot) &&
    preset.requiresGoal === hasGoal(pot)
  );
}

/**
 * Ist die Frist eines Sparziel-Topfes verstrichen? Reine Funktion, damit sie
 * testbar ist und Repository (Sperre setzen) wie Oberfläche (Anzeige) dieselbe
 * Regel lesen.
 */
export function isGoalDue(pot: Pick<Pot, 'kind' | 'targetDate'>, today: string): boolean {
  return pot.kind === 'goal' && pot.targetDate !== null && today > pot.targetDate;
}

/** Kurzbeschreibung der tatsächlichen Konfiguration, unabhängig vom Preset. */
export function describePotConfig(
  pot: Pick<Pot, 'kind' | 'limitCents' | 'carryOver' | 'goalCents' | 'targetDate'>,
  formatLimit: (cents: number) => string,
  formatDate?: (date: string) => string,
): string {
  if (pot.kind === 'goal') {
    if (!hasGoal(pot)) return 'Sparziel ohne Betrag';
    const goal = formatLimit(pot.goalCents);
    if (pot.targetDate === null || !formatDate) return `Ziel: ${goal}`;
    return `Ziel: ${goal} bis ${formatDate(pot.targetDate)}`;
  }
  if (!hasLimit(pot)) return 'Ohne Limit';
  const limit = formatLimit(pot.limitCents);
  return pot.carryOver ? `${limit} pro Periode, mit Übertrag` : `${limit} pro Periode`;
}
