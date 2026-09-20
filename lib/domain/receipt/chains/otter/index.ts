/**
 * Profil `ott`.
 *
 * Erkennungsmerkmale dieses Formats — alles Layout, kein Name:
 *
 * - ein **englischer Hinweis auf einen Zweitausdruck**, noch vor dem
 *   Händlernamen — „This is a duplicate of the original receipt"
 * - eine **Bestellnummer** in eigener Zeile: „Ordernummer: <Ziffern>"
 * - der **Spaltenkopf der MwSt-Tabelle**: „KENNZ RATE NETTO STEUER"
 * - die **Fußzeile** „Rechnungsdatum = Lieferdatum"
 * - der **Spaltenkopf der Signaturzeile**: „Datum Uhrzeit EH KA Bon"
 *
 * Die erste Zeile ist zugleich der Grund, warum es dieses Profil gibt: Sie
 * stand über dem Händlernamen, derselbe Fehler wie bei „lux", nur auf
 * Englisch. Die Zeile steht inzwischen auch in der allgemeinen Liste im
 * Parser — das Profil nennt sie trotzdem, damit die Erkennung nicht davon
 * abhängt, dass jemand die allgemeine Liste nie kürzt.
 *
 * Dieses Format druckt Posten mit Menge größer eins auf **zwei Zeilen**:
 * die Bezeichnung allein, darunter Menge, Einzel- und Gesamtpreis samt
 * Steuerklasse — ohne einen einzigen Buchstaben. Das zieht
 * `joinWrappedQuantityLines` im Parser zusammen, allgemein und nicht nur
 * für dieses Profil: Ein Profil verbessert nur die Erkennung und die
 * Zuordnung, nicht das Lesen der Postenzeilen selbst.
 */

import type { ChainProfile } from '../../profile';
import { PRODUKTE } from './produkte';

export const OTTER: ChainProfile = {
  id: 'ott',
  minHits: 3,
  fingerprint: [
    /^this is a (duplicate|copy) of the original receipt$/i,
    /^ordernummer:\s*\d+/i,
    /^kennz\s+rate\s+netto\s+steuer$/i,
    /^rechnungsdatum\s*=\s*lieferdatum$/i,
    /^datum\s+uhrzeit\s+eh\s+ka\s+bon$/i,
  ],
  products: PRODUKTE,
};
