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
 * **Es ist der Legacy-Build, und das ist keine Bequemlichkeit.** Das
 * Standard-Bundle von pdf.js 6 benutzt `Map.prototype.getOrInsertComputed` —
 * eine sehr junge JS-Methode. Fehlt sie im Browser, wirft der XRef-Cache
 * `TypeError: getOrInsertComputed is not a function`, pdf.js fällt auf
 * „Indexing all PDF objects" zurück und liefert bei einem echten Bon nichts
 * Brauchbares mehr. Die handgebauten Muster überlebten diesen Rückfall, der
 * Beleg einer Supermarktkette nicht — der Fehler war also mit den Mustern
 * allein nicht zu sehen. Der Legacy-Build ist transpiliert und genau für solche Browser da.
 *
 * Aus demselben Grund liest diese Hülle die Textschicht selbst über
 * `streamTextContent().getReader()` statt über `page.getTextContent()`: siehe
 * `readTextChunks()`.
 *
 * Bei einem Update von `pdfjs-dist` muss die Datei neu kopiert und hier die
 * Version nachgezogen werden — **aus `legacy/`**:
 *
 *   cp node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs \
 *      public/vendor/pdf.worker-<version>-legacy.min.mjs
 */

import type * as PdfjsModule from 'pdfjs-dist';
import { withBasePath } from '../base-path';
import { groupIntoLines, type TextChunk } from './lines';

type Pdfjs = typeof PdfjsModule;
type PdfPage = PdfjsModule.PDFPageProxy;

/**
 * Ein Stück der Textschicht, wie es aus `streamTextContent()` kommt.
 *
 * pdf.js typisiert den Stream nur als `ReadableStream` ohne Elementtyp; die
 * Posten werden hier sowieso einzeln über `isTextItem` geprüft.
 */
interface TextContentChunk {
  items?: unknown[];
}

/** Muss zur Datei in `public/vendor/` und zu `package.json` passen. */
export const PDFJS_VERSION = '6.3.289';

/** Dateiname des mitgelieferten Workers. `-legacy`, siehe Kopfkommentar. */
export const PDF_WORKER_FILE = `pdf.worker-${PDFJS_VERSION}-legacy.min.mjs`;

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
 * Wie pdf.js geladen wird.
 *
 * Browser und Test nehmen denselben Legacy-Build; der Test setzt nur
 * `workerSrc: null`, weil es `public/` in Node nicht gibt. Dass beide denselben
 * Build nehmen, ist Absicht: Vorher lief der Test gegen `legacy/` und der
 * Browser gegen das Standard-Bundle — und genau in dieser Lücke saß ein Fehler,
 * den kein Test sehen konnte.
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

export const defaultLoader: PdfjsLoader = () =>
  import('pdfjs-dist/legacy/build/pdf.mjs') as Promise<Pdfjs>;

/**
 * Holt die Textstücke einer Seite über den Reader des Streams.
 *
 * `page.getTextContent()` wäre eine Zeile, tut intern aber
 * `for await (const value of stream)` — und **Safari hat
 * `ReadableStream[Symbol.asyncIterator]` nicht**, nur Chromium und Firefox.
 * Dort wirft pdf.js deshalb „undefined is not a function", erst nach dem Laden
 * des Dokuments; für den Nutzer sah das aus wie ein unlesbares PDF.
 *
 * `getReader()` gibt es überall. `streamTextContent()` ist dieselbe öffentliche
 * Schnittstelle, die `getTextContent()` selbst benutzt — hier wird nur die
 * Schleife von Hand geschrieben. `e2e/bon-import.spec.ts` nimmt dem Browser den
 * Symbol.asyncIterator weg und prüft genau diesen Weg.
 */
async function readTextChunks(page: PdfPage): Promise<TextChunk[]> {
  const reader = (page.streamTextContent() as ReadableStream<TextContentChunk>).getReader();
  const chunks: TextChunk[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const item of value?.items ?? []) {
        if (!isTextItem(item)) continue;
        chunks.push({ str: item.str, x: item.transform[4] ?? 0, y: item.transform[5] ?? 0 });
      }
    }
  } finally {
    // Ohne das bleibt der Stream gesperrt; pdf.js bricht ihn beim Abräumen des
    // Dokuments dann mit einer Warnung ab.
    reader.releaseLock();
  }
  return chunks;
}

export async function extractPdf(blob: Blob, options: ExtractOptions = {}): Promise<PdfContent> {
  const pdfjs = await (options.load ?? defaultLoader)();
  const workerSrc =
    options.workerSrc === undefined
      ? withBasePath(`/vendor/${PDF_WORKER_FILE}`)
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
      // Seitenweise gruppieren: Die y-Koordinaten beginnen auf jeder Seite
      // wieder oben, quer über Seiten gruppiert würde alles verschmelzen.
      lines.push(...groupIntoLines(await readTextChunks(page)));
    }

    return { attachments, lines };
  } finally {
    // Räumt Dokument **und** Worker ab. Ohne das bleibt der Worker-Thread
    // stehen, und beim zweiten Bon läuft ein zweiter daneben.
    await task.destroy();
  }
}
