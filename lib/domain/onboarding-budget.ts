/**
 * Fester Schlüssel für die Ersteinrichtung: ein Anteil vom Einkommen als
 * Vorschlag für die Vorschlags-Töpfe mit Limit.
 *
 * Nur `budget`/`envelope` haben ein Limit, auf das sich ein Anteil überhaupt
 * anwenden lässt — „Nur Kategorie" hat keines, und ein Sparziel hat einen
 * Zielbetrag über die gesamte Lebenszeit des Topfes, keinen Periodenanteil.
 * Beide bleiben hier deshalb außen vor; die Ersteinrichtung schlägt für sie
 * feste Beträge vor (`components/onboarding/suggested-pots.ts`).
 */
export const INCOME_PERCENT_SUGGESTIONS = {
  lebensmittel: 0.15,
  hobby: 0.05,
} as const;

/**
 * Ein Anteil vom Einkommen, gerundet auf den vollen Euro — ein Budget von
 * 37,42 € ist kein Vorschlag, den man ungeprüft übernimmt.
 *
 * Nicht-positives Einkommen ergibt 0: Ein Anteil von nichts ist nichts, und
 * der Aufrufer muss so nicht selbst auf `incomeCents <= 0` prüfen.
 */
export function amountFromIncomePercent(incomeCents: number, percent: number): number {
  if (incomeCents <= 0) return 0;
  return Math.round((incomeCents * percent) / 100) * 100;
}
