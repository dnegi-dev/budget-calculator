'use client';

import { useSyncExternalStore } from 'react';
import { isUnlocked, subscribeUnlock } from './local-credentials';

/**
 * Ob das Anmeldefenster passiert wurde.
 *
 * Über `useSyncExternalStore`, damit ein Abmelden in einem zweiten Tab sofort
 * greift — und damit beim Server-Rendering nichts vom `localStorage` gelesen
 * wird, den es dort nicht gibt.
 */
export function useUnlocked(): boolean {
  return useSyncExternalStore(
    subscribeUnlock,
    isUnlocked,
    // Beim Prerendern gilt „nicht entsperrt": So steht im ausgelieferten HTML
    // das Anmeldefenster und nicht kurz die App.
    () => false,
  );
}
