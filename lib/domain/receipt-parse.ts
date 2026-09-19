/**
 * Kassenbons lesen — reine Funktionen, kein PDF, kein DOM.
 *
 * Zwei Wege, in dieser Reihenfolge:
 *
 * 1. **`ekabs.json`** — der Elektronische Kassen-Beleg-Standard des DFKA hängt
 *    die Belegdaten als JSON-Datei im PDF an. Wo die vorliegt, wird nichts
 *    geraten.
 * 2. **Textschicht** — Zeilen der Form `Name … Betrag`, gelesen mit
 *    Heuristiken.
 *
 * Und eine Regel, die über beiden steht: **die Summenprobe.** Posten gelten
 * nur als brauchbar, wenn sie auf die erkannte Endsumme aufgehen. Gehen sie
 * nicht auf, wird nur Summe und Datum angeboten. Ein falsch aufgeteilter
 * Einkauf ist schlimmer als ein nicht aufgeteilter: Er sieht richtig aus.
 */

import { fromParts, isIsoDate } from './dates';
import { parseAmountToCents, sumCents } from './money';
import type { IsoDate, ParseQuality } from './types';

export interface ParsedItem {
  label: string;
  /** Immer vorzeichenbehaftet: Rabatt und Pfandrückgabe sind negativ. */
  amountCents: number;
  quantity: number | null;
}

/**
 * Woher die Posten kommen — steht in der Vorschau, damit sichtbar ist, wie
 * viel Vertrauen angebracht ist. Der Typ selbst liegt in `types.ts`, weil
 * `Purchase` ihn trägt; hier steht er weiter zur Verfügung, damit die
 * Aufrufer nicht zwei Dateien importieren müssen.
 */
export type { ParseQuality };

export interface ParsedReceipt {
  merchant: string | null;
  date: IsoDate | null;
  totalCents: number | null;
  items: ParsedItem[];
  quality: ParseQuality;
}

/* ------------------------------------------------------------------ *
 * Textschicht
 * ------------------------------------------------------------------ */

/**
 * Zeilen, die keine Posten sind.
 *
 * Steht als eine Liste beisammen und ist getestet: Jede einzelne Zeile hier
 * hat schon einmal als Posten in einer Aufteilung gestanden, wo sie nicht
 * hingehört. „Rabatt", „Pfand" und „Trinkgeld" stehen bewusst **nicht** hier —
 * das sind echte Posten, und ohne sie geht die Summenprobe nicht auf.
 */
const NON_ITEM_PATTERNS: readonly RegExp[] = [
  /\b(summe|gesamt(betrag|summe)?|total|zwischensumme|zu\s*zahlen|endbetrag)\b/i,
  /\b(mwst|ust|umsatzsteuer|steuer|netto|brutto)\b/i,
  /\b(geg(eben)?|r[üu]ckgeld|retour|wechselgeld)\b/i,
  /\b(bar|ec[\s-]*(cash|karte)?|girocard|kreditkarte|visa|mastercard|maestro|paypal|unbar)\b/i,
  /\b(tse|signatur|transaktion|seriennummer|pr[üu]fwert|zertifikat)\b/i,
  // „Markt" und „Filiale" stehen hier bewusst **nicht**: Sie kommen im Namen
  // des Händlers vor („REWE Markt GmbH"), und der wird mit derselben Liste
  // gesucht. Zeilen mit diesen Wörtern tragen ohnehin selten einen Betrag.
  /\b(beleg(nr|nummer)?|bon(nr|nummer)?|kasse|kassier|bedien|steuernr|ust-?idnr)\b/i,
  /\b(datum|uhrzeit|zeit)\b/i,
  /\b(posten|artikel)\s*:/i,
  /\bes bediente sie\b/i,
  /^\s*[-=*_.]{3,}\s*$/,
];

/**
 * Betrag am Zeilenende, mit den Schreibweisen, die Kassen wirklich drucken.
 *
 * Hinter dem Betrag steht oft die Steuerklasse — bei einem Händler als
 * Buchstabe (`2,75 B`), beim nächsten als Ziffer (`2,75 1`). Ohne die Ziffer
 * passte auf einem dm-Bon keine einzige Zeile.
 */
const TRAILING_AMOUNT =
  /(-?\d{1,3}(?:[.\s]\d{3})*[.,]\d{2})\s*(-)?\s*(?:€|EUR)?\s*(?:[A-Z]{1,2}|\d)?\s*$/;

/**
 * Die Menge vor dem Namen: `2 x`, `2x`, `2 Stk x`, `0,568 kg x` — und, weil
 * manche Kassen es so drucken, samt Einzelpreis: `2x 1,55 dmBio Apfelsaft`.
 * Der Einzelpreis wird mitverschluckt, sonst beginnt die Bezeichnung mit einer
 * Zahl und der Posten heißt „1,55 dmBio Apfelsaft".
 */
const LEADING_QUANTITY =
  /^\s*(\d{1,3}(?:[.,]\d{1,3})?)\s*(?:kg|g|ml|l|stk\.?|st\.?)?\s*[x*]\s*(?:\d{1,3}[.,]\d{2}\s+)?/i;

const GERMAN_DATE = /\b(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})\b/;
const ISO_DATE_IN_TEXT = /\b(\d{4}-\d{2}-\d{2})\b/;

function isNonItem(line: string): boolean {
  return NON_ITEM_PATTERNS.some((pattern) => pattern.test(line));
}

/**
 * Mengen sind keine Geldbeträge.
 *
 * `parseAmountToCents` liest '0,568' als Tausendertrenner — für Geld richtig,
 * für ein Gewicht falsch. Deshalb hier ein eigener, sehr kurzer Parser.
 */
function parseQuantity(raw: string): number | null {
  const value = Number(raw.replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Trennt eine Zeile in Bezeichnung und Betrag. `null`, wenn es keine ist. */
export function splitItemLine(line: string): ParsedItem | null {
  const match = TRAILING_AMOUNT.exec(line);
  if (!match) return null;

  const [full, digits, trailingMinus] = match;
  const cents = parseAmountToCents(digits ?? '');
  if (cents === null) return null;

  // Manche Kassen setzen das Minus hinter den Betrag: '0,25-'.
  const signed = trailingMinus === '-' ? -Math.abs(cents) : cents;

  const rest = line.slice(0, line.length - full.length).trim();
  const quantityMatch = LEADING_QUANTITY.exec(rest);
  const label = (quantityMatch ? rest.slice(quantityMatch[0].length) : rest)
    .replace(/[\s.·:-]+$/, '')
    .trim();

  // Ohne Buchstaben ist es keine Bezeichnung, sondern eine Nummer.
  if (!/\p{L}{2}/u.test(label)) return null;

  return {
    label,
    amountCents: signed,
    quantity: quantityMatch ? parseQuantity(quantityMatch[1] ?? '') : null,
  };
}

interface TotalHit {
  cents: number;
  /** Zeilennummer — dort endet die Postenliste. */
  index: number;
}

/**
 * Findet die Endsumme und damit das Ende der Postenliste.
 *
 * Von **oben**, nicht von unten: Auf einem echten Bon folgt der Summe eine
 * Fußzeile, und die kann weitere Beträge tragen — Bonus-Guthaben, Coupons,
 * Rückgeld. Die erste ernst zu nehmende Summenzeile ist die richtige; eine
 * Zwischensumme wird dabei ausdrücklich übersprungen.
 */
function findTotal(lines: readonly string[]): TotalHit | null {
  for (const [index, line] of lines.entries()) {
    if (!/\b(summe|gesamt|total|zu\s*zahlen|endbetrag)\b/i.test(line)) continue;
    if (/\b(zwischensumme|mwst|ust|steuer|netto)\b/i.test(line)) continue;
    const match = TRAILING_AMOUNT.exec(line);
    const cents = match ? parseAmountToCents(match[1] ?? '') : null;
    if (cents !== null) return { cents, index };
  }
  return null;
}

function findDate(lines: readonly string[]): IsoDate | null {
  for (const line of lines) {
    const iso = ISO_DATE_IN_TEXT.exec(line);
    if (iso?.[1] && isIsoDate(iso[1])) return iso[1];

    const german = GERMAN_DATE.exec(line);
    if (!german) continue;
    const day = Number(german[1]);
    const month = Number(german[2]);
    const rawYear = Number(german[3]);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    const candidate = fromParts({ year, month, day });
    if (isIsoDate(candidate)) return candidate;
  }
  return null;
}

/**
 * Gesperrt gesetzte Kopfzeilen zusammenziehen: „R E W E" → „REWE".
 *
 * Kassen setzen den Namen des Händlers gern mit Leerzeichen zwischen den
 * Buchstaben. Ohne diese Zeile fällt er durch jede Prüfung auf
 * zusammenhängende Buchstaben — und als Händler landet die Straße darunter.
 */
function unspace(line: string): string {
  return /^(?:\p{L}\s+){2,}\p{L}\.?$/u.test(line) ? line.replace(/\s+/g, '') : line;
}

function findMerchant(lines: readonly string[]): string | null {
  // Der Händler steht im Kopf: die erste Zeile mit Buchstaben und ohne Betrag.
  for (const line of lines.slice(0, 6)) {
    const trimmed = unspace(line.trim());
    if (trimmed === '' || TRAILING_AMOUNT.test(trimmed)) continue;
    if (!/\p{L}{3}/u.test(trimmed)) continue;
    if (isNonItem(trimmed)) continue;
    return trimmed.slice(0, 60);
  }
  return null;
}

/**
 * Liest die Textschicht eines Bons.
 *
 * Gibt immer ein Ergebnis zurück — im schlechtesten Fall mit leerer
 * Postenliste und `quality: 'unsicher'`.
 */
export function parseTextLines(lines: readonly string[]): ParsedReceipt {
  const total = findTotal(lines);
  const totalCents = total?.cents ?? null;
  const date = findDate(lines);
  const merchant = findMerchant(lines);

  // Posten stehen **vor** der Summe. Was danach kommt, ist Fußzeile — und die
  // trägt Beträge: Bonus-Guthaben, Coupons, Rückgeld, Steuertabelle. Sie
  // mitzulesen war der Grund, warum ein echter REWE-Bon die Summenprobe
  // gerissen hat (22,24 € Bonus-Zeilen über der Endsumme).
  const itemLines = total ? lines.slice(0, total.index) : lines;

  const items: ParsedItem[] = [];
  for (const line of itemLines) {
    if (isNonItem(line)) continue;
    const item = splitItemLine(line);
    if (item && item.amountCents !== 0) items.push(item);
  }

  const aufgehend =
    totalCents !== null &&
    items.length > 0 &&
    sumCents(items.map((i) => i.amountCents)) === totalCents;

  return {
    merchant,
    date,
    totalCents,
    items: aufgehend ? items : [],
    quality: aufgehend ? 'geprüft' : 'unsicher',
  };
}

/* ------------------------------------------------------------------ *
 * ekabs.json
 * ------------------------------------------------------------------ */

/**
 * Feldnamen als Aliaslisten, nicht als eine feste Zuordnung.
 *
 * Grund, offen benannt: Die Feldnamen der EKaBS-Spezifikation sind hier
 * **nicht abschließend geprüft** — aus der veröffentlichten PDF ließ sich das
 * Schema nicht sauber auslesen. Deshalb wird eine Reihe plausibler Namen
 * probiert, und das Ergebnis muss die Summenprobe bestehen. Passt es nicht,
 * liefert `parseEkabs` `null`, und der Textschicht-Weg übernimmt. Falsche
 * Zahlen kann diese Unsicherheit damit nicht erzeugen — nur einen Rückfall.
 *
 * Sobald ein echter Beleg vorliegt, kommen die tatsächlichen Namen nach vorn.
 */
const ITEM_LIST_KEYS = ['items', 'lines', 'line_items', 'positions', 'positionen'] as const;
const ITEM_LABEL_KEYS = ['name', 'description', 'text', 'bezeichnung', 'label'] as const;
const ITEM_AMOUNT_KEYS = [
  'total',
  'total_price',
  'gross_amount',
  'gross',
  'amount',
  'brutto',
  'price',
] as const;
const ITEM_QUANTITY_KEYS = ['quantity', 'qty', 'menge', 'amount_quantity'] as const;
const TOTAL_KEYS = ['total', 'total_amount', 'gross_total', 'sum', 'summe', 'amount'] as const;
const DATE_KEYS = ['date', 'timestamp', 'timestamp_start', 'datetime', 'receipt_date'] as const;
const MERCHANT_KEYS = ['merchant', 'seller', 'company', 'issuer', 'vendor', 'taxpayer'] as const;
const NAME_KEYS = ['name', 'company_name', 'title'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pick(source: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key];
  }
  return undefined;
}

/** Beträge kommen als Zahl in Euro oder als Zeichenkette. Beides zu Cent. */
export function toCents(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value * 100);
  if (typeof value === 'string') return parseAmountToCents(value);
  if (isRecord(value)) {
    const inner = pick(value, ['amount', 'value', 'gross', 'brutto']);
    return inner === undefined ? null : toCents(inner);
  }
  return null;
}

function toIsoDate(value: unknown): IsoDate | null {
  if (typeof value !== 'string') return null;
  const day = value.slice(0, 10);
  if (isIsoDate(day)) return day;
  const german = GERMAN_DATE.exec(value);
  if (!german) return null;
  const rawYear = Number(german[3]);
  const candidate = fromParts({
    year: rawYear < 100 ? 2000 + rawYear : rawYear,
    month: Number(german[2]),
    day: Number(german[1]),
  });
  return isIsoDate(candidate) ? candidate : null;
}

function findItemList(source: Record<string, unknown>): unknown[] | null {
  const direct = pick(source, ITEM_LIST_KEYS);
  if (Array.isArray(direct)) return direct;
  // Eine Ebene tiefer suchen — viele Belege verschachteln unter 'receipt' o. ä.
  for (const value of Object.values(source)) {
    if (!isRecord(value)) continue;
    const nested = pick(value, ITEM_LIST_KEYS);
    if (Array.isArray(nested)) return nested;
  }
  return null;
}

function findScalar(source: Record<string, unknown>, keys: readonly string[]): unknown {
  const direct = pick(source, keys);
  if (direct !== undefined) return direct;
  for (const value of Object.values(source)) {
    if (!isRecord(value)) continue;
    const nested = pick(value, keys);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

/**
 * Liest `ekabs.json`. `null`, wenn die Datei nicht passt oder die Posten nicht
 * auf die Summe aufgehen — dann ist der Textschicht-Weg der bessere.
 */
export function parseEkabs(json: unknown): ParsedReceipt | null {
  if (!isRecord(json)) return null;

  const rawItems = findItemList(json);
  if (!rawItems) return null;

  const items: ParsedItem[] = [];
  for (const raw of rawItems) {
    if (!isRecord(raw)) continue;
    const label = pick(raw, ITEM_LABEL_KEYS);
    const amount = toCents(pick(raw, ITEM_AMOUNT_KEYS));
    if (typeof label !== 'string' || label.trim() === '' || amount === null) continue;
    const quantityRaw = pick(raw, ITEM_QUANTITY_KEYS);
    items.push({
      label: label.trim().slice(0, 60),
      amountCents: amount,
      quantity:
        typeof quantityRaw === 'number'
          ? quantityRaw
          : typeof quantityRaw === 'string'
            ? parseQuantity(quantityRaw)
            : null,
    });
  }
  if (items.length === 0) return null;

  const totalCents = toCents(findScalar(json, TOTAL_KEYS));
  if (totalCents === null) return null;
  if (sumCents(items.map((item) => item.amountCents)) !== totalCents) return null;

  const merchantRaw = findScalar(json, MERCHANT_KEYS);
  const merchant =
    typeof merchantRaw === 'string'
      ? merchantRaw
      : isRecord(merchantRaw)
        ? ((pick(merchantRaw, NAME_KEYS) as string | undefined) ?? null)
        : null;

  return {
    merchant: typeof merchant === 'string' ? merchant.trim().slice(0, 60) : null,
    date: toIsoDate(findScalar(json, DATE_KEYS)),
    totalCents,
    items,
    quality: 'exakt',
  };
}

/* ------------------------------------------------------------------ *
 * Zuordnung zu Töpfen
 * ------------------------------------------------------------------ */

/**
 * Schlagwort eines Postens: klein, ohne Ziffern, Einheiten und Satzzeichen.
 *
 * Aus „2 x Bio-Vollmilch 3,8% 1L" wird „bio vollmilch" — damit derselbe
 * Artikel beim nächsten Einkauf wiedererkannt wird, auch wenn Menge oder
 * Packungsgröße im Namen stehen.
 */
export function normalizeKeyword(label: string): string {
  return label
    .toLowerCase()
    .replace(/[0-9]+([.,][0-9]+)?\s*(g|kg|ml|l|stk|st|x|%)\b/g, ' ')
    .replace(/[^\p{L}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface ItemRuleLike {
  keyword: string;
  potId: string;
}

/**
 * Schlägt einen Topf für einen Posten vor.
 *
 * Das längste passende Schlagwort gewinnt: „vollmilch" ist genauer als
 * „milch", und wer beides gelernt hat, meint das Genauere.
 */
export function suggestPot(label: string, rules: readonly ItemRuleLike[]): string | null {
  const haystack = normalizeKeyword(label);
  if (haystack === '') return null;

  let best: ItemRuleLike | null = null;
  for (const rule of rules) {
    const keyword = rule.keyword.trim();
    if (keyword === '' || !haystack.includes(keyword)) continue;
    if (!best || keyword.length > best.keyword.trim().length) best = rule;
  }
  return best?.potId ?? null;
}

/* ------------------------------------------------------------------ *
 * Aufteilen auf Buchungen
 * ------------------------------------------------------------------ */

export interface SplitGroup {
  potId: string | null;
  /** Immer positiv — das Vorzeichen steckt in `kind`, wie überall. */
  amountCents: number;
  kind: 'expense' | 'income';
  /** Die Posten, die in diese Buchung eingegangen sind. */
  labels: string[];
  /**
   * Die Plätze dieser Posten in der übergebenen Liste.
   *
   * Nötig, damit die Oberfläche Angaben je Posten — heute die Tags — der
   * richtigen Buchung zuordnen kann, ohne die Gruppierung nachzubauen. Eine
   * zweite Gruppierung wäre eine zweite Wahrheit.
   */
  indices: number[];
}

/**
 * Fasst die Posten eines Bons zu je einer Buchung pro Topf zusammen.
 *
 * Drei Fälle, die hier entschieden werden und nicht in der Oberfläche:
 *
 * - Ein Topf, dessen Posten sich zu **null** summieren (Pfand und
 *   Pfandrückgabe), erzeugt keine Buchung. Eine Buchung über 0,00 € ist
 *   Rauschen.
 * - Summieren sie sich **negativ** (nur Rabatte in diesem Topf), wird daraus
 *   eine Einnahme. Beträge sind im Datenmodell immer positiv.
 * - Die Reihenfolge der Gruppen folgt dem ersten Auftreten im Bon, damit die
 *   Vorschau und das Ergebnis dieselbe Reihenfolge haben.
 */
export function groupItemsByPot(
  items: readonly ParsedItem[],
  potIds: readonly (string | null)[],
): SplitGroup[] {
  const order: (string | null)[] = [];
  const byPot = new Map<
    string | null,
    { amountCents: number; labels: string[]; indices: number[] }
  >();

  items.forEach((item, index) => {
    const potId = potIds[index] ?? null;
    let group = byPot.get(potId);
    if (!group) {
      group = { amountCents: 0, labels: [], indices: [] };
      byPot.set(potId, group);
      order.push(potId);
    }
    group.amountCents += item.amountCents;
    group.labels.push(item.label);
    group.indices.push(index);
  });

  const groups: SplitGroup[] = [];
  for (const potId of order) {
    const group = byPot.get(potId);
    if (!group || group.amountCents === 0) continue;
    groups.push({
      potId,
      amountCents: Math.abs(group.amountCents),
      kind: group.amountCents < 0 ? 'income' : 'expense',
      labels: group.labels,
      indices: group.indices,
    });
  }
  return groups;
}
