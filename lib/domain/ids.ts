/**
 * IDs werden **auf dem Client** erzeugt — UUID v4.
 *
 * Das ist die Voraussetzung dafür, dass ein späterer Server die bereits lokal
 * angelegten Daten unverändert annehmen kann. Würden IDs serverseitig vergeben,
 * müsste beim ersten Sync jede Referenz umgeschrieben werden.
 */

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback für Umgebungen ohne WebCrypto (alte Browser, Test-Runner).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function isId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 64;
}
