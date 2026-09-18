/**
 * Tags — die zweite Achse neben den Töpfen.
 *
 * Ein Topf beantwortet „wovon bezahle ich das", ein Tag „wozu gehört das":
 * Urlaub Norwegen, Umzug, Auto. Deshalb ist ein Tag **kein zweiter Topf**: Er
 * hat kein Limit, keinen Restbetrag und keine Periode, und eine Buchung kann
 * mehrere tragen.
 *
 * Daraus folgt die eine Zahl, die man beim Auswerten wissen muss: **Die Summen
 * je Tag addieren sich nicht zur Gesamtsumme.** Eine Buchung mit „Urlaub" und
 * „Auto" zählt in beiden. Wer das verschweigt, baut eine Auswertung, deren
 * Zahlen sich nicht erklären lassen — die Oberfläche schreibt es deshalb dazu.
 *
 * Tags liegen als Liste an der Buchung, nicht in einer eigenen Tabelle. Das
 * hält den Schreibweg einfach (eine Transaktion, eine Zeile in `changeLog`),
 * und die Vorschläge entstehen aus dem, was schon benutzt wurde. Der Preis:
 * Umbenennen und Löschen fassen viele Buchungen an — dafür gibt es die
 * Sammeloperationen im Repository, nicht eine Schleife in der Oberfläche.
 *
 * Verglichen wird über `tagKey()`, angezeigt die geschriebene Form: „Urlaub"
 * und „urlaub" sind derselbe Tag, sonst stehen nach drei Monaten beide in der
 * Liste.
 */

import type { EntryKind } from './types';

export const TAG_LIMITS = {
  /** Länge eines Tags. Kurz genug, dass er als Marke in eine Zeile passt. */
  length: 24,
  /**
   * Tags je Buchung. Nicht als Schikane, sondern als Grenze gegen den Fall,
   * in dem ein eingefügter Text zu dreißig Marken an einer Zeile wird.
   */
  perEntry: 8,
} as const;

/**
 * Trennzeichen bei der Eingabe. Komma, weil es auf jeder Tastatur liegt.
 *
 * Global, damit `replace` alle erwischt: Eingefügter Text bringt gern mehrere
 * mit, und aus „a,b" darf nicht „a b,b" werden.
 */
const SEPARATORS = /[,;\n]/g;

/**
 * Vergleichsform eines Tags: klein geschrieben, ohne Rand.
 *
 * Die einzige Stelle, die entscheidet, ob zwei Tags derselbe sind — Listen,
 * Filter und Auswertung benutzen sie alle.
 */
export function tagKey(tag: string): string {
  return tag.trim().toLowerCase();
}

/**
 * Bringt eine Eingabe in die Form, in der sie gespeichert wird.
 *
 * `null` heißt: daraus wird kein Tag. Das führende `#` fällt weg, weil es
 * viele mittippen und „#urlaub" und „urlaub" sonst zwei Tags wären.
 */
export function normalizeTag(raw: string): string | null {
  // Reihenfolge zählt: Erst trimmen, dann das Raute-Zeichen. Umgekehrt bleibt
  // es bei „ #urlaub" stehen, weil `^` dann auf das Leerzeichen zeigt.
  const cleaned = raw
    .replace(SEPARATORS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^#+/, '')
    .trim()
    .slice(0, TAG_LIMITS.length)
    .trim();
  return cleaned === '' ? null : cleaned;
}

/**
 * Nimmt doppelte Tags heraus — verglichen über `tagKey`, behalten wird die
 * erste Schreibweise.
 */
export function dedupeTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of tags) {
    const normalized = normalizeTag(tag);
    if (normalized === null) continue;
    const key = tagKey(normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
    if (result.length >= TAG_LIMITS.perEntry) break;
  }
  return result;
}

/** Zerlegt eine Eingabezeile („urlaub, auto") in Tags. */
export function parseTags(raw: string): string[] {
  return dedupeTags(raw.split(SEPARATORS));
}

/** Hängt einen Tag an, wenn er nicht schon dransteht. */
export function addTag(tags: readonly string[], raw: string): string[] {
  return dedupeTags([...tags, raw]);
}

/** Nimmt einen Tag heraus, unabhängig von der Schreibweise. */
export function removeTag(tags: readonly string[], tag: string): string[] {
  const key = tagKey(tag);
  return tags.filter((candidate) => tagKey(candidate) !== key);
}

/** Ob eine Buchung diesen Tag trägt, unabhängig von der Schreibweise. */
export function hasTag(tags: readonly string[] | null | undefined, tag: string): boolean {
  const key = tagKey(tag);
  return (tags ?? []).some((candidate) => tagKey(candidate) === key);
}

/** Das Minimum, das die Auswertung von einer Buchung braucht. */
export interface TaggedEntry {
  kind: EntryKind;
  amountCents: number;
  /** Ältere Datensätze haben das Feld nicht. */
  tags?: readonly string[] | null;
}

export interface TagUsage {
  /** Die Schreibweise, die am häufigsten benutzt wurde. */
  tag: string;
  /** Anzahl Buchungen mit diesem Tag. */
  count: number;
}

export interface TagSum extends TagUsage {
  expenseCents: number;
  incomeCents: number;
}

/**
 * Alle benutzten Tags mit ihrer Häufigkeit, häufigste zuerst.
 *
 * Grundlage der Vorschläge beim Erfassen und der Liste in den Einstellungen —
 * dort zählt, was oft benutzt wird, nicht was teuer war. Bei gleicher
 * Häufigkeit alphabetisch, damit die Reihenfolge nicht bei jedem Rendern
 * wechselt.
 */
export function collectTags(entries: readonly TaggedEntry[]): TagUsage[] {
  return summarizeTags(entries)
    .tags.map(({ tag, count }) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'de', { sensitivity: 'base' }));
}

export interface TagSummary {
  tags: TagSum[];
  /** Ausgaben mit mindestens einem Tag. */
  taggedExpenseCents: number;
  /** Ausgaben ohne jeden Tag — ohne diese Zahl ist die Liste nicht zu lesen. */
  untaggedExpenseCents: number;
}

/**
 * Summiert je Tag und hält die Ausgaben ohne Tag daneben.
 *
 * Nach Ausgaben absteigend sortiert: Wer auswertet, sucht den größten Posten.
 */
export function summarizeTags(entries: readonly TaggedEntry[]): TagSummary {
  /** Schreibweisen je Vergleichsform, um die häufigste anzeigen zu können. */
  const spellings = new Map<string, Map<string, number>>();
  const sums = new Map<string, { count: number; expenseCents: number; incomeCents: number }>();
  let taggedExpenseCents = 0;
  let untaggedExpenseCents = 0;

  for (const entry of entries) {
    const tags = dedupeTags(entry.tags ?? []);
    if (entry.kind === 'expense') {
      if (tags.length > 0) taggedExpenseCents += entry.amountCents;
      else untaggedExpenseCents += entry.amountCents;
    }

    for (const tag of tags) {
      const key = tagKey(tag);

      const bySpelling = spellings.get(key) ?? new Map<string, number>();
      bySpelling.set(tag, (bySpelling.get(tag) ?? 0) + 1);
      spellings.set(key, bySpelling);

      const sum = sums.get(key) ?? { count: 0, expenseCents: 0, incomeCents: 0 };
      sum.count += 1;
      if (entry.kind === 'expense') sum.expenseCents += entry.amountCents;
      else sum.incomeCents += entry.amountCents;
      sums.set(key, sum);
    }
  }

  const tags = [...sums.entries()]
    .map(([key, sum]) => ({ tag: mostUsedSpelling(spellings.get(key)) ?? key, ...sum }))
    .sort(
      (a, b) =>
        b.expenseCents - a.expenseCents ||
        b.count - a.count ||
        a.tag.localeCompare(b.tag, 'de', { sensitivity: 'base' }),
    );

  return { tags, taggedExpenseCents, untaggedExpenseCents };
}

/** Bei Gleichstand die alphabetisch erste — damit die Anzeige stabil bleibt. */
function mostUsedSpelling(bySpelling: Map<string, number> | undefined): string | null {
  if (!bySpelling) return null;
  return (
    [...bySpelling.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de', { sensitivity: 'base' }),
    )[0]?.[0] ?? null
  );
}
