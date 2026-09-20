import { describe, expect, it } from 'vitest';
import { matchProfile, suggestFromProfile, type ChainProfile } from './profile';
import { CHAIN_PROFILES } from './chains';
import { POT_CATEGORY_NAMES, resolveCategoryPot } from '../pot-categories';
import type { Pot } from '../types';

/**
 * Die Kopfzeilen des Formats, das `lux` erkennt — dieselben wie im Muster
 * `e2e/fixtures/bon-werbekopf.pdf`.
 */
const WERBEKOPF = [
  'Du hast 27 Treuepunkte gesammelt.',
  'Musterkette - Beispielstrasse 96',
  '12345 Musterstadt',
  'Preis EUR',
  'Gewebeband schwarz 1,99 A',
  'Summe 1,99',
  'Datum:07.09.26 Zeit: 18:04:39 Bon:83860',
  'Filiale: 4073 Kasse: 32',
];

/**
 * Die Kopfzeilen des Formats, das `ott` erkennt — dieselben wie in
 * `lib/domain/receipt-parse.test.ts` (`ZWEIZEILIGE_MENGE`).
 */
const ZWEITAUSDRUCK = [
  'This is a duplicate of the original receipt',
  'Musterhaus GmbH & Co. KG',
  'Ordernummer: 1631303135',
  'KENNZ RATE NETTO STEUER',
  'Datum Uhrzeit EH KA Bon',
  'Rechnungsdatum = Lieferdatum',
];

/** Ein Bon eines anderen Formats — Steuerklasse als Ziffer, Menge vorne. */
const ANDERES_FORMAT = [
  '18.09.2026 20:00 A1BC/1 123456/2 4711',
  'Sanft Toilettenpapier 3lg 2,75 1',
  '2x 1,55 Bio Apfelsaft 1L 3,10 1',
  'Zwischensumme 5,85',
  'SUMME EUR 5,85',
];

describe('matchProfile', () => {
  it('erkennt das Format am Layout, nicht am Namen', () => {
    const hit = matchProfile(WERBEKOPF, CHAIN_PROFILES);
    expect(hit?.profile.id).toBe('lux');
    // Alle vier Merkmale stehen im Muster.
    expect(hit?.hits).toBe(4);
  });

  it('erkennt ein zweites Format am eigenen Fingerabdruck', () => {
    const hit = matchProfile(ZWEITAUSDRUCK, CHAIN_PROFILES);
    expect(hit?.profile.id).toBe('ott');
    expect(hit?.hits).toBe(5);
  });

  /**
   * Der wichtigere Fall: Ein Profil, das zu viel trifft, würde fremde Bons
   * mit fremden Zuordnungen vorbelegen — und das fiele erst beim Auswerten
   * auf.
   */
  it('trifft ein fremdes Format nicht', () => {
    expect(matchProfile(ANDERES_FORMAT, CHAIN_PROFILES)).toBeNull();
    expect(matchProfile([], CHAIN_PROFILES)).toBeNull();
  });

  it('verlangt die Mindestzahl an Treffern', () => {
    // Nur der Spaltenkopf: ein Merkmal, und das ist zu wenig.
    expect(matchProfile(['Preis EUR', 'Brot 1,00', 'Summe 1,00'], CHAIN_PROFILES)).toBeNull();
  });

  it('nimmt bei Gleichstand das erste Profil der Registry', () => {
    const muster: RegExp[] = [/^gleich$/];
    const a: ChainProfile = { id: 'aaa', minHits: 1, fingerprint: muster, products: [] };
    const b: ChainProfile = { id: 'bbb', minHits: 1, fingerprint: muster, products: [] };
    expect(matchProfile(['gleich'], [a, b])?.profile.id).toBe('aaa');
  });
});

describe('suggestFromProfile', () => {
  const profil = CHAIN_PROFILES[0]!;

  it('findet die Zuordnung zu einem Posten des Bons', () => {
    expect(suggestFromProfile('Gewebeband schwarz', profil.products)).toEqual({
      kategorie: 'sonstiges',
      tags: ['Werkzeug'],
    });
    expect(suggestFromProfile('Pfandartikel', profil.products)).toEqual({
      kategorie: 'lebensmittel',
      tags: ['Pfand'],
    });
  });

  it('sieht durch Bindestriche und Ziffern hindurch', () => {
    // `normalizeKeyword` macht daraus „bit satz klein" — das Schlagwort
    // „bit satz" trifft damit, obwohl die Zeile anders geschrieben ist.
    expect(suggestFromProfile('Bit-Satz 5tlg klein', profil.products)?.tags).toEqual(['Werkzeug']);
  });

  it('lässt das längste Schlagwort gewinnen', () => {
    // „schokolinsen" ist genauer als „schoko" — beide stehen in der Tabelle.
    const products = profil.products.filter((rule) => rule.keyword.startsWith('schoko'));
    expect(products.length).toBeGreaterThan(1);
    expect(suggestFromProfile('Schokolinsen bunt', products)?.tags).toEqual(['Süßes']);
  });

  it('schlägt nichts vor, wenn nichts passt', () => {
    expect(suggestFromProfile('Wischmop', profil.products)).toBeNull();
    expect(suggestFromProfile('', profil.products)).toBeNull();
    expect(suggestFromProfile('Brot', [])).toBeNull();
  });
});

describe('resolveCategoryPot', () => {
  const meta = {
    householdId: 'h1',
    createdAt: '2026-09-19T10:00:00.000Z',
    updatedAt: '2026-09-19T10:00:00.000Z',
    revision: 1,
    deletedAt: null,
  };
  function pot(id: string, name: string, archived = false): Pot {
    return {
      ...meta,
      id,
      name,
      icon: '🛒',
      color: 'emerald',
      kind: 'budget',
      limitCents: null,
      carryOver: false,
      sortIndex: 0,
      archivedAt: archived ? '2026-09-01T00:00:00.000Z' : null,
      goalCents: null,
      targetDate: null,
      lockedAt: null,
    };
  }

  it('findet den Topf über den Namen der Kategorie', () => {
    const pots = [pot('p1', 'Lebensmittel'), pot('p2', 'Sonstiges')];
    expect(resolveCategoryPot('lebensmittel', pots)).toBe('p1');
    expect(resolveCategoryPot('sonstiges', pots)).toBe('p2');
  });

  it('ist bei Groß- und Kleinschreibung und Leerzeichen nachsichtig', () => {
    expect(resolveCategoryPot('lebensmittel', [pot('p1', '  lebensmittel ')])).toBe('p1');
  });

  it('nimmt keinen archivierten Topf', () => {
    expect(resolveCategoryPot('lebensmittel', [pot('p1', 'Lebensmittel', true)])).toBeNull();
  });

  /**
   * Der ehrliche Preis der Namensauflösung: Wer umbenennt, bekommt keine
   * Vorschläge mehr. Das ist gewollt — die Alternative wäre, auf einen Topf
   * zu buchen, den der Nutzer nicht gemeint hat.
   */
  it('schlägt nichts vor, wenn es den Topf nicht gibt', () => {
    expect(resolveCategoryPot('lebensmittel', [pot('p1', 'Essen')])).toBeNull();
    expect(resolveCategoryPot('sport', [])).toBeNull();
  });

  it('kennt für jede Kategorie einen Namen', () => {
    for (const rule of CHAIN_PROFILES.flatMap((profile) => profile.products)) {
      expect(POT_CATEGORY_NAMES[rule.kategorie]).toBeTruthy();
    }
  });
});
