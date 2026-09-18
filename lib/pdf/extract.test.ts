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
import { defaultLoader, extractPdf } from './extract';
import { parseEkabs, parseTextLines } from '../domain/receipt-parse';

/**
 * Derselbe Build wie im Browser, nur ohne Worker: den gibt es in Node nicht,
 * weil `public/` dort nicht ausgeliefert wird.
 *
 * Bewusst `defaultLoader` und kein eigener Import. Vorher stand hier der
 * Legacy-Build, während der Browser das Standard-Bundle nahm — in dieser Lücke
 * saß ein Fehler, den kein Test sehen konnte.
 */
const inNode = { load: defaultLoader, workerSrc: null };

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

describe('Supermarkt-Aufbau', () => {
  /**
   * Das Muster hat den Aufbau eines echten Bons — und genau die Stellen, an
   * denen der Parser einmal gescheitert ist. Ohne den Schnitt an der
   * Summenzeile zählten die Bonus-Beträge der Fußzeile mit, die Summenprobe
   * riss, und die Aufteilung fiel ganz aus.
   */
  it('liest die Posten und lässt die Fußzeile draußen', async () => {
    const { lines } = await extractPdf(fixture('bon-supermarkt.pdf'), inNode);
    const parsed = parseTextLines(lines);

    expect(parsed.quality).toBe('geprüft');
    expect(parsed.totalCents).toBe(2417);
    // Gesperrt gesetzter Kopf: „K A U F L A D E N" ist der Händler, nicht die
    // Straße darunter.
    expect(parsed.merchant).toBe('KAUFLADEN');
    expect(parsed.date).toBe('2026-09-18');

    const labels = parsed.items.map((item) => item.label);
    expect(labels).toEqual([
      'HAFERDRINK',
      'Treuerabatt',
      'VOLLKORNBROT',
      'TOMATEN RISPE',
      'KAESE GOUDA',
      'NUDELN PENNE',
      'OLIVENOEL',
      'APFELSAFT',
      'SPUELMITTEL',
      'ZAHNPASTA',
      'BANANEN BIO',
    ]);

    // Nichts aus der Fußzeile, nichts aus der Steuertabelle.
    expect(labels.some((label) => /Guthaben|Eigenmarke|Einkauf|Gesamtbetrag/.test(label))).toBe(
      false,
    );
    // Die Mengenzeile „2 Stk x 1,99" ist kein eigener Posten.
    expect(labels).not.toContain('2 Stk x');
    // Der Rabatt bleibt negativ, sonst ginge die Summe nicht auf.
    expect(parsed.items.find((item) => item.label === 'Treuerabatt')?.amountCents).toBe(-90);
  });
});

describe('Drogerie-Schreibweise', () => {
  /**
   * Ein zweiter Händler druckt anders — und genau daran ist der Parser
   * gescheitert: Steuerklasse als Ziffer statt als Buchstabe, und Menge samt
   * Einzelpreis vor der Bezeichnung. Vorher passte keine einzige Zeile, und
   * als Händler landete der erste Artikel.
   */
  it('versteht Steuerklasse als Ziffer und Menge mit Einzelpreis', async () => {
    const { lines } = await extractPdf(fixture('bon-drogerie.pdf'), inNode);
    const parsed = parseTextLines(lines);

    expect(parsed.quality).toBe('geprüft');
    expect(parsed.totalCents).toBe(2320);
    expect(parsed.date).toBe('2026-09-18');

    const items = parsed.items.map((item) => [item.label, item.amountCents, item.quantity]);
    expect(items).toEqual([
      ['Sanft Toilettenpapier 3lg', 275, null],
      ['Spuelmittel Multi-Power', 125, null],
      // '2x 1,55 Bio Apfelsaft 1L 3,10 1': Menge 2, Einzelpreis verschluckt,
      // Zeilensumme 3,10 — nicht 1,55 und nicht „1,55 Bio Apfelsaft".
      ['Bio Apfelsaft 1L', 310, 2],
      ['Bio Pistazien Cups 2x13g*', 115, null],
      ['Bio Sternkeks Orange 40g*', 85, null],
      ['Bio Paprika edelsuess', 350, 2],
      ['Haar Vital Kompl. Kaps', 295, null],
      ['Thermostrumpfhose 130den', 860, null],
      ['Coupon Deospray', -95, null],
    ]);

    // Zwischensumme, Punktestand und „entspricht 0,35 EUR" sind keine Posten.
    const labels = parsed.items.map((item) => item.label);
    expect(labels.some((label) => /summe|Punkte|entspricht|MwSt|VISA/i.test(label))).toBe(false);
  });
});
