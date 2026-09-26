/**
 * Freitextsuche über Listen — eine Regel für alle.
 *
 * Vorher stand `trim().toLowerCase().includes()` siebenmal im Code, und die
 * Suche über Buchungen zweimal (Liste und Repository) mit denselben drei
 * Feldern. Als `address` dazukam, musste jemand beide Stellen finden; eine
 * übersehene hätte „gefunden" und „nicht gefunden" je nach Weg bedeutet.
 */

import type { Entry } from './types';

/** Der Suchbegriff in der Form, in der verglichen wird. */
export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

/**
 * Ob einer der Texte den Begriff enthält. Ein leerer Begriff trifft alles —
 * eine leere Suche filtert nicht.
 */
export function matchesQuery(
  query: string,
  ...texts: readonly (string | null | undefined)[]
): boolean {
  const needle = normalizeQuery(query);
  if (needle === '') return true;
  return texts.some((text) => (text ?? '').toLowerCase().includes(needle));
}

/** Gesucht wird in dem, was an einer Buchung Text ist: Notiz, Firma, Anschrift. */
export function entryMatchesQuery(
  entry: Pick<Entry, 'note' | 'merchant' | 'address'>,
  query: string,
): boolean {
  return matchesQuery(query, entry.note, entry.merchant, entry.address);
}
