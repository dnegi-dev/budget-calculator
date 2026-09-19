/**
 * Anschriften: kurz anzeigen, an die Karten-Anwendung übergeben.
 *
 * Reine Funktionen ohne React und ohne Storage — die Kürzung entscheidet, was
 * in einer Listenzeile steht, und sie soll testbar sein statt in einer
 * Komponente zu stecken.
 */

/**
 * Die Kurzform für eine Listenzeile: der Teil vor dem ersten Komma.
 *
 * „Beispielstraße 96, 12345 Musterstadt" wird zu „Beispielstraße 96". Das ist
 * der Teil, der eine Anschrift im Alltag unterscheidbar macht — PLZ und Ort
 * sind bei den meisten Einkäufen ohnehin dieselben.
 *
 * Ohne Komma wird hart gekürzt. Das ist unschön, aber ehrlich: Eine Zeile,
 * die über die Breite läuft, verdrängt in `EntryList` den Betrag, und der ist
 * wichtiger.
 */
export function shortenAddress(address: string, max = 28): string {
  const sauber = address.trim().replace(/\s+/g, ' ');
  if (sauber === '') return '';

  const vorKomma = sauber.split(',')[0]?.trim() ?? sauber;
  const kurz = vorKomma === '' ? sauber : vorKomma;
  if (kurz.length <= max) return kurz;
  // Das Auslassungszeichen zählt mit, sonst ist das Ergebnis ein Zeichen zu lang.
  return `${kurz.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Das Ziel für den Tipp auf die Anschrift — ein `geo:`-Verweis.
 *
 * **Bewusst keine Karten-Adresse im Netz.** Ein `https://…maps…`-Link schickte
 * die Anschrift an einen Dritten, und `app/datenschutz/page.tsx` sagt
 * belegbar zu, dass nichts das Gerät verlässt. `geo:` übergibt sie der
 * Karten-Anwendung des Geräts: kein Netzverkehr, und die Wahl des Anbieters
 * bleibt beim Nutzer.
 *
 * Der Preis, ehrlich benannt: **Am Desktop tut ein `geo:`-Verweis meist
 * nichts.** Deshalb ist die Anschrift nur bis `md` ein Link und darüber
 * schlichter Text — ein Klick, der ins Leere führt, ist schlechter als
 * keiner.
 *
 * `0,0` als Koordinate ist die übliche Schreibweise, wenn nur ein Suchbegriff
 * vorliegt: Die Anwendung nimmt dann `q` und ignoriert die Nullen.
 *
 * `null`, wenn nichts Verwertbares dasteht — eine Anschrift ohne einen
 * einzigen Buchstaben oder eine Ziffer führt zu einer leeren Kartensuche.
 */
export function mapsHref(address: string): string | null {
  const sauber = address.trim().replace(/\s+/g, ' ');
  if (!/[\p{L}\p{N}]/u.test(sauber)) return null;
  return `geo:0,0?q=${encodeURIComponent(sauber)}`;
}
