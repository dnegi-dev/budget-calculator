import { describe, expect, it } from 'vitest';
import {
  formatPeriodLabel,
  lastPeriodKeys,
  periodDistance,
  periodForDate,
  periodFromKey,
  periodKeysBetween,
  shiftPeriodKey,
} from './period';

describe('periodForDate mit Monatsstart am 1.', () => {
  it('bildet den Kalendermonat ab', () => {
    const period = periodForDate('2026-09-18', 1);
    expect(period.key).toBe('2026-09');
    expect(period.start).toBe('2026-09-01');
    expect(period.endExclusive).toBe('2026-10-01');
  });
});

describe('periodForDate mit abweichendem Starttag', () => {
  it('ordnet Tage vor dem Starttag der Vorperiode zu', () => {
    expect(periodForDate('2026-09-14', 15).key).toBe('2026-08');
    expect(periodForDate('2026-09-15', 15).key).toBe('2026-09');
    expect(periodForDate('2026-10-14', 15).key).toBe('2026-09');
  });

  it('spannt die Periode über den Monatswechsel', () => {
    const period = periodForDate('2026-09-20', 15);
    expect(period.start).toBe('2026-09-15');
    expect(period.endExclusive).toBe('2026-10-15');
  });

  it('funktioniert über die Jahresgrenze', () => {
    expect(periodForDate('2027-01-10', 15).key).toBe('2026-12');
    expect(periodForDate('2026-12-31', 15).key).toBe('2026-12');
  });

  it('klemmt unmögliche Starttage auf 1..28', () => {
    // Starttag 31 wird auf 28 geklemmt; der 18.09. liegt damit noch in der
    // Periode, die am 28.08. begann.
    expect(periodForDate('2026-09-18', 31).start).toBe('2026-08-28');
    expect(periodForDate('2026-09-29', 31).start).toBe('2026-09-28');
    expect(periodForDate('2026-09-18', 0).start).toBe('2026-09-01');
  });
});

describe('periodFromKey', () => {
  it('ist die Umkehrung von periodForDate', () => {
    const period = periodFromKey('2026-09', 15);
    expect(period.start).toBe('2026-09-15');
    expect(periodForDate(period.start, 15).key).toBe('2026-09');
  });
});

describe('Periodenschlüssel-Arithmetik', () => {
  it('verschiebt über Jahresgrenzen', () => {
    expect(shiftPeriodKey('2026-12', 1)).toBe('2027-01');
    expect(shiftPeriodKey('2026-01', -1)).toBe('2025-12');
    expect(shiftPeriodKey('2026-06', 12)).toBe('2027-06');
  });

  it('misst Abstände', () => {
    expect(periodDistance('2026-01', '2026-03')).toBe(2);
    expect(periodDistance('2026-03', '2026-01')).toBe(-2);
    expect(periodDistance('2026-03', '2026-03')).toBe(0);
  });

  it('listet Bereiche auf', () => {
    expect(periodKeysBetween('2026-11', '2027-01')).toEqual(['2026-11', '2026-12', '2027-01']);
    expect(periodKeysBetween('2027-01', '2026-11')).toEqual([]);
  });

  it('liefert die letzten n Perioden aufsteigend und endet beim Schlüssel', () => {
    expect(lastPeriodKeys('2026-03', 3)).toEqual(['2026-01', '2026-02', '2026-03']);
  });
});

describe('formatPeriodLabel', () => {
  it('zeigt bei Monatsstart am 1. nur den Monat', () => {
    expect(formatPeriodLabel(periodFromKey('2026-09', 1), 'de-DE', 1)).toBe('September 2026');
  });

  it('zeigt bei abweichendem Starttag die Spanne', () => {
    const label = formatPeriodLabel(periodFromKey('2026-09', 15), 'de-DE', 15);
    expect(label).toContain('15.');
    expect(label).toContain('–');
  });
});
