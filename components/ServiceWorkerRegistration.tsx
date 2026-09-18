'use client';

/**
 * Registriert den Service Worker.
 *
 * Nur in Produktion: Im Entwicklungsbetrieb würde ein Cache-First-Worker
 * geänderte Dateien ausliefern, die längst überholt sind — die Fehlersuche
 * danach kostet mehr Zeit als der Offline-Betrieb bringt.
 */

import { useEffect } from 'react';
import { withBasePath } from '../lib/base-path';

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    const timer = window.setTimeout(() => {
      // Erst nach dem ersten Rendern registrieren: Der Start der App soll nicht
      // mit dem Download des Workers konkurrieren.
      // Der Worker muss unterhalb des Präfixes liegen, sonst ist sein Scope zu weit.
      void navigator.serviceWorker.register(withBasePath('/sw.js')).catch(() => {
        // Ein fehlgeschlagener Worker ist kein Grund, die App zu stören.
      });
    }, 1_200);

    return () => window.clearTimeout(timer);
  }, []);

  return null;
}
