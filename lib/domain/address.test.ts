import { describe, expect, it } from 'vitest';
import { mapsHref, shortenAddress } from './address';

describe('shortenAddress', () => {
  it('nimmt den Teil vor dem ersten Komma', () => {
    expect(shortenAddress('Beispielstraße 96, 12345 Musterstadt')).toBe('Beispielstraße 96');
  });

  it('räumt Leerraum auf', () => {
    expect(shortenAddress('  Beispielstraße   96 ,  12345 Musterstadt ')).toBe('Beispielstraße 96');
  });

  it('kürzt hart, wenn kein Komma dasteht', () => {
    const lang = 'Sehr lange Straßenbezeichnung ohne jedes Komma 123';
    const kurz = shortenAddress(lang, 20);
    expect(kurz).toHaveLength(20);
    expect(kurz.endsWith('…')).toBe(true);
  });

  it('lässt kurz genug in Ruhe', () => {
    expect(shortenAddress('Am Markt 1', 20)).toBe('Am Markt 1');
  });

  /**
   * Eine Anschrift, die mit einem Komma beginnt, ergäbe sonst eine leere
   * Zeile — und in der Liste stände dann nichts, obwohl etwas gespeichert
   * ist.
   */
  it('fällt auf den ganzen Text zurück, wenn vor dem Komma nichts steht', () => {
    expect(shortenAddress(', 12345 Musterstadt')).toBe(', 12345 Musterstadt');
  });

  it('gibt für leere Eingaben eine leere Zeichenkette', () => {
    expect(shortenAddress('')).toBe('');
    expect(shortenAddress('   ')).toBe('');
  });
});

describe('mapsHref', () => {
  it('baut einen geo-Verweis mit der vollen Anschrift', () => {
    expect(mapsHref('Beispielstraße 96, 12345 Musterstadt')).toBe(
      'geo:0,0?q=Beispielstra%C3%9Fe%2096%2C%2012345%20Musterstadt',
    );
  });

  /**
   * `geo:` und keine Karten-Adresse im Netz: Ein `https`-Link schickte die
   * Anschrift an einen Dritten, und die Datenschutzerklärung sagt zu, dass
   * nichts das Gerät verlässt.
   */
  it('zeigt auf kein Netzwerkziel', () => {
    const href = mapsHref('Am Markt 1');
    expect(href?.startsWith('geo:')).toBe(true);
    expect(href).not.toMatch(/https?:/);
  });

  it('gibt null, wenn nichts Verwertbares dasteht', () => {
    expect(mapsHref('')).toBeNull();
    expect(mapsHref('   ')).toBeNull();
    expect(mapsHref('—,  -')).toBeNull();
  });

  it('nimmt auch eine Anschrift ohne Ziffern', () => {
    expect(mapsHref('Am Markt')).toBe('geo:0,0?q=Am%20Markt');
  });
});
