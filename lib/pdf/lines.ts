/**
 * Textstücke eines PDFs zu Zeilen zusammensetzen.
 *
 * pdf.js liefert `getTextContent()` als Liste von Stücken mit Koordinaten,
 * nicht als Text. Auf einem Kassenbon steht der Name links und der Betrag
 * rechts — als zwei Stücke derselben Zeile. Ohne diese Umrechnung wäre jeder
 * Posten zwei unverbundene Zeichenketten.
 *
 * Eigene Datei ohne pdf.js-Import, damit die Umrechnung als reine Funktion
 * geprüft werden kann: Sie ist die einzige Stelle im PDF-Weg, die sich still
 * verrechnen kann.
 */

export interface TextChunk {
  str: string;
  /** Abstand von links, aus `transform[4]`. */
  x: number;
  /** Abstand von unten, aus `transform[5]` — in PDFs wächst y nach oben. */
  y: number;
}

/**
 * Gruppiert Stücke zu Zeilen.
 *
 * `tolerance` in PDF-Punkten: Innerhalb einer Zeile weichen die
 * Grundlinien leicht ab, wenn Schriftgrößen gemischt sind. 2 pt sind bei
 * 8–12 pt Schrift der Wert, der Zeilen nicht verschmilzt und keine
 * aufspaltet.
 */
export function groupIntoLines(chunks: readonly TextChunk[], tolerance = 2): string[] {
  const rows: { y: number; chunks: TextChunk[] }[] = [];

  for (const chunk of chunks) {
    if (chunk.str === '') continue;
    const row = rows.find((candidate) => Math.abs(candidate.y - chunk.y) <= tolerance);
    if (row) row.chunks.push(chunk);
    else rows.push({ y: chunk.y, chunks: [chunk] });
  }

  return (
    rows
      // Von oben nach unten: größeres y liegt höher.
      .sort((a, b) => b.y - a.y)
      .map((row) =>
        row.chunks
          .sort((a, b) => a.x - b.x)
          .map((chunk) => chunk.str)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim(),
      )
      .filter((line) => line !== '')
  );
}
