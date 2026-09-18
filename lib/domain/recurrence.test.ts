import { describe, expect, it } from 'vitest';
import {
  describeRecurrence,
  dueOccurrences,
  materializeRule,
  nextOccurrenceAfter,
  occurrencesBetween,
} from './recurrence';
import type { Frequency, RecurringRule } from './types';

function rule(
  overrides: Partial<RecurringRule> & { freq: Frequency; startDate: string },
): RecurringRule {
  return {
    id: 'r1',
    householdId: 'h1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    revision: 1,
    deletedAt: null,
    potId: 'p1',
    kind: 'expense',
    amountCents: 95_000,
    note: 'Miete',
    interval: 1,
    dayOfMonth: null,
    weekday: null,
    month: null,
    endDate: null,
    lastMaterializedDate: null,
    paused: false,
    ...overrides,
  };
}

describe('monatliche Regel', () => {
  it('trifft jeden Monat den Ankertag', () => {
    const r = rule({ freq: 'monthly', startDate: '2026-01-01', dayOfMonth: 1 });
    expect(occurrencesBetween(r, '2026-01-01', '2026-04-30')).toEqual([
      '2026-01-01',
      '2026-02-01',
      '2026-03-01',
      '2026-04-01',
    ]);
  });

  it('klemmt den 31. auf das Monatsende und kehrt danach zurück', () => {
    const r = rule({ freq: 'monthly', startDate: '2026-01-31', dayOfMonth: 31 });
    expect(occurrencesBetween(r, '2026-01-01', '2026-05-31')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
    ]);
  });

  it('kennt den Schalttag', () => {
    const r = rule({ freq: 'monthly', startDate: '2024-01-31', dayOfMonth: 31 });
    expect(occurrencesBetween(r, '2024-02-01', '2024-02-29')).toEqual(['2024-02-29']);
  });

  it('beginnt im Folgemonat, wenn der Ankertag im Startmonat schon vorbei ist', () => {
    const r = rule({ freq: 'monthly', startDate: '2026-01-20', dayOfMonth: 5 });
    expect(occurrencesBetween(r, '2026-01-01', '2026-03-31')).toEqual(['2026-02-05', '2026-03-05']);
  });

  it('berücksichtigt das Intervall', () => {
    const r = rule({ freq: 'monthly', startDate: '2026-01-15', dayOfMonth: 15, interval: 3 });
    expect(occurrencesBetween(r, '2026-01-01', '2026-12-31')).toEqual([
      '2026-01-15',
      '2026-04-15',
      '2026-07-15',
      '2026-10-15',
    ]);
  });

  it('endet mit endDate', () => {
    const r = rule({
      freq: 'monthly',
      startDate: '2026-01-01',
      dayOfMonth: 1,
      endDate: '2026-03-15',
    });
    expect(occurrencesBetween(r, '2026-01-01', '2026-12-31')).toEqual([
      '2026-01-01',
      '2026-02-01',
      '2026-03-01',
    ]);
  });
});

describe('wöchentliche Regel', () => {
  it('rückt auf den gewünschten Wochentag vor', () => {
    // 2026-09-18 ist ein Freitag; Ziel Montag (1).
    const r = rule({ freq: 'weekly', startDate: '2026-09-18', weekday: 1 });
    expect(occurrencesBetween(r, '2026-09-01', '2026-10-10')).toEqual([
      '2026-09-21',
      '2026-09-28',
      '2026-10-05',
    ]);
  });

  it('nutzt ohne Wochentag den Starttag', () => {
    const r = rule({ freq: 'weekly', startDate: '2026-09-18' });
    expect(occurrencesBetween(r, '2026-09-01', '2026-10-03')).toEqual([
      '2026-09-18',
      '2026-09-25',
      '2026-10-02',
    ]);
  });

  it('berücksichtigt das Intervall', () => {
    const r = rule({ freq: 'weekly', startDate: '2026-09-21', weekday: 1, interval: 2 });
    expect(occurrencesBetween(r, '2026-09-01', '2026-10-31')).toEqual([
      '2026-09-21',
      '2026-10-05',
      '2026-10-19',
    ]);
  });
});

describe('jährliche Regel', () => {
  it('trifft Monat und Tag', () => {
    const r = rule({ freq: 'yearly', startDate: '2026-03-15', month: 3, dayOfMonth: 15 });
    expect(occurrencesBetween(r, '2026-01-01', '2028-12-31')).toEqual([
      '2026-03-15',
      '2027-03-15',
      '2028-03-15',
    ]);
  });

  it('beginnt im Folgejahr, wenn der Termin schon vorbei ist', () => {
    const r = rule({ freq: 'yearly', startDate: '2026-06-01', month: 3, dayOfMonth: 15 });
    expect(occurrencesBetween(r, '2026-01-01', '2027-12-31')).toEqual(['2027-03-15']);
  });

  it('klemmt den 29. Februar in Nicht-Schaltjahren', () => {
    const r = rule({ freq: 'yearly', startDate: '2024-02-29', month: 2, dayOfMonth: 29 });
    expect(occurrencesBetween(r, '2024-01-01', '2026-12-31')).toEqual([
      '2024-02-29',
      '2025-02-28',
      '2026-02-28',
    ]);
  });
});

describe('dueOccurrences', () => {
  const r = rule({ freq: 'monthly', startDate: '2026-01-01', dayOfMonth: 1 });

  it('liefert alle offenen Termine bis heute', () => {
    expect(dueOccurrences(r, '2026-03-10')).toEqual(['2026-01-01', '2026-02-01', '2026-03-01']);
  });

  it('ist idempotent über lastMaterializedDate', () => {
    const materialized = { ...r, lastMaterializedDate: '2026-02-01' };
    expect(dueOccurrences(materialized, '2026-03-10')).toEqual(['2026-03-01']);
    const upToDate = { ...r, lastMaterializedDate: '2026-03-01' };
    expect(dueOccurrences(upToDate, '2026-03-10')).toEqual([]);
  });

  it('liefert nichts für pausierte oder gelöschte Regeln', () => {
    expect(dueOccurrences({ ...r, paused: true }, '2026-03-10')).toEqual([]);
    expect(dueOccurrences({ ...r, deletedAt: '2026-02-01T00:00:00.000Z' }, '2026-03-10')).toEqual(
      [],
    );
  });

  it('liefert nichts vor dem Startdatum', () => {
    expect(dueOccurrences(r, '2025-12-31')).toEqual([]);
  });
});

describe('materializeRule', () => {
  it('erzeugt Buchungen und setzt den Fortschritt', () => {
    const r = rule({ freq: 'monthly', startDate: '2026-01-01', dayOfMonth: 1 });
    const result = materializeRule(r, '2026-02-15');
    expect(result).not.toBeNull();
    expect(result?.entries).toHaveLength(2);
    expect(result?.entries[0]).toMatchObject({
      potId: 'p1',
      kind: 'expense',
      amountCents: 95_000,
      date: '2026-01-01',
      recurringRuleId: 'r1',
    });
    expect(result?.lastMaterializedDate).toBe('2026-02-01');
  });

  it('gibt null zurück, wenn nichts offen ist', () => {
    const r = rule({
      freq: 'monthly',
      startDate: '2026-01-01',
      dayOfMonth: 1,
      lastMaterializedDate: '2026-02-01',
    });
    expect(materializeRule(r, '2026-02-15')).toBeNull();
  });

  it('erzeugt bei zweimaligem Lauf keine Duplikate', () => {
    const r = rule({ freq: 'monthly', startDate: '2026-01-01', dayOfMonth: 1 });
    const first = materializeRule(r, '2026-02-15');
    const updated = { ...r, lastMaterializedDate: first?.lastMaterializedDate ?? null };
    expect(materializeRule(updated, '2026-02-15')).toBeNull();
  });
});

describe('nextOccurrenceAfter', () => {
  it('findet den nächsten Termin', () => {
    const r = rule({ freq: 'monthly', startDate: '2026-01-01', dayOfMonth: 1 });
    expect(nextOccurrenceAfter(r, '2026-02-10')).toBe('2026-03-01');
  });

  it('gibt null nach dem Ende zurück', () => {
    const r = rule({
      freq: 'monthly',
      startDate: '2026-01-01',
      dayOfMonth: 1,
      endDate: '2026-02-28',
    });
    expect(nextOccurrenceAfter(r, '2026-02-10')).toBeNull();
  });
});

describe('describeRecurrence', () => {
  it('beschreibt die Regel in einem Satz', () => {
    expect(
      describeRecurrence(rule({ freq: 'monthly', startDate: '2026-01-01', dayOfMonth: 1 })),
    ).toBe('monatlich am 1.');
    expect(
      describeRecurrence(
        rule({ freq: 'weekly', startDate: '2026-01-05', weekday: 1, interval: 2 }),
      ),
    ).toBe('alle 2 Wochen am Montag');
    expect(
      describeRecurrence(
        rule({ freq: 'yearly', startDate: '2026-03-15', month: 3, dayOfMonth: 15 }),
      ),
    ).toBe('jährlich am 15. März');
  });

  it('warnt beim 31., weil kurze Monate abweichen', () => {
    expect(
      describeRecurrence(rule({ freq: 'monthly', startDate: '2026-01-31', dayOfMonth: 31 })),
    ).toContain('letzten Tag');
  });
});
