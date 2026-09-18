import { describe, expect, it } from 'vitest';
import {
  computeHouseholdSummary,
  computePotPeriodState,
  computePotStates,
  entriesInPeriod,
  periodTotals,
  spendingByPot,
} from './ledger';
import type { Entry, EntryKind, IsoDate, Pot, PotKind } from './types';

const HOUSEHOLD = 'h1';

function pot(overrides: Partial<Pot> & { id: string; kind: PotKind }): Pot {
  return {
    householdId: HOUSEHOLD,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    revision: 1,
    deletedAt: null,
    name: 'Topf',
    icon: '🧺',
    color: 'slate',
    limitCents: null,
    carryOver: false,
    sortIndex: 0,
    archivedAt: null,
    ...overrides,
  };
}

let entryCounter = 0;
function entry(potId: string | null, kind: EntryKind, amountCents: number, date: IsoDate): Entry {
  entryCounter += 1;
  return {
    id: `e${entryCounter}`,
    householdId: HOUSEHOLD,
    createdAt: `${date}T10:00:00.000Z`,
    updatedAt: `${date}T10:00:00.000Z`,
    revision: 1,
    deletedAt: null,
    potId,
    kind,
    amountCents,
    date,
    note: null,
    merchant: null,
    recurringRuleId: null,
    createdBy: 'u1',
  };
}

describe('entriesInPeriod', () => {
  it('grenzt bei abweichendem Starttag korrekt ab', () => {
    const entries = [
      entry('p1', 'expense', 100, '2026-09-14'),
      entry('p1', 'expense', 100, '2026-09-15'),
      entry('p1', 'expense', 100, '2026-10-14'),
      entry('p1', 'expense', 100, '2026-10-15'),
    ];
    const inPeriod = entriesInPeriod(entries, '2026-09', 15);
    expect(inPeriod.map((e) => e.date)).toEqual(['2026-09-15', '2026-10-14']);
  });

  it('ignoriert gelöschte Buchungen', () => {
    const deleted = { ...entry('p1', 'expense', 100, '2026-09-10'), deletedAt: '2026-09-11T00:00:00.000Z' };
    expect(entriesInPeriod([deleted], '2026-09', 1)).toEqual([]);
  });
});

describe('Topf ohne Limit (Kategorie)', () => {
  it('zeigt nur den Verbrauch, kein Verfügbar', () => {
    const p = pot({ id: 'p1', kind: 'category' });
    const state = computePotPeriodState(p, [entry('p1', 'expense', 1250, '2026-09-05')], '2026-09', 1);
    expect(state.spentCents).toBe(1250);
    expect(state.availableCents).toBeNull();
    expect(state.progress).toBeNull();
    expect(state.overspent).toBe(false);
  });
});

describe('Monatsbudget ohne Übertrag', () => {
  const p = pot({ id: 'p1', kind: 'budget', limitCents: 40_000, carryOver: false });

  it('rechnet Verfügbar gegen das Limit', () => {
    const state = computePotPeriodState(p, [entry('p1', 'expense', 1250, '2026-09-05')], '2026-09', 1);
    expect(state.availableCents).toBe(38_750);
    expect(state.progress).toBeCloseTo(1250 / 40_000);
    expect(state.overspent).toBe(false);
  });

  it('startet jede Periode wieder bei voller Höhe', () => {
    const entries = [entry('p1', 'expense', 40_000, '2026-08-05')];
    const state = computePotPeriodState(p, entries, '2026-09', 1);
    expect(state.availableCents).toBe(40_000);
    expect(state.carriedInCents).toBe(0);
  });

  it('erkennt Überziehung', () => {
    const state = computePotPeriodState(p, [entry('p1', 'expense', 45_000, '2026-09-05')], '2026-09', 1);
    expect(state.availableCents).toBe(-5_000);
    expect(state.overspent).toBe(true);
  });

  it('zieht Erstattungen vom Verbrauch ab', () => {
    const entries = [entry('p1', 'expense', 5_000, '2026-09-05'), entry('p1', 'income', 2_000, '2026-09-06')];
    const state = computePotPeriodState(p, entries, '2026-09', 1);
    expect(state.spentCents).toBe(5_000);
    expect(state.refundCents).toBe(2_000);
    expect(state.netCents).toBe(3_000);
    expect(state.availableCents).toBe(37_000);
  });
});

describe('Budget mit Übertrag (Envelope)', () => {
  const p = pot({
    id: 'p1',
    kind: 'envelope',
    limitCents: 5_000,
    carryOver: true,
    createdAt: '2026-06-01T00:00:00.000Z',
  });

  it('nimmt ungenutzte Reste mit', () => {
    // Juni, Juli, August je unangetastet -> 3 * 50 € Übertrag im September.
    const state = computePotPeriodState(p, [], '2026-09', 1);
    expect(state.carriedInCents).toBe(15_000);
    expect(state.availableCents).toBe(20_000);
  });

  it('verrechnet Teilverbrauch früherer Perioden', () => {
    const entries = [
      entry('p1', 'expense', 2_000, '2026-06-10'),
      entry('p1', 'expense', 5_000, '2026-07-10'),
    ];
    // Juni: 50-20 = 30, Juli: 0, August: 50  -> 80 € Übertrag
    const state = computePotPeriodState(p, entries, '2026-09', 1);
    expect(state.carriedInCents).toBe(8_000);
    expect(state.availableCents).toBe(13_000);
  });

  it('trägt Überziehungen als Schuld weiter', () => {
    const entries = [entry('p1', 'expense', 12_000, '2026-08-10')];
    // Juni 50 + Juli 50 + August (50-120) = -70  -> 30 € Übertrag
    const state = computePotPeriodState(p, entries, '2026-09', 1);
    expect(state.carriedInCents).toBe(3_000);
    expect(state.availableCents).toBe(8_000);
  });

  it('beginnt erst mit der Anlageperiode', () => {
    const state = computePotPeriodState(p, [], '2026-06', 1);
    expect(state.carriedInCents).toBe(0);
    expect(state.availableCents).toBe(5_000);
  });

  it('nutzt kein Übertragsfenster vor der Anlage', () => {
    const state = computePotPeriodState(p, [], '2026-05', 1);
    expect(state.carriedInCents).toBe(0);
  });

  it('setzt progress ins Verhältnis zum erweiterten Rahmen', () => {
    const entries = [entry('p1', 'expense', 10_000, '2026-09-10')];
    // Rahmen = 50 (Limit) + 150 (Übertrag) = 200 €, Verbrauch 100 €
    const state = computePotPeriodState(p, entries, '2026-09', 1);
    expect(state.progress).toBeCloseTo(0.5);
    expect(state.overspent).toBe(false);
  });
});

describe('computePotStates', () => {
  it('ordnet Buchungen den richtigen Töpfen zu', () => {
    const pots = [
      pot({ id: 'p1', kind: 'budget', limitCents: 10_000 }),
      pot({ id: 'p2', kind: 'budget', limitCents: 10_000 }),
    ];
    const entries = [
      entry('p1', 'expense', 1_000, '2026-09-01'),
      entry('p2', 'expense', 2_000, '2026-09-02'),
      entry(null, 'expense', 3_000, '2026-09-03'),
    ];
    const states = computePotStates(pots, entries, '2026-09', 1);
    expect(states[0]?.spentCents).toBe(1_000);
    expect(states[1]?.spentCents).toBe(2_000);
  });
});

describe('computeHouseholdSummary', () => {
  it('bildet Saldo und geplante Summe', () => {
    const pots = [
      pot({ id: 'p1', kind: 'budget', limitCents: 40_000 }),
      pot({ id: 'p2', kind: 'category' }),
      pot({ id: 'p3', kind: 'budget', limitCents: 10_000, archivedAt: '2026-08-01T00:00:00.000Z' }),
    ];
    const entries = [
      entry(null, 'income', 250_000, '2026-09-01'),
      entry('p1', 'expense', 30_000, '2026-09-05'),
      entry('p2', 'expense', 5_000, '2026-09-06'),
    ];
    const summary = computeHouseholdSummary(pots, entries, '2026-09', 1);
    expect(summary.incomeCents).toBe(250_000);
    expect(summary.expenseCents).toBe(35_000);
    expect(summary.balanceCents).toBe(215_000);
    expect(summary.plannedCents).toBe(40_000); // archivierter Topf zählt nicht
    expect(summary.entryCount).toBe(3);
  });
});

describe('spendingByPot', () => {
  it('sortiert absteigend und rechnet Anteile', () => {
    const entries = [
      entry('p1', 'expense', 3_000, '2026-09-01'),
      entry('p2', 'expense', 1_000, '2026-09-02'),
      entry('p1', 'expense', 2_000, '2026-09-03'),
      entry('p1', 'income', 9_000, '2026-09-04'),
    ];
    const shares = spendingByPot(entries, '2026-09', 1);
    expect(shares).toHaveLength(2);
    expect(shares[0]).toMatchObject({ potId: 'p1', netCents: 5_000 });
    expect(shares[0]?.share).toBeCloseTo(5 / 6);
  });

  it('liefert bei leerer Periode eine leere Liste', () => {
    expect(spendingByPot([], '2026-09', 1)).toEqual([]);
  });
});

describe('periodTotals', () => {
  it('liefert je Periode eine Zeile, auch ohne Buchungen', () => {
    const entries = [entry('p1', 'expense', 1_000, '2026-09-01')];
    const totals = periodTotals(entries, ['2026-08', '2026-09'], 1);
    expect(totals).toHaveLength(2);
    expect(totals[0]).toMatchObject({ periodKey: '2026-08', expenseCents: 0 });
    expect(totals[1]).toMatchObject({ periodKey: '2026-09', expenseCents: 1_000 });
  });
});
