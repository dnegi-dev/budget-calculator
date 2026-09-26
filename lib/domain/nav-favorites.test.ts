import { describe, expect, it } from 'vitest';
import {
  MAX_DESKTOP_FAVORITES,
  parseFavoriteIds,
  resolveFavoritePots,
  toggleFavorite,
} from './nav-favorites';

const pot = (id: string, extra: { deletedAt?: string; archivedAt?: string } = {}) => ({
  id,
  deletedAt: extra.deletedAt ?? null,
  archivedAt: extra.archivedAt ?? null,
});

describe('parseFavoriteIds', () => {
  it('liest eine Liste und verwirft Unsinn und Doppelte', () => {
    expect(parseFavoriteIds('["a","b","a",3,""]')).toEqual(['a', 'b']);
    expect(parseFavoriteIds('{"a":1}')).toEqual([]);
    expect(parseFavoriteIds('kaputt')).toEqual([]);
    expect(parseFavoriteIds(null)).toEqual([]);
  });
});

describe('resolveFavoritePots', () => {
  const pots = [
    pot('a'),
    pot('b'),
    pot('archiviert', { archivedAt: '2026-01-01T00:00:00.000Z' }),
    pot('geloescht', { deletedAt: '2026-01-01T00:00:00.000Z' }),
    pot('c'),
    pot('d'),
    pot('e'),
  ];

  it('behält die gespeicherte Reihenfolge und übergeht, was nicht zählt', () => {
    const ids = ['c', 'archiviert', 'weg', 'geloescht', 'a'];
    expect(resolveFavoritePots(ids, pots, MAX_DESKTOP_FAVORITES).map((p) => p.id)).toEqual([
      'c',
      'a',
    ]);
  });

  it('deckelt die Anzahl', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    expect(resolveFavoritePots(ids, pots, 4)).toHaveLength(4);
    expect(resolveFavoritePots(ids, pots, 1).map((p) => p.id)).toEqual(['a']);
  });
});

describe('toggleFavorite', () => {
  it('wählt an und ab', () => {
    expect(toggleFavorite(['a'], 'b', 4)).toEqual(['a', 'b']);
    expect(toggleFavorite(['a', 'b'], 'a', 4)).toEqual(['b']);
  });

  it('ändert über dem Deckel nichts', () => {
    expect(toggleFavorite(['a', 'b', 'c', 'd'], 'e', 4)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('zählt einen archivierten Favoriten nicht gegen den Deckel', () => {
    expect(toggleFavorite(['archiviert'], 'a', 1, [])).toEqual(['archiviert', 'a']);
  });
});
