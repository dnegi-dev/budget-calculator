/**
 * CSV-Export der Buchungen.
 *
 * Semikolon als Trenner und Komma als Dezimalzeichen bei deutscher Locale —
 * sonst zerlegt Excel die Datei nicht in Spalten, und genau dafür ist CSV da.
 * Bei anderen Locales gilt die englische Konvention.
 */

import { formatCentsPlain } from '../domain/money';
import type { Entry, Pot, ReceiptMeta } from '../domain/types';

const HEADERS = [
  'Datum',
  'Art',
  'Topf',
  'Betrag',
  'Firma',
  'Adresse',
  'Notiz',
  'Tags',
  'Belege',
  'Wiederkehrend',
] as const;

export interface CsvOptions {
  locale: string;
}

export function entriesToCsv(
  entries: readonly Entry[],
  pots: readonly Pot[],
  receipts: readonly ReceiptMeta[],
  { locale }: CsvOptions,
): string {
  const german = locale.startsWith('de');
  const separator = german ? ';' : ',';
  const decimal = german ? ',' : '.';

  const potNames = new Map(pots.map((pot) => [pot.id, pot.name]));
  const receiptCounts = new Map<string, number>();
  for (const receipt of receipts) {
    receiptCounts.set(receipt.entryId, (receiptCounts.get(receipt.entryId) ?? 0) + 1);
  }

  const rows = entries.map((entry) => [
    entry.date,
    entry.kind === 'expense' ? 'Ausgabe' : 'Einnahme',
    entry.potId ? (potNames.get(entry.potId) ?? '') : '',
    // Ausgaben negativ: In einer Tabelle soll die Spalte summierbar sein.
    formatCentsPlain(entry.kind === 'expense' ? -entry.amountCents : entry.amountCents, decimal),
    entry.merchant ?? '',
    entry.address ?? '',
    entry.note ?? '',
    // Komma als Trenner, auch bei deutscher Locale: Die Zelle wird ohnehin
    // maskiert, und in einer Tabelle liest sich „urlaub, auto" wie Text.
    (entry.tags ?? []).join(', '),
    String(receiptCounts.get(entry.id) ?? 0),
    entry.recurringRuleId ? 'ja' : '',
  ]);

  return [HEADERS, ...rows]
    .map((row) => row.map((cell) => escapeCell(cell, separator)).join(separator))
    .join('\r\n');
}

function escapeCell(value: string, separator: string): string {
  if (value.includes(separator) || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Löst einen Download aus. Ohne Server ist eine Blob-URL der einzige Weg. */
export function downloadFile(filename: string, content: Blob): void {
  const url = URL.createObjectURL(content);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  // Erst freigeben, wenn der Browser den Download begonnen hat.
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
