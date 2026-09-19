/**
 * Was der schwebende Knopf tut, wenn man ihn antippt.
 *
 * Bisher fragte er jedes Mal „Ausgabe oder Einnahme?". Gemeint ist fast immer
 * eine Ausgabe, und die Frage kostete bei jeder Erfassung einen Schritt. Also
 * hat der Knopf eine Standardaktion — einstellbar, weil „fast immer" nicht
 * „immer" heißt: Wer seine Einnahmen einzeln erfasst, will auf der
 * Buchungsseite etwas anderes als auf einer Topf-Seite.
 *
 * Die Zuordnung Pfad → Bereich steht hier und nicht in der Komponente, weil
 * sie zwei Verbraucher hat: den Knopf selbst und die Einstellungsseite, die je
 * Bereich eine Zeile anzeigt. Zweimal geschrieben wäre sie zweimal zu pflegen.
 */

import type { FabAction, FabScope, Household } from './types';

export interface FabScopeInfo {
  scope: FabScope;
  label: string;
  hint: string;
}

/**
 * Reihenfolge wie in der Navigation, nicht alphabetisch — die
 * Einstellungsseite listet sie genau so.
 */
export const FAB_SCOPES: readonly FabScopeInfo[] = [
  { scope: 'home', label: 'Heute', hint: 'Die Startseite mit den Töpfen' },
  { scope: 'pots', label: 'Töpfe', hint: 'Die Übersicht aller Töpfe' },
  { scope: 'potDetail', label: 'Einzelner Topf', hint: 'Dort ist der Topf schon vorbelegt' },
  { scope: 'entries', label: 'Buchungen', hint: 'Die Liste mit Suche und Filtern' },
  { scope: 'recurring', label: 'Wiederkehrend', hint: 'Die Unterseite mit den Regeln' },
  { scope: 'analysis', label: 'Auswertung', hint: 'Diagramme und Summen' },
];

export const FAB_ACTIONS: readonly { value: FabAction; label: string }[] = [
  { value: 'expense', label: 'Ausgabe' },
  { value: 'income', label: 'Einnahme' },
  { value: 'ask', label: 'Fragen' },
];

/**
 * Pfad → Bereich, oder `null` für „kein eigener Bereich".
 *
 * `null` heißt: Es gilt die allgemeine Einstellung. Ob der Knopf überhaupt
 * erscheint, sagt `fabVisibleOnPath` — zwei Fragen, zwei Funktionen, sonst
 * wäre „Impressum" von „Einstellungen" nicht zu unterscheiden.
 *
 * Die längeren Pfade zuerst: `/buchungen/wiederkehrend` ist kein
 * `/buchungen`, und `/toepfe/detail` kein `/toepfe`.
 */
export function scopeForPath(pathname: string): FabScope | null {
  const pfad = normalisePath(pathname);

  if (pfad === '/') return 'home';
  if (pfad.startsWith('/buchungen/wiederkehrend')) return 'recurring';
  if (pfad.startsWith('/buchungen')) return 'entries';
  if (pfad.startsWith('/toepfe/detail')) return 'potDetail';
  if (pfad.startsWith('/toepfe')) return 'pots';
  if (pfad.startsWith('/auswertung')) return 'analysis';

  return null;
}

/**
 * Ob der Knopf auf dieser Seite überhaupt steht.
 *
 * Nicht in den Einstellungen: Dort erfasst niemand etwas, und der Knopf lag
 * beim Prüfen auf den Schaltern. Nicht auf den Rechtsseiten: Die sind ohne
 * eingerichteten Haushalt erreichbar, ein Erfassen-Knopf wäre dort ins Leere
 * gezielt. Die Regel stand vorher als `startsWith` in der Komponente; hier
 * ist sie geprüft.
 */
export function fabVisibleOnPath(pathname: string): boolean {
  const pfad = normalisePath(pathname);
  return !(
    pfad.startsWith('/einstellungen') ||
    pfad.startsWith('/impressum') ||
    pfad.startsWith('/datenschutz')
  );
}

/**
 * Die Aktion für einen Bereich: die eigene Einstellung schlägt die
 * allgemeine, und ohne beides bleibt es bei der Ausgabe.
 *
 * `undefined` in `fabScopes` heißt „wie überall" — deshalb ein fehlender
 * Schlüssel und nicht ein eigener Wert `'inherit'`: Ein Bereich, für den
 * nichts eingestellt ist, soll dem Allgemeinen folgen, auch wenn das
 * nachträglich geändert wird.
 */
export function resolveFabAction(
  household: Pick<Household, 'fabDefault' | 'fabScopes'> | null,
  scope: FabScope | null,
): FabAction {
  if (!household) return 'expense';
  const eigene = scope ? household.fabScopes?.[scope] : undefined;
  return eigene ?? household.fabDefault ?? 'expense';
}

/**
 * Das Beschriftungspaar für den Knopf: was er tut, und dass es mehr gibt.
 *
 * Steht hier, weil der Text die Aktion benennt und nicht das Aussehen — und
 * weil er an zwei Stellen gebraucht wird (`aria-label` und der Titel des
 * Menüs).
 */
export function fabLabel(action: FabAction): string {
  if (action === 'income') return 'Einnahme erfassen';
  if (action === 'ask') return 'Buchung erfassen';
  return 'Ausgabe erfassen';
}

/**
 * `trailingSlash: true` im Export heißt: der Pfad kommt als `/buchungen/`.
 * Ohne diese Zeile griffe keine `startsWith`-Regel mit nachfolgendem Segment,
 * und `/` selbst darf den Schrägstrich behalten.
 */
function normalisePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1);
  return pathname;
}
