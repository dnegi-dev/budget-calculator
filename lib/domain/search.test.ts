import { describe, expect, it } from 'vitest';
import { entryMatchesQuery, matchesQuery } from './search';

describe('matchesQuery', () => {
  it('trifft ohne Rücksicht auf Groß- und Kleinschreibung und Leerraum', () => {
    expect(matchesQuery('  MILCH ', 'Vollmilch 3,5 %')).toBe(true);
    expect(matchesQuery('brot', 'Vollmilch', null, undefined)).toBe(false);
  });

  it('filtert bei leerem Begriff nicht', () => {
    expect(matchesQuery('   ', null)).toBe(true);
  });
});

describe('entryMatchesQuery', () => {
  it('sucht in Notiz, Firma und Anschrift', () => {
    const entry = { note: null, merchant: null, address: 'Hauptstraße 1, Berlin' };
    expect(entryMatchesQuery(entry, 'berlin')).toBe(true);
    expect(entryMatchesQuery({ ...entry, address: null }, 'berlin')).toBe(false);
  });
});
