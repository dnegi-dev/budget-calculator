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
import { TEXT_LIMITS, type ExportFile } from './schemas';
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
    ['address', TEXT_LIMITS.address],
  ]);
  count += clampEach(backup.recurringRules, [['note', TEXT_LIMITS.note]]);
  count += clampEach(backup.itemRules, [['keyword', TEXT_LIMITS.keyword]]);
  count += clampEach(backup.purchases, [['merchant', TEXT_LIMITS.merchant]]);
  count += clampEach(backup.purchaseItems, [['label', TEXT_LIMITS.itemLabel]]);
  count += clampEach(backup.receipts, [['filename', TEXT_LIMITS.filename]]);
  // Tags stehen an drei Stellen — an jeder dieselbe Nachsicht, sonst macht
  // ein zu langer Tag am Einkauf die Sicherung unbrauchbar, während derselbe
  // Tag an einer Buchung gekürzt würde.
  for (const list of [backup.entries, backup.purchases, backup.purchaseItems]) {
    if (!Array.isArray(list)) continue;
    for (const item of list) if (isRecord(item)) count += clampTags(item);
  }

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

/**
 * Löst Verweise, die ins Leere zeigen, und zählt sie.
 *
 * `known` sind IDs, die es außerhalb der Datei schon gibt — beim
 * Zusammenführen darf eine Buchung auf einen Topf zeigen, der nur lokal
 * existiert. Beim Ersetzen ist `known` leer.
 *
 * Die Regeln folgen dem, was das Repository beim Löschen tut: Eine Buchung
 * verliert ihren Topf, bleibt aber; eine gelernte Zuordnung ohne Topf ist
 * wertlos und fällt weg; ein Beleg ohne Buchung belegt nichts mehr.
 */
export function repairReferences(
  file: ExportFile,
  known: {
    potIds?: Iterable<string>;
    entryIds?: Iterable<string>;
    purchaseIds?: Iterable<string>;
  } = {},
): { file: ExportFile; repaired: number } {
  const potIds = new Set([...(known.potIds ?? []), ...file.pots.map((pot) => pot.id)]);
  const purchaseIds = new Set([
    ...(known.purchaseIds ?? []),
    ...file.purchases.map((purchase) => purchase.id),
  ]);
  let repaired = 0;

  const potOrNull = (potId: string | null): string | null => {
    if (potId === null || potIds.has(potId)) return potId;
    repaired += 1;
    return null;
  };

  const entries = file.entries.map((entry) => {
    const potId = potOrNull(entry.potId);
    let purchaseId = entry.purchaseId ?? null;
    if (purchaseId !== null && !purchaseIds.has(purchaseId)) {
      purchaseId = null;
      repaired += 1;
    }
    return potId === entry.potId && purchaseId === (entry.purchaseId ?? null)
      ? entry
      : { ...entry, potId, purchaseId };
  });
  const entryIds = new Set([...(known.entryIds ?? []), ...entries.map((entry) => entry.id)]);

  const recurringRules = file.recurringRules.map((rule) => {
    const potId = potOrNull(rule.potId);
    // Wie beim Löschen eines Topfes: Eine Regel ohne ihr Ziel läuft nicht
    // still weiter, sondern wartet auf eine Entscheidung.
    return potId === rule.potId ? rule : { ...rule, potId, paused: true };
  });

  const itemRules = file.itemRules.filter((rule) => {
    if (potIds.has(rule.potId)) return true;
    repaired += 1;
    return false;
  });

  const purchaseItems = file.purchaseItems.flatMap((item) => {
    if (!purchaseIds.has(item.purchaseId)) {
      repaired += 1;
      return [];
    }
    const potId = potOrNull(item.potId);
    return [potId === item.potId ? item : { ...item, potId }];
  });

  const receipts = file.receipts.filter((receipt) => {
    if (entryIds.has(receipt.entryId)) return true;
    repaired += 1;
    return false;
  });

  const defaultPotId = potOrNull(file.household.defaultPotId ?? null);
  const household =
    defaultPotId === (file.household.defaultPotId ?? null)
      ? file.household
      : { ...file.household, defaultPotId };

  return {
    file: { ...file, household, entries, recurringRules, itemRules, purchaseItems, receipts },
    repaired,
  };
}

/**
 * Schreibt jeden Datensatz einer Sicherung auf den eigenen Haushalt um.
 *
 * Haushalt und Nutzer der Datei bleiben draußen: Die Einstellungen des
 * eigenen Haushalts gelten weiter, und ein zweiter Gerätenutzer aus einem
 * fremden Haushalt hätte hier keine Bedeutung. Solange es nur einen Haushalt
 * je Gerät gibt, ist das die einzige Art, zwei zusammenzuführen.
 */
export function adoptIntoHousehold(file: ExportFile, householdId: string): ExportFile {
  const own = <T extends { householdId: string }>(records: readonly T[]): T[] =>
    records.map((record) => ({ ...record, householdId }));
  return {
    ...file,
    household: { ...file.household, id: householdId },
    users: [],
    pots: own(file.pots),
    entries: own(file.entries),
    recurringRules: own(file.recurringRules),
    receipts: own(file.receipts),
    itemRules: own(file.itemRules),
    purchases: own(file.purchases),
    purchaseItems: own(file.purchaseItems),
  };
}
