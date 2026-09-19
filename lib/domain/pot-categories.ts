/**
 * Die Topf-Kategorien — der Schlüssel zwischen mitgelieferten Zuordnungen und
 * den Töpfen eines Haushalts.
 *
 * **Warum es diese Zwischenschicht gibt:** Töpfe gehören dem Haushalt und
 * tragen zufällige IDs. Eine Tabelle, die im Code mitgeliefert wird, kann sie
 * unmöglich kennen — sie kann nur sagen „das ist etwas zum Essen". Welcher
 * Topf das auf diesem Gerät ist, entscheidet `resolveCategoryPot`.
 *
 * Die Schlüssel sind dieselben, unter denen die Ersteinrichtung ihre Töpfe
 * vorschlägt (`components/onboarding/suggested-pots.ts`) — deshalb stehen die
 * Namen hier und nicht dort: Sonst gäbe es zwei Listen, und die zweite wäre
 * irgendwann falsch.
 */

import type { Pot } from './types';

export type PotCategory =
  'lebensmittel' | 'wohnen' | 'mobilitaet' | 'sport' | 'freizeit' | 'sonstiges';

export const POT_CATEGORIES: readonly PotCategory[] = [
  'lebensmittel',
  'wohnen',
  'mobilitaet',
  'sport',
  'freizeit',
  'sonstiges',
];

/** Der Name, unter dem die Ersteinrichtung einen Topf dieser Kategorie anlegt. */
export const POT_CATEGORY_NAMES: Record<PotCategory, string> = {
  lebensmittel: 'Lebensmittel',
  wohnen: 'Wohnen',
  mobilitaet: 'Mobilität',
  sport: 'Sport',
  freizeit: 'Freizeit',
  sonstiges: 'Sonstiges',
};

/**
 * Sucht den Topf des Haushalts zu einer Kategorie — über den Namen.
 *
 * Über den Namen und nicht über ein Feld am Topf, weil der Topf keines hat und
 * eines nachzurüsten eine Migration wäre für etwas, das nur vorschlägt.
 * Der Preis ist ehrlich: Wer „Lebensmittel" in „Essen" umbenennt, bekommt für
 * diese Kategorie keine Vorschläge mehr. Das ist besser als die Alternative —
 * auf einen Topf zu buchen, den der Nutzer nicht gemeint hat.
 *
 * Archivierte Töpfe zählen nicht: Auf sie soll nichts Neues laufen.
 */
export function resolveCategoryPot(kategorie: PotCategory, pots: readonly Pot[]): string | null {
  const gesucht = POT_CATEGORY_NAMES[kategorie].toLowerCase();
  const treffer = pots.find(
    (pot) => pot.archivedAt === null && pot.name.trim().toLowerCase() === gesucht,
  );
  return treffer?.id ?? null;
}
