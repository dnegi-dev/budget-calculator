/**
 * Prüft den PDF-Weg an echten Dateien.
 *
 * Die Muster unter `e2e/fixtures/` sind von Hand gebaut (`build.mjs`) und
 * gehen durch dieselbe Funktion, die auch im Browser läuft — pdf.js wird nur
 * über den Legacy-Build eingehängt, der ohne DOM auskommt. Eine Nachbildung
 * der Funktion im Test hätte den Fehler nicht gefunden, den es hier schon
 * gab: pdf.js 6 liefert Anhänge als `Map` ohne Inhalt, der Inhalt kommt
 * einzeln über `getAttachmentContent`.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractPdf, type PdfjsLoader } from './extract';
import { parseEkabs, parseTextLines } from '../domain/receipt-parse';

/** Legacy-Build und kein Worker: läuft in Node ohne DOM und ohne `public/`. */
const inNode = {
  load: (() =>
    import('pdfjs-dist/legacy/build/pdf.mjs') as ReturnType<PdfjsLoader>) satisfies PdfjsLoader,
  workerSrc: null,
};

function fixture(name: string): Blob {
  return new Blob([readFileSync(`e2e/fixtures/${name}`)], { type: 'application/pdf' });
}

describe('extractPdf', () => {
  it('setzt die Textschicht eines Bons zu Zeilen zusammen', async () => {
    const { lines, attachments } = await extractPdf(fixture('bon-textschicht.pdf'), inNode);

    expect(attachments).toEqual({});
    // Name links, Betrag rechts — im PDF zwei Textstücke, hier eine Zeile.
    expect(lines).toContain('5 x Brötchen 2,50');
    expect(lines).toContain('SUMME 4,50');
  });

  it('liest daraus Posten, die auf die Summe aufgehen', async () => {
    const { lines } = await extractPdf(fixture('bon-textschicht.pdf'), inNode);
    const parsed = parseTextLines(lines);

    expect(parsed.quality).toBe('geprüft');
    expect(parsed.totalCents).toBe(450);
    expect(parsed.date).toBe('2026-09-18');
    expect(parsed.merchant).toBe('Musterbäckerei Schmidt');
    expect(parsed.items.map((item) => [item.label, item.amountCents])).toEqual([
      ['Brötchen', 250],
      ['Kaffee to go', 200],
      ['Pfand Becher', 25],
      ['Rabatt Stammkunde', -25],
    ]);
  });

  it('findet die angehängte ekabs.json und liest sie exakt', async () => {
    const { attachments } = await extractPdf(fixture('bon-ekabs.pdf'), inNode);

    expect(Object.keys(attachments)).toEqual(['ekabs.json']);
    const roh = attachments['ekabs.json'];
    expect(roh).toBeDefined();
    const parsed = parseEkabs(JSON.parse(new TextDecoder().decode(roh)));

    expect(parsed?.quality).toBe('exakt');
    expect(parsed?.totalCents).toBe(450);
    expect(parsed?.items).toHaveLength(4);
    expect(parsed?.items[0]).toEqual({ label: 'Brötchen', amountCents: 250, quantity: 5 });
  });

  it('meldet eine Datei, die kein PDF ist, als Fehler', async () => {
    const kein = new Blob(['das ist kein PDF'], { type: 'application/pdf' });
    await expect(extractPdf(kein, inNode)).rejects.toThrow(/nicht als PDF lesen/);
  });
});
