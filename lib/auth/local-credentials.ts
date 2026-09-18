/**
 * Zugangsdaten für das Anmeldefenster vor der App.
 *
 * **Das ist kein Zugriffsschutz.** Die App ist ein statisches Bundle auf
 * GitHub Pages: Jede Datei wird an jeden ausgeliefert, der sie anfragt, und
 * das Passwort steht im ausgelieferten JavaScript. Wer `curl` kennt oder den
 * Quelltext ansieht, kommt daran vorbei.
 *
 * Was es leistet: Es hält Gelegenheitsbesucher ab, die die Seite zufällig
 * öffnen. Mehr ist es nicht, und mehr soll hier auch niemand hineinlesen —
 * deshalb kein Hashing und kein Salt: Beides würde Sicherheit vortäuschen,
 * wo der Klartext zwei Zeilen weiter im selben Bundle steht.
 *
 * Echter Schutz bräuchte eine serverseitige Abfrage vor der Auslieferung
 * (Basic Auth, Cloudflare Access o. ä.) — also ein anderes Hosting. Siehe
 * STATE.md.
 *
 * Die Daten des Nutzers sind davon ohnehin nicht berührt: Sie liegen in der
 * IndexedDB des jeweiligen Browsers und erreichen niemanden sonst.
 */

export const APP_USER = process.env.NEXT_PUBLIC_APP_USER ?? 'admin';
export const APP_PASSWORD = process.env.NEXT_PUBLIC_APP_PASSWORD ?? 'admin';

/** Schlüssel im localStorage. Ein Merker, kein Token — er beweist nichts. */
export const UNLOCK_KEY = 'haushalt.unlocked';

export function checkCredentials(user: string, password: string): boolean {
  return user.trim() === APP_USER && password === APP_PASSWORD;
}

/**
 * Lesen und Schreiben gekapselt, weil `localStorage` werfen kann: im privaten
 * Modus oder bei gesperrten Website-Daten. Ein Fehler darf hier nicht die App
 * anhalten — dann steht eben das Anmeldefenster da.
 */
export function isUnlocked(): boolean {
  try {
    return localStorage.getItem(UNLOCK_KEY) === '1';
  } catch {
    return false;
  }
}

export function setUnlocked(unlocked: boolean): void {
  try {
    if (unlocked) localStorage.setItem(UNLOCK_KEY, '1');
    else localStorage.removeItem(UNLOCK_KEY);
  } catch {
    // Ohne Speicher bleibt die Anmeldung auf diese Sitzung beschränkt.
  }
  // `storage` feuert nur in *anderen* Tabs. Damit der eigene Tab ebenfalls
  // neu rendert, wird hier zusätzlich benachrichtigt.
  notifyUnlockChange();
}

const listeners = new Set<() => void>();

function notifyUnlockChange(): void {
  for (const listener of listeners) listener();
}

/** Abo-Quelle für `useSyncExternalStore` — eigener Tab und fremde Tabs. */
export function subscribeUnlock(listener: () => void): () => void {
  listeners.add(listener);

  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === UNLOCK_KEY) listener();
  };
  window.addEventListener('storage', onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}
