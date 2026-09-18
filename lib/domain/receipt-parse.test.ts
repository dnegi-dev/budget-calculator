import { describe, expect, it } from 'vitest';
import {
  groupItemsByPot,
  normalizeKeyword,
  parseEkabs,
  parseTextLines,
  splitItemLine,
  suggestPot,
  toCents,
} from './receipt-parse';

/** Ein Bon, wie ihn ein Supermarkt druckt — Posten gehen auf die Summe auf. */
const SUPERMARKT = [
  'REWE Markt GmbH',
  'Musterstraße 1, 12345 Musterstadt',
  '',
  'Bio-Vollmilch 3,5%            1,29 A',
  '2 x Butter                    4,58 A',
  'Pfand                         0,25 A',
  'Rabatt Coupon                -0,50 A',
  '------------------------------------',
  'SUMME                         5,62',
  'Geg. BAR                     10,00',
  'Rückgeld                      4,38',
  'MwSt 7,00%   Netto 5,25  Steuer 0,37',
  'Datum 18.09.2026  Uhrzeit 17:42',
  'TSE-Signatur ABC123',
];

describe('splitItemLine', () => {
  it('trennt Bezeichnung und Betrag', () => {
    expect(splitItemLine('Bio-Vollmilch 3,5%            1,29 A')).toEqual({
      label: 'Bio-Vollmilch 3,5%',
      amountCents: 129,
      quantity: null,
    });
  });

  it('liest die Menge vor dem Namen', () => {
    expect(splitItemLine('2 x Butter    4,58 A')).toEqual({
      label: 'Butter',
      amountCents: 458,
      quantity: 2,
    });
    expect(splitItemLine('0,568 kg x Äpfel   1,42')).toEqual({
      label: 'Äpfel',
      amountCents: 142,
      quantity: 0.568,
    });
  });

  it('versteht beide Stellungen des Minus', () => {
    expect(splitItemLine('Rabatt  -0,50')?.amountCents).toBe(-50);
    expect(splitItemLine('Pfandrückgabe  0,25-')?.amountCents).toBe(-25);
  });

  it('nimmt Euro-Zeichen und Steuerklasse hin', () => {
    expect(splitItemLine('Brot   2,49 €')?.amountCents).toBe(249);
    expect(splitItemLine('Brot   2,49 EUR B')?.amountCents).toBe(249);
  });

  it('ist keine Postenzeile ohne Bezeichnung oder ohne Betrag', () => {
    expect(splitItemLine('12345   6,00')).toBeNull();
    expect(splitItemLine('Milch')).toBeNull();
    expect(splitItemLine('')).toBeNull();
  });
});

describe('parseTextLines', () => {
  it('liest Posten, Summe, Datum und Händler', () => {
    const result = parseTextLines(SUPERMARKT);
    expect(result.quality).toBe('geprüft');
    expect(result.totalCents).toBe(562);
    expect(result.date).toBe('2026-09-18');
    expect(result.merchant).toBe('REWE Markt GmbH');
    expect(result.items.map((item) => [item.label, item.amountCents])).toEqual([
      ['Bio-Vollmilch 3,5%', 129],
      ['Butter', 458],
      ['Pfand', 25],
      ['Rabatt Coupon', -50],
    ]);
  });

  it('verwirft die Posten, wenn sie nicht auf die Summe aufgehen', () => {
    // Eine Zeile fehlt auf dem Ausdruck — dann ist die Aufteilung falsch, und
    // falsch aussehende Richtigkeit ist schlimmer als keine Aufteilung.
    const luecke = SUPERMARKT.filter((line) => !line.startsWith('Pfand'));
    const result = parseTextLines(luecke);
    expect(result.quality).toBe('unsicher');
    expect(result.items).toEqual([]);
    expect(result.totalCents).toBe(562);
    expect(result.date).toBe('2026-09-18');
  });

  it('hält Zahlungs-, Steuer- und Signaturzeilen aus den Posten heraus', () => {
    const labels = parseTextLines(SUPERMARKT).items.map((item) => item.label);
    expect(labels).not.toContain('Geg. BAR');
    expect(labels.some((label) => /MwSt|Rückgeld|TSE/.test(label))).toBe(false);
  });

  it('nimmt die Endsumme, nicht die Zwischensumme', () => {
    const result = parseTextLines([
      'Kaffee   3,00',
      'Zwischensumme   3,00',
      'Trinkgeld   0,50',
      'SUMME   3,50',
    ]);
    expect(result.totalCents).toBe(350);
    expect(result.quality).toBe('geprüft');
    expect(result.items.map((i) => i.label)).toEqual(['Kaffee', 'Trinkgeld']);
  });

  it('liest zweistellige Jahre und ISO-Datum', () => {
    expect(parseTextLines(['Datum 01.02.26']).date).toBe('2026-02-01');
    expect(parseTextLines(['Belegdatum 2026-02-01']).date).toBe('2026-02-01');
  });

  it('bleibt bei Müll ruhig', () => {
    const result = parseTextLines([]);
    expect(result).toEqual({
      merchant: null,
      date: null,
      totalCents: null,
      items: [],
      quality: 'unsicher',
    });
  });
});

describe('toCents', () => {
  it('nimmt Zahl in Euro und Zeichenkette', () => {
    expect(toCents(1.29)).toBe(129);
    expect(toCents('1,29')).toBe(129);
    expect(toCents({ amount: '1,29' })).toBe(129);
    expect(toCents(undefined)).toBeNull();
    expect(toCents('keine Zahl')).toBeNull();
  });

  it('rundet, statt Fließkommareste zu übernehmen', () => {
    expect(toCents(0.07 * 3)).toBe(21);
  });
});

describe('parseEkabs', () => {
  const beleg = {
    merchant: { name: 'Musterbäckerei' },
    timestamp_start: '2026-09-18T07:12:00+02:00',
    total: 4.5,
    items: [
      { name: 'Brötchen', quantity: 5, total: 2.5 },
      { name: 'Kaffee', quantity: 1, total: 2.0 },
    ],
  };

  it('liest den angehängten Beleg exakt', () => {
    const result = parseEkabs(beleg);
    expect(result).not.toBeNull();
    expect(result?.quality).toBe('exakt');
    expect(result?.totalCents).toBe(450);
    expect(result?.merchant).toBe('Musterbäckerei');
    expect(result?.date).toBe('2026-09-18');
    expect(result?.items).toEqual([
      { label: 'Brötchen', amountCents: 250, quantity: 5 },
      { label: 'Kaffee', amountCents: 200, quantity: 1 },
    ]);
  });

  it('findet Posten auch eine Ebene tiefer', () => {
    expect(parseEkabs({ receipt: { items: beleg.items, total: 4.5 } })?.totalCents).toBe(450);
  });

  it('gibt null zurück, wenn die Posten nicht auf die Summe aufgehen', () => {
    // Genau der Fall, für den es die Probe gibt: Die Datei sieht gültig aus,
    // aber die Zuordnung würde 0,50 € verschlucken.
    expect(parseEkabs({ ...beleg, total: 5.0 })).toBeNull();
  });

  it('gibt null zurück bei fehlenden Feldern oder Müll', () => {
    expect(parseEkabs(null)).toBeNull();
    expect(parseEkabs({})).toBeNull();
    expect(parseEkabs({ items: [] })).toBeNull();
    expect(parseEkabs({ items: beleg.items })).toBeNull();
  });
});

describe('normalizeKeyword', () => {
  it('lässt nur den erkennbaren Namen stehen', () => {
    expect(normalizeKeyword('2 x Bio-Vollmilch 3,8% 1L')).toBe('bio vollmilch');
    expect(normalizeKeyword('Äpfel, lose')).toBe('äpfel lose');
    expect(normalizeKeyword('12345')).toBe('');
  });
});

describe('suggestPot', () => {
  const rules = [
    { keyword: 'milch', potId: 'topf-lebensmittel' },
    { keyword: 'bio vollmilch', potId: 'topf-bio' },
    { keyword: 'spülmittel', potId: 'topf-haushalt' },
  ];

  it('nimmt das längste passende Schlagwort', () => {
    expect(suggestPot('Bio-Vollmilch 3,8%', rules)).toBe('topf-bio');
    expect(suggestPot('H-Milch', rules)).toBe('topf-lebensmittel');
  });

  it('schlägt nichts vor, wenn nichts passt', () => {
    expect(suggestPot('Schraubendreher', rules)).toBeNull();
    expect(suggestPot('123', rules)).toBeNull();
    expect(suggestPot('Milch', [])).toBeNull();
  });
});

describe('groupItemsByPot', () => {
  const items = [
    { label: 'Brötchen', amountCents: 250, quantity: 5 },
    { label: 'Spülmittel', amountCents: 249, quantity: null },
    { label: 'Kaffee', amountCents: 200, quantity: null },
    { label: 'Rabatt', amountCents: -50, quantity: null },
  ];

  it('macht eine Buchung pro Topf, in der Reihenfolge des Bons', () => {
    const groups = groupItemsByPot(items, ['essen', 'haushalt', 'essen', 'essen']);
    expect(groups).toEqual([
      {
        potId: 'essen',
        amountCents: 400,
        kind: 'expense',
        labels: ['Brötchen', 'Kaffee', 'Rabatt'],
      },
      { potId: 'haushalt', amountCents: 249, kind: 'expense', labels: ['Spülmittel'] },
    ]);
  });

  it('lässt Posten ohne Topf zusammen', () => {
    const groups = groupItemsByPot(items, [null, null, null, null]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.potId).toBeNull();
    expect(groups[0]?.amountCents).toBe(649);
  });

  it('erzeugt keine Buchung über null', () => {
    const groups = groupItemsByPot(
      [
        { label: 'Pfand', amountCents: 25, quantity: null },
        { label: 'Pfandrückgabe', amountCents: -25, quantity: null },
      ],
      ['pfand', 'pfand'],
    );
    expect(groups).toEqual([]);
  });

  it('macht aus einem negativen Topf eine Einnahme', () => {
    const groups = groupItemsByPot([{ label: 'Rabatt', amountCents: -50, quantity: null }], ['x']);
    expect(groups).toEqual([{ potId: 'x', amountCents: 50, kind: 'income', labels: ['Rabatt'] }]);
  });

  it('behandelt eine fehlende Zuordnung wie „ohne Topf"', () => {
    const groups = groupItemsByPot([{ label: 'A', amountCents: 100, quantity: null }], []);
    expect(groups[0]?.potId).toBeNull();
  });
});
