import { POT_CATEGORY_NAMES, type PotCategory } from '../../lib/domain/pot-categories';
import type { NewPotInput } from '../../lib/domain/types';

/**
 * Vorschläge für die Ersteinrichtung.
 *
 * Mit einer leeren Topf-Liste zu starten ist die größte Hürde: man müsste sich
 * erst überlegen, welche Kategorien man überhaupt will. Die Limits sind
 * bewusst runde Platzhalter und im Wizard änderbar.
 */
export interface SuggestedPot extends NewPotInput {
  /**
   * Der Schlüssel der Kategorie — dieselbe Liste, auf die sich die
   * mitgelieferten Bon-Zuordnungen beziehen. Der **Name** kommt aus
   * `POT_CATEGORY_NAMES`, damit es nicht zwei Listen gibt, von denen eine
   * irgendwann falsch ist: `resolveCategoryPot` sucht den Topf über genau
   * diesen Namen.
   */
  key: PotCategory;
  icon: string;
  color: string;
  /** Voraktiviert, weil fast jeder Haushalt diesen Topf braucht. */
  preselected: boolean;
}

export const SUGGESTED_POTS: readonly SuggestedPot[] = [
  {
    key: 'lebensmittel',
    name: POT_CATEGORY_NAMES.lebensmittel,
    icon: '🛒',
    color: 'emerald',
    kind: 'budget',
    limitCents: 40_000,
    carryOver: false,
    preselected: true,
  },
  {
    key: 'wohnen',
    name: POT_CATEGORY_NAMES.wohnen,
    icon: '🏠',
    color: 'sky',
    kind: 'budget',
    limitCents: 90_000,
    carryOver: false,
    preselected: true,
  },
  {
    key: 'mobilitaet',
    name: POT_CATEGORY_NAMES.mobilitaet,
    icon: '🚗',
    color: 'amber',
    kind: 'budget',
    limitCents: 15_000,
    carryOver: false,
    preselected: true,
  },
  {
    key: 'sport',
    name: POT_CATEGORY_NAMES.sport,
    icon: '🏋️',
    color: 'violet',
    kind: 'envelope',
    limitCents: 5_000,
    carryOver: true,
    preselected: false,
  },
  {
    key: 'freizeit',
    name: POT_CATEGORY_NAMES.freizeit,
    icon: '🎬',
    color: 'rose',
    kind: 'envelope',
    limitCents: 8_000,
    carryOver: true,
    preselected: false,
  },
  {
    key: 'sonstiges',
    name: POT_CATEGORY_NAMES.sonstiges,
    icon: '🧾',
    color: 'slate',
    kind: 'category',
    limitCents: null,
    carryOver: false,
    preselected: true,
  },
];
