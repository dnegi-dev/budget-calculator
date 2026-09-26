/**
 * Lieblings-Töpfe im Menü: am Desktop bis zu vier in der Seitenleiste, mobil
 * einer in der unteren Leiste.
 *
 * Gespeichert werden nur IDs, und zwar am Gerät (`lib/prefs/device-prefs.ts`),
 * nicht am Haushalt — es ist Menü-Anordnung wie Thema und Akzentfarbe. Welche
 * davon tatsächlich im Menü stehen, entscheidet `resolveFavoritePots` beim
 * Anzeigen: Ein gelöschter oder archivierter Topf wird übergangen, nicht aus
 * der Liste entfernt. Wer ihn wieder aktiviert, hat seinen Favoriten zurück.
 */

import type { Pot } from './types';

export const MAX_DESKTOP_FAVORITES = 4;
export const MAX_MOBILE_FAVORITES = 1;

/** Der gespeicherte Text zu IDs. Unsinn ergibt eine leere Liste, nie einen Fehler. */
export function parseFavoriteIds(raw: string | null): string[] {
  if (raw === null) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((id): id is string => typeof id === 'string' && id !== ''))];
  } catch {
    return [];
  }
}

/**
 * Die Töpfe, die im Menü stehen: in gespeicherter Reihenfolge, nur solche, die
 * es gibt und die nicht archiviert sind, höchstens `max`.
 *
 * Ein gesperrtes Sparziel bleibt drin — wie auf der Töpfe-Seite ist es
 * sichtbar, nur nicht mehr bebuchbar, und seine Detailseite zeigt genau das.
 */
export function resolveFavoritePots<T extends Pick<Pot, 'id' | 'deletedAt' | 'archivedAt'>>(
  ids: readonly string[],
  pots: readonly T[],
  max: number,
): T[] {
  const byId = new Map(pots.map((pot) => [pot.id, pot]));
  const result: T[] = [];
  for (const id of ids) {
    const pot = byId.get(id);
    if (!pot || pot.deletedAt !== null || pot.archivedAt !== null) continue;
    if (result.some((known) => known.id === id)) continue;
    result.push(pot);
    if (result.length >= max) break;
  }
  return result;
}

/**
 * An- oder abwählen. Über dem Deckel ändert sich nichts — die Oberfläche graut
 * die übrigen Töpfe vorher aus, das hier ist die Absicherung dahinter.
 *
 * `available` sind die IDs, die gerade zählen (`resolveFavoritePots`). Ohne
 * sie blockierte ein archivierter Favorit, der im Menü gar nicht steht, einen
 * Platz.
 */
export function toggleFavorite(
  ids: readonly string[],
  id: string,
  max: number,
  available: readonly string[] = ids,
): string[] {
  if (ids.includes(id)) return ids.filter((known) => known !== id);
  const counted = ids.filter((known) => available.includes(known));
  if (counted.length >= max) return [...ids];
  return [...ids, id];
}
