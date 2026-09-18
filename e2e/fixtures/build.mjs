/**
 * Erzeugt die beiden PDF-Muster für den Bon-Import.
 *
 *   node e2e/fixtures/build.mjs
 *
 * Von Hand gebaut und ohne Abhängigkeit, damit die Muster klein, lesbar und
 * reproduzierbar sind. Die erzeugten Dateien sind eingecheckt — dieses Skript
 * läuft nur, wenn sich die Muster ändern sollen.
 *
 * `bon-textschicht.pdf` ist ein Bon, wie eine Kasse ihn druckt: Name links,
 * Betrag rechts, als zwei getrennte Textstücke derselben Zeile. Genau daran
 * muss sich `groupIntoLines` beweisen.
 *
 * `bon-ekabs.pdf` ist derselbe Bon plus `ekabs.json` als angehängte Datei —
 * der Weg, auf dem nichts geraten werden muss.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HIER = dirname(fileURLToPath(import.meta.url));

/** Zeilen des Bons: [links, rechts]. `null` rechts = nur eine Spalte. */
const ZEILEN = [
  ['Musterbäckerei Schmidt', null],
  ['Marktplatz 3, 12345 Musterstadt', null],
  ['', null],
  ['5 x Brötchen', '2,50'],
  ['Kaffee to go', '2,00'],
  ['Pfand Becher', '0,25'],
  ['Rabatt Stammkunde', '-0,25'],
  ['', null],
  ['SUMME', '4,50'],
  ['Geg. EC-Karte', '4,50'],
  ['MwSt 7,00% Netto 4,21 Steuer 0,29', null],
  ['Datum 18.09.2026 Uhrzeit 07:12', null],
  ['TSE-Signatur MUSTER-OHNE-BEDEUTUNG', null],
];

/** Passt zur Textschicht — dieselben Posten, dieselbe Summe. */
const EKABS = {
  merchant: { name: 'Musterbäckerei Schmidt' },
  timestamp_start: '2026-09-18T07:12:00+02:00',
  total: 4.5,
  items: [
    { name: 'Brötchen', quantity: 5, total: 2.5 },
    { name: 'Kaffee to go', quantity: 1, total: 2.0 },
    { name: 'Pfand Becher', quantity: 1, total: 0.25 },
    { name: 'Rabatt Stammkunde', quantity: 1, total: -0.25 },
  ],
};

function escapeText(text) {
  return text.replace(/([\\()])/g, '\\$1');
}

function contentStream() {
  const teile = ['BT', '/F1 9 Tf'];
  let y = 470;
  for (const [links, rechts] of ZEILEN) {
    if (links !== '') {
      teile.push(`1 0 0 1 20 ${y} Tm (${escapeText(links)}) Tj`);
      if (rechts !== null) teile.push(`1 0 0 1 220 ${y} Tm (${escapeText(rechts)}) Tj`);
    }
    y -= 16;
  }
  teile.push('ET');
  return teile.join('\n');
}

/** Setzt ein PDF aus Objekten zusammen und rechnet die xref-Offsets aus. */
function buildPdf(objekte, katalogIndex, extraTrailer = '') {
  const kopf = '%PDF-1.7\n%\xE2\xE3\xCF\xD3\n';
  let body = '';
  const offsets = [];
  objekte.forEach((inhalt, index) => {
    offsets.push(kopf.length + body.length);
    body += `${index + 1} 0 obj\n${inhalt}\nendobj\n`;
  });

  const xrefStart = kopf.length + body.length;
  let xref = `xref\n0 ${objekte.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    xref += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${objekte.length + 1} /Root ${katalogIndex} 0 R${extraTrailer} >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return Buffer.from(kopf + body + xref + trailer, 'latin1');
}

function stream(inhalt) {
  return `<< /Length ${Buffer.byteLength(inhalt, 'latin1')} >>\nstream\n${inhalt}\nendstream`;
}

const inhalt = contentStream();
const seite =
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 500] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>';
const schrift = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';

// --- nur Textschicht ------------------------------------------------------
writeFileSync(
  join(HIER, 'bon-textschicht.pdf'),
  buildPdf(
    [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      seite,
      stream(inhalt),
      schrift,
    ],
    1,
  ),
);

// --- Textschicht plus ekabs.json -----------------------------------------
// Nur ASCII: Die Datei wird als latin1 geschrieben, und `/Length` muss die
// Bytezahl sein. Mit Umlauten im JSON gingen JS-Zeichenlänge und UTF-8-Bytes
// auseinander — pdf.js liest dann über das Stream-Ende hinaus und findet den
// Anhang gar nicht. (Genau dieser Fehler ist hier einmal passiert.)
const json = JSON.stringify(EKABS, null, 2).replace(
  /[\u0080-\uffff]/g,
  (zeichen) => `\\u${zeichen.charCodeAt(0).toString(16).padStart(4, '0')}`,
);
writeFileSync(
  join(HIER, 'bon-ekabs.pdf'),
  buildPdf(
    [
      '<< /Type /Catalog /Pages 2 0 R /Names << /EmbeddedFiles << /Names [(ekabs.json) 7 0 R] >> >> >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      seite,
      stream(inhalt),
      schrift,
      `<< /Type /EmbeddedFile /Subtype /application#2Fjson /Length ${Buffer.byteLength(json, 'latin1')} >>\nstream\n${json}\nendstream`,
      '<< /Type /Filespec /F (ekabs.json) /UF (ekabs.json) /EF << /F 6 0 R >> /Desc (EKaBS-Belegdaten) >>',
    ],
    1,
  ),
);

console.log('bon-textschicht.pdf und bon-ekabs.pdf geschrieben');
