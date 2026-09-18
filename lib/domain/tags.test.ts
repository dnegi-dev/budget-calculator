import { describe, expect, it } from 'vitest';
import {
  TAG_LIMITS,
  addTag,
  collectTags,
  dedupeTags,
  hasTag,
  normalizeTag,
  parseTags,
  removeTag,
  summarizeTags,
  tagKey,
  type TaggedEntry,
} from './tags';

function entry(kind: TaggedEntry['kind'], euros: number, tags?: string[] | null): TaggedEntry {
  return { kind, amountCents: Math.round(euros * 100), tags };
}

describe('normalizeTag', () => {
  it('nimmt Rand, doppelte Leerzeichen und ein führendes Raute-Zeichen weg', () => {
    expect(normalizeTag('  #Urlaub   Norwegen ')).toBe('Urlaub Norwegen');
    expect(normalizeTag('##auto')).toBe('auto');
  });

  it('macht aus leerer Eingabe keinen Tag', () => {
    expect(normalizeTag('   ')).toBeNull();
    expect(normalizeTag('#')).toBeNull();
    expect(normalizeTag(',')).toBeNull();
  });

  it('kürzt auf die Länge und lässt keinen Rand stehen', () => {
    const lang = 'a'.repeat(TAG_LIMITS.length + 10);
    expect(normalizeTag(lang)).toHaveLength(TAG_LIMITS.length);
    // Fiele der Schnitt auf ein Leerzeichen, stünde es am Ende.
    const mitLeerzeichen = `${'a'.repeat(TAG_LIMITS.length - 1)} b`;
    expect(normalizeTag(mitLeerzeichen)).toBe('a'.repeat(TAG_LIMITS.length - 1));
  });
});

describe('tagKey', () => {
  it('macht Schreibweisen vergleichbar', () => {
    expect(tagKey('Urlaub')).toBe(tagKey('urlaub'));
    expect(tagKey(' AUTO ')).toBe('auto');
  });
});

describe('parseTags', () => {
  it('zerlegt an Komma, Semikolon und Zeilenumbruch', () => {
    expect(parseTags('urlaub, auto;bahn\nbus')).toEqual(['urlaub', 'auto', 'bahn', 'bus']);
  });

  it('wirft Dubletten heraus und behält die erste Schreibweise', () => {
    expect(parseTags('Urlaub, urlaub, URLAUB')).toEqual(['Urlaub']);
  });

  it('hält die Zahl je Buchung ein', () => {
    const viele = Array.from({ length: TAG_LIMITS.perEntry + 5 }, (_, i) => `tag${i}`).join(',');
    expect(parseTags(viele)).toHaveLength(TAG_LIMITS.perEntry);
  });
});

describe('addTag / removeTag / hasTag', () => {
  it('hängt an, ohne zu doppeln', () => {
    expect(addTag(['urlaub'], 'Auto')).toEqual(['urlaub', 'Auto']);
    expect(addTag(['urlaub'], 'URLAUB')).toEqual(['urlaub']);
  });

  it('nimmt unabhängig von der Schreibweise heraus', () => {
    expect(removeTag(['Urlaub', 'auto'], 'urlaub')).toEqual(['auto']);
  });

  it('findet unabhängig von der Schreibweise', () => {
    expect(hasTag(['Urlaub'], 'urlaub')).toBe(true);
    expect(hasTag(null, 'urlaub')).toBe(false);
    expect(hasTag(undefined, 'urlaub')).toBe(false);
  });
});

describe('dedupeTags', () => {
  it('räumt eine gespeicherte Liste auf, ohne die Reihenfolge zu drehen', () => {
    expect(dedupeTags([' auto ', 'AUTO', '', '#bahn'])).toEqual(['auto', 'bahn']);
  });
});

describe('summarizeTags', () => {
  const entries: TaggedEntry[] = [
    entry('expense', 100, ['Urlaub', 'Auto']),
    entry('expense', 50, ['urlaub']),
    entry('expense', 20, ['Auto']),
    entry('expense', 7, []),
    entry('expense', 3, null),
    entry('income', 500, ['Urlaub']),
  ];

  it('summiert je Tag und zeigt die häufigste Schreibweise', () => {
    const { tags } = summarizeTags(entries);

    expect(tags.map((t) => [t.tag, t.expenseCents, t.incomeCents, t.count])).toEqual([
      // 100 + 50 Ausgaben, dazu 500 Einnahme; „Urlaub" zweimal, „urlaub" einmal.
      ['Urlaub', 15000, 50000, 3],
      ['Auto', 12000, 0, 2],
    ]);
  });

  it('hält die Ausgaben ohne Tag daneben — sonst ist die Liste nicht zu lesen', () => {
    const { taggedExpenseCents, untaggedExpenseCents } = summarizeTags(entries);

    expect(taggedExpenseCents).toBe(17000);
    expect(untaggedExpenseCents).toBe(1000);
  });

  it('zählt eine Buchung mit zwei Tags in beiden — die Summen gehen bewusst über die Gesamtsumme', () => {
    const { tags, taggedExpenseCents } = summarizeTags([entry('expense', 10, ['a', 'b'])]);

    expect(tags.map((t) => t.expenseCents)).toEqual([1000, 1000]);
    expect(taggedExpenseCents).toBe(1000);
  });

  it('kommt mit leerer Eingabe klar', () => {
    expect(summarizeTags([])).toEqual({
      tags: [],
      taggedExpenseCents: 0,
      untaggedExpenseCents: 0,
    });
  });
});

describe('collectTags', () => {
  it('sortiert nach Häufigkeit, nicht nach Betrag', () => {
    const usage = collectTags([
      entry('expense', 1000, ['teuer']),
      entry('expense', 1, ['oft']),
      entry('expense', 1, ['oft']),
    ]);

    expect(usage).toEqual([
      { tag: 'oft', count: 2 },
      { tag: 'teuer', count: 1 },
    ]);
  });
});
