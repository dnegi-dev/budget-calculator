/**
 * Prüfung hochgeladener Belege — reine Funktion, damit sie testbar ist.
 *
 * `accept` am Datei-Feld ist nur ein Vorschlag für den Dateidialog: Auswählen
 * lässt sich trotzdem alles, und für Dateien aus manchen Android-Quellen
 * meldet der Browser überhaupt keinen Typ. Entschieden wird deshalb hier und
 * nicht im Dialog.
 *
 * Der Grund einer Ablehnung kommt als Kennung zurück, nicht als Satz: Den Satz
 * baut die Oberfläche, die den Dateinamen und die Formatierung der Größe hat.
 * `lib/domain` bleibt so frei von Darstellung.
 */

export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

const PDF_MIME = 'application/pdf';

/** Endung → Typ, falls der Browser keinen meldet. */
const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  heic: 'image/heic',
  heif: 'image/heif',
  pdf: PDF_MIME,
};

export type UploadRejection = 'leer' | 'zu-gross' | 'typ';

export type UploadVerdict = { ok: true; mime: string } | { ok: false; reason: UploadRejection };

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return '';
  return name.slice(dot + 1).toLowerCase();
}

function isAllowed(mime: string): boolean {
  return mime.startsWith('image/') || mime === PDF_MIME;
}

/**
 * Entscheidet, ob eine Datei als Beleg taugt, und liefert den Typ, unter dem
 * sie gespeichert wird. Ein leerer `type` wird aus der Endung geschlossen.
 */
export function classifyUpload(name: string, type: string, size: number): UploadVerdict {
  if (size <= 0) return { ok: false, reason: 'leer' };
  if (size > MAX_UPLOAD_BYTES) return { ok: false, reason: 'zu-gross' };

  const reported = type.trim().toLowerCase().split(';')[0]?.trim() ?? '';
  if (reported !== '') {
    return isAllowed(reported) ? { ok: true, mime: reported } : { ok: false, reason: 'typ' };
  }

  const guessed = MIME_BY_EXTENSION[extensionOf(name)];
  if (guessed === undefined) return { ok: false, reason: 'typ' };
  return { ok: true, mime: guessed };
}
