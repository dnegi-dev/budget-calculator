'use client';

import { useSyncExternalStore } from 'react';
import {
  getAmountMode,
  getTheme,
  subscribePrefs,
  type AmountMode,
  type ThemeChoice,
} from './device-prefs';

/**
 * Beim Server-Rendern gilt die Voreinstellung: Im ausgelieferten HTML darf
 * nichts stehen, was vom `localStorage` des Besuchers abhängt — sonst weicht
 * die Hydrierung ab. Für das Thema ist das unkritisch, weil das
 * Bootstrap-Skript das Attribut vorher setzt und `applyTheme` es nicht über
 * React rendert.
 */
export function useTheme(): ThemeChoice {
  return useSyncExternalStore(subscribePrefs, getTheme, () => 'system');
}

export function useAmountMode(): AmountMode {
  return useSyncExternalStore(subscribePrefs, getAmountMode, () => 'cents');
}
