/**
 * Zod-Schemas als einzige Wahrheit über die Datenform.
 *
 * Genutzt von: Import-Validierung, Formularvalidierung und — nach Einführung
 * der zentralen DB — der API-Grenze. Wer das Modell ändert, ändert es hier,
 * und alle drei Stellen ziehen mit.
 */

import { z } from 'zod';
import { isIsoDate } from './dates';
import { isPeriodKey } from './period';
import { TAG_LIMITS } from './tags';

export const isoDateSchema = z.string().refine(isIsoDate, 'Kein gültiges Datum (YYYY-MM-DD)');
export const isoDateTimeSchema = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: 'Kein gültiger Zeitstempel',
});
export const periodKeySchema = z.string().refine(isPeriodKey, 'Kein Periodenschlüssel (YYYY-MM)');

/**
 * Längen der Freitextfelder. Eine Zahl, drei Verwendungen: die Schemas hier,
 * `maxLength` an den Eingabefeldern und das Kürzen beim Import
 * (`lib/domain/backup.ts`).
 *
 * Vorher stand das Limit nur im Schema. Weil das Schema aber ausschließlich
 * beim Import läuft, ließ sich eine längere Notiz speichern, exportieren und
 * anschließend nicht mehr einlesen — die Sicherung war unbrauchbar.
 */
export const TEXT_LIMITS = {
  householdName: 80,
  displayName: 80,
  potName: 60,
  note: 500,
  merchant: 120,
  keyword: 60,
} as const;

/**
 * Freitext für die Ablage: getrimmt, auf sein Limit gekürzt, leer wird `null`.
 *
 * Hier und nicht in der Oberfläche, weil `maxLength` am Eingabefeld nur die
 * Tastatur bremst — eingefügter Text, Import und jeder künftige API-Aufruf
 * kommen daran vorbei.
 */
export function clampText(value: string | null | undefined, limit: number): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed.slice(0, limit);
}

export const idSchema = z.string().min(1).max(64);
export const roleSchema = z.enum(['admin', 'member', 'viewer']);
export const potKindSchema = z.enum(['budget', 'envelope', 'category']);
export const entryKindSchema = z.enum(['expense', 'income']);
export const frequencySchema = z.enum(['weekly', 'monthly', 'yearly']);

export const tagSchema = z.string().min(1).max(TAG_LIMITS.length);
/**
 * Tags einer Buchung. Mit Standardwert, damit Sicherungen von vor den Tags
 * weiter einlesbar bleiben — und mit Obergrenze, weil eine eingefügte Zeile
 * sonst dreißig Marken an eine Buchung hängt.
 */
export const tagsSchema = z.array(tagSchema).max(TAG_LIMITS.perEntry).default([]);

/** Beträge: nicht negativ, ganzzahlig, unter einer Milliarde Cent. */
export const amountCentsSchema = z
  .number()
  .int('Nur ganze Cent')
  .min(0, 'Negative Beträge werden über die Art der Buchung ausgedrückt')
  .max(1_000_000_000, 'Betrag unrealistisch groß');

const recordMetaShape = {
  id: idSchema,
  householdId: idSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  revision: z.number().int().min(1),
  deletedAt: isoDateTimeSchema.nullable(),
};

export const householdSchema = z.object({
  id: idSchema,
  name: z.string().min(1, 'Name fehlt').max(TEXT_LIMITS.householdName),
  currency: z.string().length(3, 'Währung als ISO-Code, z. B. EUR'),
  locale: z.string().min(2).max(35),
  periodStartDay: z.number().int().min(1).max(28),
  // Drei Felder, die es in Version 1 noch nicht gab. Standardwerte, damit
  // ältere Sicherungen einlesbar bleiben: kein Standardtopf, Topf abfragen
  // wie bisher, Tags aus.
  defaultPotId: idSchema.nullable().default(null),
  askForPot: z.boolean().default(true),
  tagsEnabled: z.boolean().default(false),
  onboardingCompletedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  revision: z.number().int().min(1),
});

export const userSchema = z.object({
  ...recordMetaShape,
  displayName: z.string().min(1).max(TEXT_LIMITS.displayName),
  role: roleSchema,
  externalSubject: z.string().min(1).max(255).nullable(),
  isLocalDevice: z.boolean(),
});

export const potSchema = z.object({
  ...recordMetaShape,
  name: z.string().min(1, 'Name fehlt').max(TEXT_LIMITS.potName),
  icon: z.string().min(1).max(8),
  color: z.string().min(1).max(24),
  kind: potKindSchema,
  limitCents: amountCentsSchema.nullable(),
  carryOver: z.boolean(),
  sortIndex: z.number().int(),
  archivedAt: isoDateTimeSchema.nullable(),
});

export const entrySchema = z.object({
  ...recordMetaShape,
  potId: idSchema.nullable(),
  kind: entryKindSchema,
  amountCents: amountCentsSchema,
  date: isoDateSchema,
  note: z.string().max(TEXT_LIMITS.note).nullable(),
  merchant: z.string().max(TEXT_LIMITS.merchant).nullable(),
  recurringRuleId: idSchema.nullable(),
  // Ältere Sicherungen kennen das Feld nicht — ohne den Standardwert
  // ließe sich keine davon mehr einlesen.
  splitGroupId: idSchema.nullable().default(null),
  tags: tagsSchema,
  createdBy: idSchema,
});

export const itemRuleSchema = z.object({
  ...recordMetaShape,
  keyword: z.string().min(1).max(TEXT_LIMITS.keyword),
  potId: idSchema,
});

export const recurringRuleSchema = z
  .object({
    ...recordMetaShape,
    potId: idSchema.nullable(),
    kind: entryKindSchema,
    amountCents: amountCentsSchema,
    note: z.string().max(TEXT_LIMITS.note).nullable(),
    freq: frequencySchema,
    interval: z.number().int().min(1).max(60),
    dayOfMonth: z.number().int().min(1).max(31).nullable(),
    weekday: z.number().int().min(0).max(6).nullable(),
    month: z.number().int().min(1).max(12).nullable(),
    startDate: isoDateSchema,
    endDate: isoDateSchema.nullable(),
    lastMaterializedDate: isoDateSchema.nullable(),
    paused: z.boolean(),
  })
  .refine((rule) => rule.endDate === null || rule.endDate >= rule.startDate, {
    message: 'Ende liegt vor dem Beginn',
    path: ['endDate'],
  });

export const receiptMetaSchema = z.object({
  ...recordMetaShape,
  entryId: idSchema,
  filename: z.string().min(1).max(255),
  mime: z.string().min(1).max(120),
  byteSize: z.number().int().min(0),
});

/** Beleg im Export: Binärdaten als Base64, weil JSON keine Blobs kennt. */
export const receiptExportSchema = receiptMetaSchema.extend({
  dataBase64: z.string(),
  thumbnailBase64: z.string().nullable(),
});

export const EXPORT_SCHEMA_VERSION = 1;

export const exportFileSchema = z.object({
  schemaVersion: z.literal(EXPORT_SCHEMA_VERSION),
  exportedAt: isoDateTimeSchema,
  app: z.string(),
  household: householdSchema,
  users: z.array(userSchema),
  pots: z.array(potSchema),
  entries: z.array(entrySchema),
  recurringRules: z.array(recurringRuleSchema),
  receipts: z.array(receiptExportSchema),
  // Erst mit dem Bon-Import dazugekommen, deshalb mit Standardwert:
  // Sicherungen von vorher sollen weiter einlesbar sein.
  itemRules: z.array(itemRuleSchema).default([]),
});

export type ExportFile = z.infer<typeof exportFileSchema>;
export type ReceiptExport = z.infer<typeof receiptExportSchema>;
