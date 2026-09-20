/**
 * Produkt → Kategorie und Tags, für das Format `ott`.
 *
 * **Eine reine Tabelle, nichts sonst.** Sie ist zum Anfassen gedacht: Zeile
 * dazu, Zeile weg, fertig. Deshalb liegt sie in einer eigenen Datei und nicht
 * im Profil — wer hier etwas ändert, soll nicht durch Erkennungsmuster
 * scrollen müssen.
 *
 * Die Schlagwörter sind bewusst allgemein gehalten — Einrichtungsgegenstand,
 * nicht Produktname. Ein Bon dieses Formats druckt für jeden Posten einen
 * kurzen Eigennamen der Produktreihe; der wäre als Schlagwort genauer, aber
 * genauso eine Spur zur Kette wie ihr Name selbst — und genau die soll dieses
 * Repository nicht tragen.
 *
 * Zwei Regeln wie bei `lux`:
 *
 * 1. **`keyword` normalisiert schreiben** — klein, ohne Ziffern und
 *    Einheiten, so wie `normalizeKeyword` es erzeugt.
 * 2. **Verglichen wird auf Teilzeichenkette, das längste Schlagwort
 *    gewinnt.** Kurze Schlagwörter treffen deshalb zu viel.
 */

import type { ProductRule } from '../../profile';

export const PRODUKTE: readonly ProductRule[] = [
  // Bad
  { keyword: 'badematte', kategorie: 'wohnen', tags: ['Bad'] },
  { keyword: 'duschvorhang', kategorie: 'wohnen', tags: ['Bad'] },

  // Küche und Tisch
  { keyword: 'teller', kategorie: 'wohnen', tags: ['Küche'] },
  { keyword: 'glas', kategorie: 'wohnen', tags: ['Küche'] },
  { keyword: 'karaffe', kategorie: 'wohnen', tags: ['Küche'] },
  { keyword: 'tablett', kategorie: 'wohnen', tags: ['Küche'] },

  // Textil und Deko
  { keyword: 'kissenbezug', kategorie: 'wohnen', tags: ['Textil'] },
  { keyword: 'kissen', kategorie: 'wohnen', tags: ['Textil'] },

  // Aufbewahrung
  { keyword: 'verschlussklammer', kategorie: 'wohnen', tags: ['Aufbewahrung'] },
  { keyword: 'aufbewahrungsbox', kategorie: 'wohnen', tags: ['Aufbewahrung'] },
  { keyword: 'kleiderhaken', kategorie: 'wohnen', tags: ['Aufbewahrung'] },

  // Unterwegs
  { keyword: 'tragetasche', kategorie: 'wohnen', tags: ['Sonstiges'] },
];
