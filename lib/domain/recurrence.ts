/**
 * Wiederkehrende Buchungen.
 *
 * Bewusst kein RRULE-Parser: gebraucht werden wöchentlich, monatlich und
 * jährlich mit Intervall. Alles darüber (dritter Freitag im Monat) wäre Code,
 * der nie benutzt wird.
 *
 * Wichtig beim Monatsschritt: Vorkommen werden **immer aus dem Ankertag**
 * berechnet, nicht aus dem jeweils vorigen Vorkommen. Sonst wandert eine Regel
 * „am 31.“ nach dem Februar dauerhaft auf den 28.
 */

import { addDays, compareDates, daysInMonth, fromParts, toParts, weekdayOf } from './dates';
import type { IsoDate, NewEntryInput, RecurringRule } from './types';

/** Notbremse gegen Endlosschleifen bei absurden Eingaben. */
const MAX_OCCURRENCES = 500;

export function normalizeInterval(interval: number): number {
  if (!Number.isFinite(interval)) return 1;
  return Math.min(60, Math.max(1, Math.trunc(interval)));
}

/**
 * Das n-te Vorkommen (0-basiert) einer Regel, oder `null`, wenn die Regel
 * ungültig konfiguriert ist.
 */
export function occurrenceAt(rule: RecurringRule, index: number): IsoDate | null {
  const interval = normalizeInterval(rule.interval);
  const start = toParts(rule.startDate);

  if (rule.freq === 'weekly') {
    const first =
      rule.weekday === null ? rule.startDate : advanceToWeekday(rule.startDate, rule.weekday);
    return addDays(first, index * 7 * interval);
  }

  if (rule.freq === 'monthly') {
    const anchorDay = clampDayOfMonth(rule.dayOfMonth ?? start.day);
    const firstMonthIndex = start.year * 12 + (start.month - 1);
    // Fällt der Ankertag im Startmonat vor den Startzeitpunkt, beginnt die
    // Regel erst im Folgemonat.
    const firstCandidate = monthlyDate(firstMonthIndex, anchorDay);
    const offset = compareDates(firstCandidate, rule.startDate) < 0 ? 1 : 0;
    return monthlyDate(firstMonthIndex + (offset + index) * interval, anchorDay);
  }

  const month = clampMonth(rule.month ?? start.month);
  const day = clampDayOfMonth(rule.dayOfMonth ?? start.day);
  const firstCandidate = yearlyDate(start.year, month, day);
  const offset = compareDates(firstCandidate, rule.startDate) < 0 ? 1 : 0;
  return yearlyDate(start.year + (offset + index) * interval, month, day);
}

/** Alle Vorkommen im Zeitraum (inklusive), begrenzt durch `endDate` der Regel. */
export function occurrencesBetween(
  rule: RecurringRule,
  fromDate: IsoDate,
  toDate: IsoDate,
): IsoDate[] {
  if (compareDates(fromDate, toDate) > 0) return [];
  const result: IsoDate[] = [];
  for (let index = 0; index < MAX_OCCURRENCES; index += 1) {
    const date = occurrenceAt(rule, index);
    if (date === null) break;
    if (compareDates(date, toDate) > 0) break;
    if (rule.endDate !== null && compareDates(date, rule.endDate) > 0) break;
    if (compareDates(date, fromDate) >= 0) result.push(date);
  }
  return result;
}

export function nextOccurrenceAfter(rule: RecurringRule, date: IsoDate): IsoDate | null {
  for (let index = 0; index < MAX_OCCURRENCES; index += 1) {
    const occurrence = occurrenceAt(rule, index);
    if (occurrence === null) return null;
    if (rule.endDate !== null && compareDates(occurrence, rule.endDate) > 0) return null;
    if (compareDates(occurrence, date) > 0) return occurrence;
  }
  return null;
}

/**
 * Noch offene Vorkommen bis einschließlich `today`.
 *
 * Idempotent über `lastMaterializedDate`: Was schon erzeugt wurde, kommt nicht
 * wieder. Das ist die einzige Absicherung gegen doppelte Buchungen, wenn die
 * App mehrfach am Tag geöffnet wird.
 */
export function dueOccurrences(rule: RecurringRule, today: IsoDate): IsoDate[] {
  if (rule.paused || rule.deletedAt !== null) return [];
  const from =
    rule.lastMaterializedDate === null ? rule.startDate : addDays(rule.lastMaterializedDate, 1);
  const effectiveFrom = compareDates(from, rule.startDate) > 0 ? from : rule.startDate;
  return occurrencesBetween(rule, effectiveFrom, today);
}

export interface MaterializationResult {
  entries: NewEntryInput[];
  lastMaterializedDate: IsoDate;
}

/**
 * Wandelt offene Vorkommen in Buchungs-Eingaben um. Schreibt nichts — der
 * Aufrufer speichert Buchungen und Regel in einer Transaktion.
 */
export function materializeRule(rule: RecurringRule, today: IsoDate): MaterializationResult | null {
  const occurrences = dueOccurrences(rule, today);
  if (occurrences.length === 0) return null;
  return {
    entries: occurrences.map((date) => ({
      potId: rule.potId,
      kind: rule.kind,
      amountCents: rule.amountCents,
      date,
      note: rule.note,
      recurringRuleId: rule.id,
    })),
    lastMaterializedDate: occurrences[occurrences.length - 1] as IsoDate,
  };
}

export const WEEKDAY_LABELS: readonly string[] = [
  'Sonntag',
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
];

const MONTH_LABELS: readonly string[] = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];

/** 'monatlich am 1.', 'alle 2 Wochen am Montag', 'jährlich am 15. Januar' */
export function describeRecurrence(rule: RecurringRule): string {
  const interval = normalizeInterval(rule.interval);
  if (rule.freq === 'weekly') {
    const weekday = rule.weekday ?? weekdayOf(rule.startDate);
    const rhythm = interval === 1 ? 'wöchentlich' : `alle ${interval} Wochen`;
    return `${rhythm} am ${WEEKDAY_LABELS[weekday] ?? 'Montag'}`;
  }
  if (rule.freq === 'monthly') {
    const day = clampDayOfMonth(rule.dayOfMonth ?? toParts(rule.startDate).day);
    const rhythm = interval === 1 ? 'monatlich' : `alle ${interval} Monate`;
    const suffix = day >= 29 ? ' (bzw. am letzten Tag kürzerer Monate)' : '';
    return `${rhythm} am ${day}.${suffix}`;
  }
  const month = clampMonth(rule.month ?? toParts(rule.startDate).month);
  const day = clampDayOfMonth(rule.dayOfMonth ?? toParts(rule.startDate).day);
  const rhythm = interval === 1 ? 'jährlich' : `alle ${interval} Jahre`;
  return `${rhythm} am ${day}. ${MONTH_LABELS[month - 1] ?? ''}`.trim();
}

function advanceToWeekday(date: IsoDate, weekday: number): IsoDate {
  const target = ((Math.trunc(weekday) % 7) + 7) % 7;
  const diff = (target - weekdayOf(date) + 7) % 7;
  return addDays(date, diff);
}

function monthlyDate(monthIndex: number, anchorDay: number): IsoDate {
  const year = Math.floor(monthIndex / 12);
  const month = (monthIndex % 12) + 1;
  return fromParts({ year, month, day: Math.min(anchorDay, daysInMonth(year, month)) });
}

function yearlyDate(year: number, month: number, anchorDay: number): IsoDate {
  return fromParts({ year, month, day: Math.min(anchorDay, daysInMonth(year, month)) });
}

function clampDayOfMonth(day: number): number {
  if (!Number.isFinite(day)) return 1;
  return Math.min(31, Math.max(1, Math.trunc(day)));
}

function clampMonth(month: number): number {
  if (!Number.isFinite(month)) return 1;
  return Math.min(12, Math.max(1, Math.trunc(month)));
}
