/**
 * Produkt → Kategorie und Tags, für das Format `lux`.
 *
 * **Eine reine Tabelle, nichts sonst.** Sie ist zum Anfassen gedacht: Zeile
 * dazu, Zeile weg, fertig. Deshalb liegt sie in einer eigenen Datei und nicht
 * im Profil — wer hier etwas ändert, soll nicht durch Erkennungsmuster
 * scrollen müssen.
 *
 * Drei Regeln, damit es beim Erweitern nicht still danebengeht:
 *
 * 1. **`keyword` normalisiert schreiben** — klein, ohne Ziffern und
 *    Einheiten, so wie `normalizeKeyword` es erzeugt. `'Bit-Satz 5tlg'` wird
 *    dort zu `'bit satz'`; steht in der Tabelle `'Bit-Satz'`, trifft es nie.
 * 2. **Verglichen wird auf Teilzeichenkette, das längste Schlagwort gewinnt.**
 *    Kurze Schlagwörter treffen deshalb zu viel: `'bit'` passt auch auf
 *    „Bitterschokolade".
 * 3. **Ein Vorschlag ist kein Beschluss.** Was hier steht, füllt im Bon-Import
 *    nur die Auswahl vor; der Nutzer sieht und ändert sie. Und was er selbst
 *    zuordnet, schlägt diese Tabelle immer.
 */

import type { ProductRule } from '../../profile';

export const PRODUKTE: readonly ProductRule[] = [
  // Werkzeug und Elektro — bei dieser Kette im Regal neben allem anderen.
  { keyword: 'gewebeband', kategorie: 'sonstiges', tags: ['Werkzeug'] },
  { keyword: 'abisolier', kategorie: 'sonstiges', tags: ['Werkzeug'] },
  { keyword: 'bit satz', kategorie: 'sonstiges', tags: ['Werkzeug'] },
  { keyword: 'bit set', kategorie: 'sonstiges', tags: ['Werkzeug'] },

  // Haushalt
  { keyword: 'servierschale', kategorie: 'sonstiges', tags: ['Haushalt'] },
  { keyword: 'spuelmittel', kategorie: 'sonstiges', tags: ['Haushalt'] },

  // Getränke samt Pfand. Pfand bleibt bei den Lebensmitteln: Es gehört zum
  // Einkauf und nicht in einen eigenen Topf — die Rückgabe kommt später als
  // negativer Posten und hebt es dort wieder auf.
  { keyword: 'cola', kategorie: 'lebensmittel', tags: ['Getränke'] },
  { keyword: 'spezi', kategorie: 'lebensmittel', tags: ['Getränke'] },
  { keyword: 'pfandartikel', kategorie: 'lebensmittel', tags: ['Pfand'] },

  // Süßes
  { keyword: 'brausepulver', kategorie: 'lebensmittel', tags: ['Süßes'] },
  { keyword: 'schokolinsen', kategorie: 'lebensmittel', tags: ['Süßes'] },
  { keyword: 'schoko', kategorie: 'lebensmittel', tags: ['Süßes'] },
];
