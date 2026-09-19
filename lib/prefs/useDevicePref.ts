'use client';

import { useSyncExternalStore } from 'react';
import {
  getAmountMode,
  getAppearance,
  getDeleteButton,
  getIconStyle,
  getSwipeConfirm,
  getSwipeDelete,
  getThemeChoice,
  subscribePrefs,
  type AmountMode,
  type Appearance,
  type IconStyle,
  type ThemeChoice,
} from './device-prefs';

/**
 * Beim Server-Rendern gilt die Voreinstellung: Im ausgelieferten HTML darf
 * nichts stehen, was vom `localStorage` des Besuchers abhängt — sonst weicht
 * die Hydrierung ab. Für die Darstellung ist das unkritisch, weil das
 * Bootstrap-Skript die Attribute vorher setzt und `applyAppearance` sie nicht
 * über React rendert.
 */
export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(subscribePrefs, getThemeChoice, () => 'system');
}

export function useAmountMode(): AmountMode {
  return useSyncExternalStore(subscribePrefs, getAmountMode, () => 'cents');
}

export function useIconStyle(): IconStyle {
  return useSyncExternalStore(subscribePrefs, getIconStyle, () => 'normal');
}

export function useSwipeDelete(): boolean {
  return useSyncExternalStore(subscribePrefs, getSwipeDelete, () => true);
}

export function useSwipeConfirm(): boolean {
  return useSyncExternalStore(subscribePrefs, getSwipeConfirm, () => true);
}

export function useDeleteButton(): boolean {
  return useSyncExternalStore(subscribePrefs, getDeleteButton, () => true);
}

/**
 * Der ganze aufgelöste Zustand — für die Seite „Darstellung“, die zeigen muss,
 * welches Theme in *diesem* Modus gerade gilt.
 *
 * `getAppearance` erzeugt bei jedem Aufruf ein neues Objekt.
 * `useSyncExternalStore` vergleicht mit `Object.is` und würde daraus eine
 * Endlosschleife machen, deshalb der Zwischenspeicher: ein neues Objekt gibt es
 * nur, wenn sich ein Feld wirklich geändert hat.
 */
let cached: Appearance | null = null;

function appearanceSnapshot(): Appearance {
  const next = getAppearance();
  if (
    cached === null ||
    cached.choice !== next.choice ||
    cached.mode !== next.mode ||
    cached.theme !== next.theme ||
    cached.themeLight !== next.themeLight ||
    cached.themeDark !== next.themeDark ||
    cached.accent !== next.accent ||
    cached.amoled !== next.amoled
  ) {
    cached = next;
  }
  return cached;
}

const SERVER_APPEARANCE: Appearance = {
  choice: 'system',
  mode: 'light',
  theme: 'classic',
  themeLight: 'classic',
  themeDark: 'classic',
  accent: 'indigo',
  amoled: false,
};

export function useAppearance(): Appearance {
  return useSyncExternalStore(subscribePrefs, appearanceSnapshot, () => SERVER_APPEARANCE);
}
