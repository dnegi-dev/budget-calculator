import { describe, expect, it } from 'vitest';
import { entriesToCsv } from './csv';
import type { Entry, Pot, ReceiptMeta } from '../domain/types';

const meta = {
  householdId: 'h1',
  createdAt: '2026-09-18T00:00:00.000Z',
  updatedAt: '2026-09-18T00:00:00.000Z',
  revision: 1,
  deletedAt: null,
};

const pot: Pot = {
  ...meta,
  id: 'p1',
  name: 'Lebensmittel',
  icon: '🛒',
  color: 'emerald',
  kind: 'budget',
  limitCents: 40_000,
  carryOver: false,
  sortIndex: 0,
  archivedAt: null,
};

function entry(overrides: Partial<Entry> & { id: string }): Entry {
  return {
    ...meta,
    potId: 'p1',
    kind: 'expense',
    amountCents: 1_250,
    date: '2026-09-18',
    note: null,
    merchant: null,
    recurringRuleId: null,
    splitGroupId: null,
    createdBy: 'u1',
    ...overrides,
  };
}

describe('entriesToCsv', () => {
  it('nutzt bei deutscher Locale Semikolon und Komma', () => {
    const csv = entriesToCsv([entry({ id: 'e1' })], [pot], [], { locale: 'de-DE' });
    const [header, row] = csv.split('\r\n');
    expect(header).toContain('Datum;Art;Topf');
    expect(row).toContain('-12,50');
  });

  it('nutzt bei englischer Locale Komma und Punkt', () => {
    const csv = entriesToCsv([entry({ id: 'e1' })], [pot], [], { locale: 'en-US' });
    const [header, row] = csv.split('\r\n');
    expect(header).toContain('Datum,Art,Topf');
    expect(row).toContain('-12.50');
  });

  it('schreibt Einnahmen positiv und Ausgaben negativ', () => {
    const csv = entriesToCsv(
      [entry({ id: 'e1', kind: 'income', amountCents: 250_000, potId: null })],
      [pot],
      [],
      { locale: 'de-DE' },
    );
    expect(csv).toContain('2500,00');
    expect(csv).toContain('Einnahme');
  });

  it('maskiert Trennzeichen und Anführungszeichen in Freitexten', () => {
    const csv = entriesToCsv(
      [entry({ id: 'e1', note: 'Brot; Milch', merchant: 'Laden "Ecke"' })],
      [pot],
      [],
      { locale: 'de-DE' },
    );
    expect(csv).toContain('"Brot; Milch"');
    expect(csv).toContain('"Laden ""Ecke"""');
  });

  it('zählt Belege je Buchung', () => {
    const receipts: ReceiptMeta[] = [
      { ...meta, id: 'r1', entryId: 'e1', filename: 'a.jpg', mime: 'image/jpeg', byteSize: 1 },
      { ...meta, id: 'r2', entryId: 'e1', filename: 'b.jpg', mime: 'image/jpeg', byteSize: 1 },
    ];
    const csv = entriesToCsv([entry({ id: 'e1' })], [pot], receipts, { locale: 'de-DE' });
    expect(csv.split('\r\n')[1]?.split(';')[6]).toBe('2');
  });
});
