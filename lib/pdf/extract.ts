'use client';

/**
 * Dünne Hülle um pdf.js — die einzige Stelle im Projekt, die es kennt.
 *
 * Geladen wird die Bibliothek erst beim ersten Einlesen (`await import`),
 * nicht im Startbundle: gemessen 131 KB + 375 KB gzip für Kern und Worker.
 * Wer nie einen Bon einliest, lädt nichts davon.
 *
 * Der Worker liegt unter `public/vendor/` mit der Version im Dateinamen —
 * nicht als CDN-Adresse. Zwei Gründe: Die Datenschutzerklärung sagt, dass alle
 * Dateien vom selben Server kommen, und der Dateiname macht die Datei
 * unveränderlich, sodass der Service Worker sie cache-first bedienen darf
 * (`isImmutable()` in `public/sw.js`). Damit funktioniert das Einlesen auch
 * offline.
 *
 * Bei einem Update von `pdfjs-dist` muss die Datei neu kopiert und hier die
 * Version nachgezogen werden:
 *
 *   cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs \
 *      public/vendor/pdf.worker-<version>.min.mjs
 */

import type * as PdfjsModule from 'pdfjs-dist';
import { withBasePath } from '../base-path';
import { groupIntoLines, type TextChunk } from './lines';

type Pdfjs = typeof PdfjsModule;

/** Muss zur Datei in `public/vendor/` und zu `package.json` passen. */
export const PDFJS_VERSION = '6.3.289';

export interface PdfContent {
  /** Angehängte Dateien, Name → Inhalt. Für `ekabs.json`. */
  attachments: Record<string, Uint8Array>;
  /** Textschicht, zu Zeilen zusammengesetzt, Seite für Seite. */
  lines: string[];
}

export class PdfReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PdfReadError';
  }
}

function isTextItem(item: unknown): item is { str: string; transform: number[] } {
  return (
    typeof item === 'object' &&
    item !== null &&
    typeof (item as { str?: unknown }).str === 'string' &&
    Array.isArray((item as { transform?: unknown }).transform)
  );
}

/**
 * Wie pdf.js geladen wird. Im Browser das Standard-Bundle; der Test schiebt
 * den Legacy-Build unter, der ohne DOM läuft. So prüft der Test diesen Code
 * und nicht eine Nachbildung davon.
 */
export type PdfjsLoader = () => Promise<Pdfjs>;

export interface ExtractOptions {
  load?: PdfjsLoader;
  /**
   * Adresse des Workers. `null` heißt: nicht setzen — dann arbeitet pdf.js im
   * eigenen Thread. Das braucht der Test in Node, wo es die Datei aus
   * `public/` nicht gibt; im Browser wäre es die falsche Wahl, weil das
   * Einlesen dann die Oberfläche blockiert.
   */
  workerSrc?: string | null;
}

const defaultLoader: PdfjsLoader = () => import('pdfjs-dist');

export async function extractPdf(blob: Blob, options: ExtractOptions = {}): Promise<PdfContent> {
  const pdfjs = await (options.load ?? defaultLoader)();
  const workerSrc =
    options.workerSrc === undefined
      ? withBasePath(`/vendor/pdf.worker-${PDFJS_VERSION}.min.mjs`)
      : options.workerSrc;
  if (workerSrc !== null) pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const data = new Uint8Array(await blob.arrayBuffer());
  // Keine Schriften vom System: Diese App liest den Beleg, sie stellt ihn
  // nicht dar.
  const task = pdfjs.getDocument({ data, useSystemFonts: false });
  let doc;
  try {
    doc = await task.promise;
  } catch (caught) {
    await task.destroy();
    throw new PdfReadError(
      caught instanceof Error && /password/i.test(caught.message)
        ? 'Das PDF ist mit einem Passwort geschützt.'
        : 'Die Datei ließ sich nicht als PDF lesen.',
    );
  }

  try {
    // pdf.js 6 trennt Verzeichnis und Inhalt: `getAttachments()` liefert eine
    // `Map` mit den Namen, der Inhalt kommt einzeln über
    // `getAttachmentContent(name)`. Bis pdf.js 5 steckte der Inhalt direkt
    // mit drin — wer die alte Form erwartet, findet nichts und merkt es nicht.
    const attachments: Record<string, Uint8Array> = {};
    const verzeichnis = await doc.getAttachments();
    if (verzeichnis) {
      for (const [name, meta] of verzeichnis) {
        const content = meta.content ?? (await doc.getAttachmentContent(name));
        if (content) attachments[name] = content;
      }
    }

    const lines: string[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const chunks: TextChunk[] = [];
      for (const item of content.items) {
        if (!isTextItem(item)) continue;
        chunks.push({ str: item.str, x: item.transform[4] ?? 0, y: item.transform[5] ?? 0 });
      }
      // Seitenweise gruppieren: Die y-Koordinaten beginnen auf jeder Seite
      // wieder oben, quer über Seiten gruppiert würde alles verschmelzen.
      lines.push(...groupIntoLines(chunks));
    }

    return { attachments, lines };
  } finally {
    // Räumt Dokument **und** Worker ab. Ohne das bleibt der Worker-Thread
    // stehen, und beim zweiten Bon läuft ein zweiter daneben.
    await task.destroy();
  }
}
