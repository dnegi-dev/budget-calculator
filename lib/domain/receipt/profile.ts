/**
 * Bon-Profile: was eine einzelne Kasse anders druckt als die anderen.
 *
 * Der gemeinsame Parser in `lib/domain/receipt-parse.ts` liest jeden Bon so
 * gut, wie es ohne Vorwissen geht. Ein Profil legt Vorwissen dazu: welche
 * Kopfzeilen dieses Format als Werbung druckt, und welches Produkt in welchen
 * Topf gehört.
 *
 * **Ein Profil verbessert nur, es ist nie Voraussetzung.** Trifft keines, kommt
 * genau das Ergebnis heraus, das vorher herauskam. Das ist die Regel, die
 * verhindert, dass ein unbekannter Bon schlechter gelesen wird als bisher —
 * und der Grund, warum `matchProfile` bei Zweifel `null` liefert.
 *
 * ## Warum hier keine Namen stehen
 *
 * Erkannt wird ein Format am **Fingerabdruck seines Layouts**, nicht am Namen
 * des Händlers: an einer Werbezeile, an einem Spaltenkopf, an der Schreibweise
 * des Datums. Der Name der Kette ist Daten — er steht auf dem Bon, wandert in
 * die lokale Datenbank und auf den Bildschirm, aber nie in dieses Repository.
 * Die Profildateien heißen deshalb nach Tieren und die Kennungen sind daraus
 * abgeleitet; die Regel steht in `AGENTS.md`.
 */

import { normalizeKeyword } from '../receipt-parse';
import type { PotCategory } from '../pot-categories';

/**
 * Eine Zeile der Produkt-Tabelle: Schlagwort → Kategorie und Tags.
 *
 * `keyword` muss **normalisiert** sein — klein geschrieben, ohne Ziffern und
 * Einheiten, so wie `normalizeKeyword` es erzeugt. Sonst trifft es nie, und
 * das fällt niemandem auf, weil ein fehlender Vorschlag kein Fehler ist.
 */
export interface ProductRule {
  keyword: string;
  kategorie: PotCategory;
  tags?: readonly string[];
}

export interface ChainProfile {
  /**
   * Drei bis vier Buchstaben, abgeleitet vom **Dateinamen** (dem Tiernamen) —
   * nie vom Namen der Kette.
   */
  id: string;
  /**
   * Muster, die zusammen nur auf dieses Bonformat passen: Layout-Eigenheiten
   * wie eine Werbezeile, ein Spaltenkopf, die Schreibweise der Fußzeile.
   */
  fingerprint: readonly RegExp[];
  /** So viele Muster müssen treffen. Kleiner als 2 wäre geraten. */
  minHits: number;
  /**
   * Kopfzeilen, die dieses Format druckt und die kein Händler sind. Ergänzt
   * die allgemeine Liste im Parser, ersetzt sie nicht.
   */
  chatter?: readonly RegExp[];
  /** Produkt → Zuordnung. Steht in einer eigenen Datei je Profil. */
  products: readonly ProductRule[];
}

export interface ProfileHit {
  profile: ChainProfile;
  /** Wie viele Muster getroffen haben — nur zum Vergleichen. */
  hits: number;
}

/**
 * Sucht das Profil, dessen Fingerabdruck am besten passt.
 *
 * Bei Gleichstand gewinnt das erste in der Registry: eine willkürliche, aber
 * feste Wahl ist besser als eine, die von der Reihenfolge der Dateien abhängt.
 */
export function matchProfile(
  lines: readonly string[],
  profiles: readonly ChainProfile[],
): ProfileHit | null {
  let best: ProfileHit | null = null;

  for (const profile of profiles) {
    let hits = 0;
    for (const pattern of profile.fingerprint) {
      if (lines.some((line) => pattern.test(line))) hits += 1;
    }
    if (hits < profile.minHits) continue;
    if (!best || hits > best.hits) best = { profile, hits };
  }

  return best;
}

export interface ProductSuggestion {
  kategorie: PotCategory;
  tags: readonly string[];
}

/**
 * Schlägt Kategorie und Tags für einen Posten vor.
 *
 * Das **längste** passende Schlagwort gewinnt — dieselbe Regel wie bei den
 * gelernten Zuordnungen in `suggestPot`: „vollmilch" ist genauer als „milch",
 * und wer beides in der Tabelle hat, meint das Genauere.
 *
 * Bewusst eine eigene Funktion und keine Erweiterung von `suggestPot`: Die
 * gelernten Regeln zeigen auf einen **Topf**, diese Tabelle auf eine
 * **Kategorie**. Das in eine Funktion zu quetschen hieße, zwei Rückgabetypen
 * zu mischen und beide Tests zu verwässern.
 */
export function suggestFromProfile(
  label: string,
  products: readonly ProductRule[],
): ProductSuggestion | null {
  const haystack = normalizeKeyword(label);
  if (haystack === '') return null;

  let best: ProductRule | null = null;
  for (const rule of products) {
    const keyword = rule.keyword.trim();
    if (keyword === '' || !haystack.includes(keyword)) continue;
    if (!best || keyword.length > best.keyword.trim().length) best = rule;
  }

  return best ? { kategorie: best.kategorie, tags: best.tags ?? [] } : null;
}
