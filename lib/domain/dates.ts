/**
 * Datums-Arithmetik auf ISO-Tagesstrings ('YYYY-MM-DD').
 *
 * Bewusst ohne `Date`-Objekte in der Signatur: Ein Einkauf passiert an einem
 * Kalendertag, nicht zu einem Zeitpunkt. Würde man `Date` speichern, schiebt
 * jede Zeitzonenumstellung Buchungen in den Nachbarmonat — und damit in den
 * falschen Topf-Zeitraum.
 */

import type { IsoDate, IsoDateTime } from './types';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface DateParts {
  year: number;
  month: number; // 1..12
  day: number; // 1..31
}

export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const { year, month, day } = toParts(value);
  if (month < 1 || month > 12) return false;
  return day >= 1 && day <= daysInMonth(year, month);
}

export function toParts(date: IsoDate): DateParts {
  const match = ISO_DATE.exec(date);
  if (!match) throw new Error(`Kein ISO-Datum: ${date}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export function fromParts({ year, month, day }: DateParts): IsoDate {
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const { year, month, day } = toParts(date);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return fromParts({
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  });
}

/**
 * Monatsschritt mit Klemmung: der 31. Januar plus ein Monat ist der
 * 28./29. Februar, nicht der 3. März.
 */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const { year, month, day } = toParts(date);
  const total = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(total / 12);
  const targetMonth = (total % 12) + 1;
  return fromParts({
    year: targetYear,
    month: targetMonth,
    day: Math.min(day, daysInMonth(targetYear, targetMonth)),
  });
}

export function compareDates(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Wochentag, 0 = Sonntag … 6 = Samstag (wie `Date.getUTCDay`). */
export function weekdayOf(date: IsoDate): number {
  const { year, month, day } = toParts(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Der Kalendertag „heute“ in der Zeitzone des Geräts. */
export function todayIso(now: Date = new Date()): IsoDate {
  return fromParts({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  });
}

export function nowIso(now: Date = new Date()): IsoDateTime {
  return now.toISOString();
}

export function formatDate(date: IsoDate, locale: string): string {
  const { year, month, day } = toParts(date);
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}

/**
 * Monat und Jahr, ausgeschrieben — „September 2026".
 *
 * Nimmt ein vollständiges Datum und nicht `'YYYY-MM'`: Die Buchungsliste
 * gruppiert über `date.slice(0, 7)`, hat den Tag also ohnehin zur Hand, und
 * eine zweite Datumsform im Umlauf wäre eine zweite Stelle, an der geprüft
 * werden müsste.
 */
export function formatMonth(date: IsoDate, locale: string): string {
  const { year, month, day } = toParts(date);
  return new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function pad(value: number, length: number): string {
  return String(value).padStart(length, '0');
}
