/**
 * Die Registry — die einzige Liste aller Bon-Profile.
 *
 * Ein neues Profil bedeutet: einen Ordner mit Tiernamen anlegen, `index.ts`
 * und `produkte.ts` darin, und hier eine Zeile. Mehr nicht; niemand sonst
 * kennt die Profile.
 *
 * Die Reihenfolge entscheidet bei Gleichstand der Fingerabdrücke (siehe
 * `matchProfile`) — deshalb ist sie fest und nicht alphabetisch sortiert.
 */

import type { ChainProfile } from '../profile';
import { LUCHS } from './luchs';

export const CHAIN_PROFILES: readonly ChainProfile[] = [LUCHS];
