/**
 * Wortwahl für eine Buchungsart — im Kontext eines Sparziel-Topfes anders als
 * sonst.
 *
 * Auf einen Topf zu buchen heißt in dieser Anwendung immer „Ausgabe"
 * (`EntrySheet.potStepActive`), und `computeGoalState` in `lib/domain/ledger.ts`
 * rechnet entsprechend: eine Ausgabe erhöht das Gesparte, eine Einnahme senkt
 * es. Sprachlich ist das verkehrt herum — „Ausgabe: 200 € auf Urlaub" klingt
 * nach Geld, das weg ist, erhöht aber den Topf. Hier steht die Übersetzung:
 *
 * | Buchungsart | im Sparziel-Kontext |
 * | ----------- | -------------------- |
 * | `expense`   | „Einzahlen"          |
 * | `income`    | „Ausgeben"           |
 *
 * Die Wörter ändern nichts an der Rechnung — nur daran, wie sie heißt. Gilt
 * **nur** im Sparziel-Kontext: Für jeden anderen Topf und ohne Topf bleibt es
 * bei „Ausgabe"/„Einnahme".
 */

import type { EntryKind, GoalPhase, Pot } from './types';

type GoalPot = Pick<Pot, 'kind'>;

function isGoal(pot: GoalPot | null): boolean {
  return pot !== null && pot.kind === 'goal';
}

/** Das Wort für eine Buchungsart, abhängig vom (möglichen) Sparziel-Topf. */
export function entryKindLabel(kind: EntryKind, pot: GoalPot | null): string {
  if (isGoal(pot)) return kind === 'expense' ? 'Einzahlen' : 'Ausgeben';
  return kind === 'expense' ? 'Ausgabe' : 'Einnahme';
}

/** Dasselbe als Handlung, für Titel und `aria-label`: „Einzahlen erfassen". */
export function entryKindActionLabel(kind: EntryKind, pot: GoalPot | null): string {
  if (isGoal(pot)) return kind === 'expense' ? 'Einzahlen erfassen' : 'Ausgeben erfassen';
  return kind === 'expense' ? 'Ausgabe erfassen' : 'Einnahme erfassen';
}

/** Welche Buchungsart eine Phase vorbelegt: Einzahlphase → Ausgabe, Auszahlphase → Einnahme. */
export function kindForGoalPhase(phase: GoalPhase): EntryKind {
  return phase === 'saving' ? 'expense' : 'income';
}
