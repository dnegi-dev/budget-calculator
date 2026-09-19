import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  daysInMonth,
  formatMonth,
  isIsoDate,
  todayIso,
  weekdayOf,
} from './dates';

describe('addMonths', () => {
  it('klemmt auf das Monatsende', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29'); // Schaltjahr
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
  });

  it('rechnet über Jahresgrenzen', () => {
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15');
    expect(addMonths('2026-06-15', 18)).toBe('2027-12-15');
  });
});

describe('addDays', () => {
  it('rechnet über Monats- und Jahresgrenzen', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });
});

describe('isIsoDate', () => {
  it('lehnt unmögliche Tage ab', () => {
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('2026-2-01')).toBe(false);
    expect(isIsoDate('2026-02-28')).toBe(true);
  });
});

describe('daysInMonth', () => {
  it('kennt Schaltjahre', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(1900, 2)).toBe(28);
  });
});

describe('weekdayOf', () => {
  it('liefert 0 für Sonntag', () => {
    expect(weekdayOf('2026-09-20')).toBe(0);
    expect(weekdayOf('2026-09-21')).toBe(1);
  });
});

describe('todayIso', () => {
  it('nutzt die lokale Zeitzone, nicht UTC', () => {
    // 23:30 lokal darf nicht als Folgetag gelten.
    const localLateEvening = new Date(2026, 8, 18, 23, 30);
    expect(todayIso(localLateEvening)).toBe('2026-09-18');
  });
});

describe('formatMonth', () => {
  it('schreibt Monat und Jahr aus', () => {
    expect(formatMonth('2026-09-19', 'de-DE')).toBe('September 2026');
    expect(formatMonth('2026-01-01', 'de-DE')).toBe('Januar 2026');
  });

  /**
   * Der Tag darf nicht durchschlagen: Der Kopf über der Liste wird mit dem
   * neuesten Tag des Monats beschriftet, und „31. Dezember" wäre dort falsch.
   */
  it('nennt den Tag nicht, egal welcher übergeben wird', () => {
    expect(formatMonth('2026-12-01', 'de-DE')).toBe(formatMonth('2026-12-31', 'de-DE'));
  });

  /**
   * UTC und nicht die Zeitzone des Geräts: Der 1. eines Monats rutschte in
   * einer westlichen Zone sonst in den Vormonat — und der Kopf über der Liste
   * nennte einen anderen Monat als die Zeilen darunter.
   */
  it('rechnet in UTC', () => {
    expect(formatMonth('2026-03-01', 'de-DE')).toBe('März 2026');
  });

  it('folgt der Locale', () => {
    expect(formatMonth('2026-09-19', 'en-US')).toBe('September 2026');
    expect(formatMonth('2026-05-19', 'en-US')).toBe('May 2026');
  });
});
