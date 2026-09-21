import { POT_CATEGORY_NAMES } from '../../lib/domain/pot-categories';
import type { NewPotInput } from '../../lib/domain/types';

/**
 * Vorschläge für die Ersteinrichtung — ein Beispiel je Topf-Art.
 *
 * Mit einer leeren Topf-Liste zu starten ist die größte Hürde: man müsste sich
 * erst überlegen, welche Kategorien man überhaupt will, und was die vier
 * Topf-Arten überhaupt unterscheidet. Deshalb genau vier Vorschläge, einer je
 * Art: Lebensmittel (Monatsbudget), Haushalt (Nur Kategorie), Hobby (Budget
 * mit Übertrag), Urlaub (Sparziel). Die Beträge sind änderbar — im Wizard
 * schon, und danach jederzeit über die Topf-Einstellungen.
 */
export type OnboardingPotKey = 'lebensmittel' | 'haushalt' | 'hobby' | 'urlaub';

export interface SuggestedPot extends NewPotInput {
  key: OnboardingPotKey;
  icon: string;
  color: string;
  /** Voraktiviert, weil fast jeder Haushalt diesen Topf braucht. */
  preselected: boolean;
}

export const SUGGESTED_POTS: readonly SuggestedPot[] = [
  {
    key: 'lebensmittel',
    // Über POT_CATEGORY_NAMES und nicht als eigenes Literal: Der Bon-Import
    // zielt über genau diesen Namen auf den Topf (`resolveCategoryPot`) — eine
    // zweite Stelle mit demselben Namen wäre irgendwann eine andere.
    name: POT_CATEGORY_NAMES.lebensmittel,
    icon: '🛒',
    color: 'emerald',
    kind: 'budget',
    limitCents: 40_000,
    carryOver: false,
    preselected: true,
  },
  {
    key: 'haushalt',
    // Kein Bon-Profil zielt auf „Haushalt" — anders als „Lebensmittel" also
    // ein freier Name, kein Eintrag in `pot-categories.ts` nötig.
    name: 'Haushalt',
    icon: '🏠',
    color: 'sky',
    kind: 'category',
    limitCents: null,
    carryOver: false,
    preselected: true,
  },
  {
    key: 'hobby',
    name: 'Hobby',
    icon: '🎨',
    color: 'violet',
    kind: 'envelope',
    limitCents: 8_000,
    carryOver: true,
    preselected: false,
  },
  {
    key: 'urlaub',
    name: 'Urlaub',
    icon: '✈️',
    color: 'amber',
    kind: 'goal',
    limitCents: null,
    carryOver: false,
    goalCents: 120_000,
    preselected: false,
  },
];
