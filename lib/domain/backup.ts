/**
 * Nachsicht beim Einlesen einer Sicherung.
 *
 * Das Schema (`exportFileSchema`) ist streng, und das soll so bleiben: Es ist
 * die künftige API-Grenze, und dort darf nichts stillschweigend zurechtgebogen
 * werden. Der Import ist der andere Fall — eine Sicherung ist oft die einzige
 * Kopie, und eine zu lange Notiz darf sie nicht unbrauchbar machen. Deshalb
 * werden die bekannten Freitextfelder vorher auf ihr Limit gekürzt, und die
 * Anzahl wird gemeldet, statt sie zu verschweigen.
 */

import type { ZodError } from 'zod';
import { TEXT_LIMITS } from './schemas';
import { dedupeTags } from './tags';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clampField(target: Record<string, unknown>, key: string, limit: number): number {
  const value = target[key];
  if (typeof value !== 'string' || value.length <= limit) return 0;
  target[key] = value.slice(0, limit);
  return 1;
}

function clampEach(value: unknown, fields: readonly (readonly [string, number])[]): number {
  if (!Array.isArray(value)) return 0;
  let count = 0;
  for (const item of value) {
    if (!isRecord(item)) continue;
    for (const [key, limit] of fields) count += clampField(item, key, limit);
  }
  return count;
}

/**
 * Räumt die Tag-Liste einer Buchung auf: kürzen, Dubletten weg, Anzahl deckeln.
 *
 * Dieselbe Nachsicht wie bei den Freitexten, aus demselben Grund: Eine
 * Sicherung mit einem zu langen Tag darf nicht unbrauchbar sein. `dedupeTags`
 * macht die Arbeit, damit hier keine zweite Regel entsteht.
 */
function clampTags(target: Record<string, unknown>): number {
  const value = target.tags;
  if (!Array.isArray(value)) return 0;
  const strings = value.filter((item): item is string => typeof item === 'string');
  const cleaned = dedupeTags(strings);
  const changed =
    strings.length !== value.length || cleaned.join('\u0000') !== value.join('\u0000');
  if (!changed) return 0;
  target.tags = cleaned;
  return 1;
}

/**
 * Kürzt zu lange Freitexte auf ihr Limit und gibt zurück, wie oft.
 *
 * Verändert das übergebene Objekt **an Ort und Stelle**. Das ist Absicht: Der
 * Aufrufer hat es gerade selbst aus `JSON.parse` erhalten, und eine Kopie
 * würde die Base64-Belege ein zweites Mal in den Speicher legen — bei einer
 * Sicherung mit Fotos sind das schnell zweistellige Megabyte.
 */
export function clampBackupText(backup: unknown): number {
  if (!isRecord(backup)) return 0;
  let count = 0;

  const household = backup.household;
  if (isRecord(household)) count += clampField(household, 'name', TEXT_LIMITS.householdName);

  count += clampEach(backup.users, [['displayName', TEXT_LIMITS.displayName]]);
  count += clampEach(backup.pots, [['name', TEXT_LIMITS.potName]]);
  count += clampEach(backup.entries, [
    ['note', TEXT_LIMITS.note],
    ['merchant', TEXT_LIMITS.merchant],
  ]);
  if (Array.isArray(backup.entries)) {
    for (const item of backup.entries) if (isRecord(item)) count += clampTags(item);
  }
  count += clampEach(backup.recurringRules, [['note', TEXT_LIMITS.note]]);
  count += clampEach(backup.itemRules, [['keyword', TEXT_LIMITS.keyword]]);

  return count;
}

/**
 * Fehlermeldung, die das Feld nennt.
 *
 * Vorher stand nur die erste Abweichung da, und ohne Pfad war nicht zu
 * erkennen, welcher Datensatz gemeint ist. Drei Zeilen reichen, um die Ursache
 * zu finden; alles darüber wird nur gezählt.
 */
export function describeImportError(error: ZodError): string {
  const shown = error.issues.slice(0, 3).map((issue) => {
    const path = issue.path.map(String).join('.');
    return path === '' ? `• ${issue.message}` : `• ${path}: ${issue.message}`;
  });
  const rest = error.issues.length - shown.length;
  return [
    'Die Datei passt nicht zum erwarteten Format.',
    ...shown,
    rest > 0 ? `… und ${rest} weitere ${rest === 1 ? 'Abweichung' : 'Abweichungen'}.` : null,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}
