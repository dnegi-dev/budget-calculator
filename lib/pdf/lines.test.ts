import { describe, expect, it } from 'vitest';
import { groupIntoLines, type TextChunk } from './lines';

function chunk(str: string, x: number, y: number): TextChunk {
  return { str, x, y };
}

describe('groupIntoLines', () => {
  it('setzt Name und Betrag derselben Zeile zusammen', () => {
    expect(
      groupIntoLines([chunk('1,29', 400, 700), chunk('Milch', 40, 700), chunk('Brot', 40, 688)]),
    ).toEqual(['Milch 1,29', 'Brot']);
  });

  it('sortiert von oben nach unten, nicht nach Eingabereihenfolge', () => {
    expect(
      groupIntoLines([chunk('unten', 40, 100), chunk('oben', 40, 700), chunk('mitte', 40, 400)]),
    ).toEqual(['oben', 'mitte', 'unten']);
  });

  it('verschmilzt leicht versetzte Grundlinien einer Zeile', () => {
    expect(groupIntoLines([chunk('SUMME', 40, 300), chunk('5,62', 400, 301.4)])).toEqual([
      'SUMME 5,62',
    ]);
  });

  it('trennt Zeilen, die weiter auseinanderliegen als die Toleranz', () => {
    expect(groupIntoLines([chunk('a', 40, 300), chunk('b', 40, 304)])).toEqual(['b', 'a']);
  });

  it('wirft leere Stücke und leere Zeilen weg', () => {
    expect(
      groupIntoLines([chunk('', 40, 300), chunk('   ', 60, 300), chunk('x', 40, 100)]),
    ).toEqual(['x']);
  });

  it('verträgt eine leere Eingabe', () => {
    expect(groupIntoLines([])).toEqual([]);
  });
});
