/**
 * Profil `lux`.
 *
 * Erkennungsmerkmale dieses Formats — alles Layout, kein Name:
 *
 * - eine **Werbezeile über dem Namen** („Du hast N Treuepunkte gesammelt.")
 * - der Spaltenkopf `Preis EUR` über den Posten
 * - Datum und Uhrzeit in einer Zeile, direkt hinter `Datum:`, mit
 *   zweistelligem Jahr
 * - eine Fußzeile mit `Filiale:` und `Kasse:`
 *
 * Die Werbezeile ist zugleich der Grund, warum es dieses Profil gibt: Sie
 * stand über dem Händlernamen, und der Einkauf hieß danach „Du hast 27
 * Treuepunkte gesammelt." Die allgemeine Liste im Parser fängt das inzwischen
 * auch — das Profil nennt sie trotzdem, damit die Erkennung nicht davon
 * abhängt, dass jemand die allgemeine Liste nie kürzt.
 */

import type { ChainProfile } from '../../profile';
import { PRODUKTE } from './produkte';

export const LUCHS: ChainProfile = {
  id: 'lux',
  minHits: 2,
  fingerprint: [
    /^du hast \d+ treuepunkte gesammelt/i,
    /^preis\s+eur$/i,
    /^datum:\s*\d{1,2}\.\d{1,2}\.\d{2}\b.*\bzeit:/i,
    /^filiale:\s*\d+\s+kasse:\s*\d+/i,
  ],
  chatter: [/treuepunkte/i],
  products: PRODUKTE,
};
