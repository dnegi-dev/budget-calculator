/**
 * Bittet den Browser, die Daten dieser App nicht von selbst zu räumen.
 *
 * Ohne diese Bitte darf ein Browser IndexedDB bei Platzmangel leeren — Safari
 * tut es nach einer Weile ohne Besuch sogar ohne Platzmangel. Für eine App, die
 * **nur** auf dem Gerät speichert, wäre das der vollständige Verlust. Eine
 * Garantie ist die Bitte nicht (der Browser entscheidet), aber sie kostet
 * nichts und wird nicht wiederholt, wenn sie schon gewährt ist.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
