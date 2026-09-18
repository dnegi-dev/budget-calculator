/**
 * Vorschaubild für einen Beleg.
 *
 * Ein Handyfoto ist gern 4 MB groß. In einer Liste mit zwanzig Buchungen wären
 * das 80 MB, die der Browser dekodieren müsste — deshalb wird beim Hochladen
 * einmal ein kleines Bild erzeugt und mitgespeichert.
 *
 * Das Original bleibt unverändert: Es ist der Beweis, und ein komprimierter
 * Beweis ist keiner.
 */

const MAX_EDGE = 320;
const QUALITY = 0.72;

export async function createThumbnail(file: Blob): Promise<Blob | null> {
  if (!file.type.startsWith('image/')) return null;
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', QUALITY);
    });
  } catch {
    // Kein Vorschaubild ist kein Fehler — die Liste zeigt dann ein Symbol.
    return null;
  }
}
