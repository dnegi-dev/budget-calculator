import type { NewPotInput } from '../../lib/domain/types';

/**
 * Vorschläge für die Ersteinrichtung.
 *
 * Mit einer leeren Topf-Liste zu starten ist die größte Hürde: man müsste sich
 * erst überlegen, welche Kategorien man überhaupt will. Die Limits sind
 * bewusst runde Platzhalter und im Wizard änderbar.
 */
export interface SuggestedPot extends NewPotInput {
  key: string;
  icon: string;
  color: string;
  /** Voraktiviert, weil fast jeder Haushalt diesen Topf braucht. */
  preselected: boolean;
}

export const SUGGESTED_POTS: readonly SuggestedPot[] = [
  {
    key: 'lebensmittel',
    name: 'Lebensmittel',
    icon: '🛒',
    color: 'emerald',
    kind: 'budget',
    limitCents: 40_000,
    carryOver: false,
    preselected: true,
  },
  {
    key: 'wohnen',
    name: 'Wohnen',
    icon: '🏠',
    color: 'sky',
    kind: 'budget',
    limitCents: 90_000,
    carryOver: false,
    preselected: true,
  },
  {
    key: 'mobilitaet',
    name: 'Mobilität',
    icon: '🚗',
    color: 'amber',
    kind: 'budget',
    limitCents: 15_000,
    carryOver: false,
    preselected: true,
  },
  {
    key: 'sport',
    name: 'Sport',
    icon: '🏋️',
    color: 'violet',
    kind: 'envelope',
    limitCents: 5_000,
    carryOver: true,
    preselected: false,
  },
  {
    key: 'freizeit',
    name: 'Freizeit',
    icon: '🎬',
    color: 'rose',
    kind: 'envelope',
    limitCents: 8_000,
    carryOver: true,
    preselected: false,
  },
  {
    key: 'sonstiges',
    name: 'Sonstiges',
    icon: '🧾',
    color: 'slate',
    kind: 'category',
    limitCents: null,
    carryOver: false,
    preselected: true,
  },
];
