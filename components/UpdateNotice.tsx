'use client';

/**
 * Hinweis, wenn eine neuere Fassung veröffentlicht wurde.
 *
 * Bewusst **kein** automatisches Neuladen: Ein Reload mitten in einer halb
 * getippten Buchung verwirft sie ohne Nachfrage. Der eigentliche Fehler — nach
 * einem Update die alte Fassung aus dem Cache — ist im Service Worker behoben
 * (`public/sw.js`, network-first für alles, was keinen Hash im Namen hat).
 * Diese Leiste deckt den anderen Fall ab: Die Seite war beim Update offen.
 *
 * Geprüft wird beim Start, beim Zurückkommen in den Tab und halbstündlich.
 * Ohne `NEXT_PUBLIC_BUILD_VERSION` (lokal, im Test) passiert nichts.
 */

import { useEffect, useState } from 'react';
import { withBasePath } from '../lib/base-path';
import { BUILD_VERSION, VERSION_FILE } from '../lib/build-version';

const CHECK_INTERVAL_MS = 30 * 60 * 1000;

function versionOf(data: unknown): string {
  if (typeof data !== 'object' || data === null) return '';
  const value = (data as { version?: unknown }).version;
  return typeof value === 'string' ? value : '';
}

export function UpdateNotice() {
  const [outdated, setOutdated] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (BUILD_VERSION === '') return;

    let cancelled = false;
    const worker = 'serviceWorker' in navigator ? navigator.serviceWorker : null;

    async function check() {
      try {
        const response = await fetch(withBasePath(VERSION_FILE), { cache: 'no-store' });
        if (!response.ok) return;
        const version = versionOf(await response.json());
        if (cancelled || version === '' || version === BUILD_VERSION) return;
        setOutdated(true);
        // Den Worker anstoßen, damit das Neuladen schon die neuen Dateien
        // vorfindet und nicht ein zweites Mal nötig ist.
        const registration = await worker?.getRegistration();
        await registration?.update();
      } catch {
        // Offline ist kein Anlass für eine Meldung.
      }
    }

    void check();
    const timer = window.setInterval(() => void check(), CHECK_INTERVAL_MS);

    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);

    // Wechselt der Worker, während die Seite offen ist, liegt eine neue
    // Fassung bereit — auch ohne dass die Abfrage oben schon gelaufen ist.
    const onController = () => setOutdated(true);
    worker?.addEventListener('controllerchange', onController);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      worker?.removeEventListener('controllerchange', onController);
    };
  }, []);

  if (!outdated || dismissed) return null;

  return (
    // Im Fluss und nicht `fixed`: Eine feste Leiste am oberen Rand liegt über
    // dem Inhalt, und weil die App mobil bewusst keine Kopfzeile hat, ist die
    // oberste Bildschirmzeile bedienbar. Beim Prüfen hat die Leiste genau das
    // abgefangen — Klicks gingen an sie statt an das Feld darunter. So schiebt
    // sie den Inhalt einmal nach unten und nimmt niemandem den Platz weg.
    <div
      role="status"
      className="flex items-center justify-center gap-3 bg-accent px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 text-sm text-accent-ink"
    >
      <span>Neue Version verfügbar.</span>
      <button
        type="button"
        className="rounded-lg bg-black/15 px-2.5 py-1 font-medium"
        onClick={() => window.location.reload()}
      >
        Neu laden
      </button>
      <button
        type="button"
        aria-label="Hinweis ausblenden"
        className="px-1 opacity-80"
        onClick={() => setDismissed(true)}
      >
        <span aria-hidden>✕</span>
      </button>
    </div>
  );
}
