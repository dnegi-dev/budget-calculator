/**
 * Budgetperioden.
 *
 * Eine Periode ist normalerweise ein Kalendermonat. Weil aber viele Haushalte
 * mit dem Gehaltseingang rechnen, ist der Starttag einstellbar (1–28): Bei
 * `periodStartDay = 15` läuft die Periode '2026-09' vom 15.09. bis 14.10.
 *
 * Der Schlüssel einer Periode ist immer 'YYYY-MM' ihres **Starttags**. Er ist
 * lexikografisch sortierbar — das hält Vergleiche und Gruppierungen trivial.
 */

import { addDays, addMonths, compareDates, fromParts, toParts } from './dates';
import type { IsoDate } from './types';

export interface Period {
  /** 'YYYY-MM' des Starttags. */
  key: string;
  start: IsoDate;
  /** Erster Tag der Folgeperiode — Vergleiche laufen als `date < endExclusive`. */
  endExclusive: IsoDate;
}

const PERIOD_KEY = /^(\d{4})-(\d{2})$/;

export function clampPeriodStartDay(day: number): number {
  if (!Number.isFinite(day)) return 1;
  return Math.min(28, Math.max(1, Math.trunc(day)));
}

export function isPeriodKey(key: string): boolean {
  const match = PERIOD_KEY.exec(key);
  if (!match) return false;
  const month = Number(match[2]);
  return month >= 1 && month <= 12;
}

export function periodFromKey(key: string, periodStartDay: number): Period {
  const match = PERIOD_KEY.exec(key);
  if (!match) throw new Error(`Kein Periodenschlüssel: ${key}`);
  const day = clampPeriodStartDay(periodStartDay);
  const start = fromParts({ year: Number(match[1]), month: Number(match[2]), day });
  return { key, start, endExclusive: addMonths(start, 1) };
}

export function periodForDate(date: IsoDate, periodStartDay: number): Period {
  const day = clampPeriodStartDay(periodStartDay);
  const { year, month } = toParts(date);
  const candidateStart = fromParts({ year, month, day });
  const start =
    compareDates(date, candidateStart) >= 0 ? candidateStart : addMonths(candidateStart, -1);
  const { year: startYear, month: startMonth } = toParts(start);
  return {
    key: periodKey(startYear, startMonth),
    start,
    endExclusive: addMonths(start, 1),
  };
}

export function shiftPeriodKey(key: string, months: number): string {
  const { year, month } = toParts(`${key}-01`);
  const total = year * 12 + (month - 1) + months;
  return periodKey(Math.floor(total / 12), (total % 12) + 1);
}

export function comparePeriodKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Anzahl Perioden von `from` bis `to` (negativ, wenn `to` früher liegt). */
export function periodDistance(from: string, to: string): number {
  const a = toParts(`${from}-01`);
  const b = toParts(`${to}-01`);
  return b.year * 12 + b.month - (a.year * 12 + a.month);
}

/** Alle Schlüssel von `from` bis `to`, aufsteigend und inklusive. */
export function periodKeysBetween(from: string, to: string): string[] {
  const distance = periodDistance(from, to);
  if (distance < 0) return [];
  return Array.from({ length: distance + 1 }, (_, index) => shiftPeriodKey(from, index));
}

/** Die letzten `count` Perioden bis einschließlich `key`, aufsteigend. */
export function lastPeriodKeys(key: string, count: number): string[] {
  const safeCount = Math.max(1, Math.trunc(count));
  return Array.from({ length: safeCount }, (_, index) =>
    shiftPeriodKey(key, index - safeCount + 1),
  );
}

export function containsDate(period: Period, date: IsoDate): boolean {
  return compareDates(date, period.start) >= 0 && compareDates(date, period.endExclusive) < 0;
}

/**
 * Anzeigename. Bei Monatsstart am 1. reicht 'September 2026'; bei
 * abweichendem Starttag muss die Spanne sichtbar sein, sonst wirkt die
 * Zuordnung einzelner Buchungen willkürlich.
 */
export function formatPeriodLabel(period: Period, locale: string, periodStartDay: number): string {
  const { year, month, day } = toParts(period.start);
  const monthName = new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
  if (clampPeriodStartDay(periodStartDay) === 1) return monthName;

  const last = addDays(period.endExclusive, -1);
  const rangeFormat = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
  const lastParts = toParts(last);
  const from = rangeFormat.format(new Date(Date.UTC(year, month - 1, day)));
  const to = rangeFormat.format(
    new Date(Date.UTC(lastParts.year, lastParts.month - 1, lastParts.day)),
  );
  return `${from} – ${to}`;
}

function periodKey(year: number, month: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}
