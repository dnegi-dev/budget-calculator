import { describe, expect, it } from 'vitest';
import { formatCentsPlain, parseAmountToCents, signedCents, sumCents } from './money';

describe('parseAmountToCents', () => {
  it('liest deutsche Schreibweise', () => {
    expect(parseAmountToCents('12,50')).toBe(1250);
    expect(parseAmountToCents('0,05')).toBe(5);
    expect(parseAmountToCents('1.234,56')).toBe(123456);
  });

  it('liest englische Schreibweise', () => {
    expect(parseAmountToCents('12.50')).toBe(1250);
    expect(parseAmountToCents('1,234.56')).toBe(123456);
  });

  it('ergänzt fehlende Nachkommastellen', () => {
    expect(parseAmountToCents('12')).toBe(1200);
    expect(parseAmountToCents('12,5')).toBe(1250);
  });

  it('liest drei Nachziffern als Tausendertrenner', () => {
    expect(parseAmountToCents('1.000')).toBe(100_000);
    expect(parseAmountToCents('1,000')).toBe(100_000);
  });

  it('ignoriert Währungssymbole und Leerzeichen', () => {
    expect(parseAmountToCents(' 12,50 € ')).toBe(1250);
    expect(parseAmountToCents('€12.50')).toBe(1250);
  });

  it('erkennt Vorzeichen', () => {
    expect(parseAmountToCents('-12,50')).toBe(-1250);
    expect(parseAmountToCents('+12,50')).toBe(1250);
  });

  it('gibt null bei Unsinn', () => {
    expect(parseAmountToCents('')).toBeNull();
    expect(parseAmountToCents('abc')).toBeNull();
    expect(parseAmountToCents('-')).toBeNull();
    expect(parseAmountToCents('12,5x')).toBeNull();
  });

  it('schneidet überzählige Nachkommastellen ab statt zu runden', () => {
    // '12,509' hat drei Nachziffern -> als Tausendertrenner gelesen.
    expect(parseAmountToCents('12,509')).toBe(1_250_900);
  });
});

describe('formatCentsPlain', () => {
  it('hat immer zwei Nachkommastellen', () => {
    expect(formatCentsPlain(1250)).toBe('12,50');
    expect(formatCentsPlain(5)).toBe('0,05');
    expect(formatCentsPlain(1200)).toBe('12,00');
    expect(formatCentsPlain(-1250)).toBe('-12,50');
  });

  it('kann den Punkt als Dezimaltrenner', () => {
    expect(formatCentsPlain(1250, '.')).toBe('12.50');
  });
});

describe('Summen', () => {
  it('summiert ohne Rundungsfehler', () => {
    // In Euro als Float wäre 0.1 + 0.2 !== 0.3.
    expect(sumCents([10, 20])).toBe(30);
    expect(sumCents(Array.from({ length: 100 }, () => 1))).toBe(100);
  });

  it('setzt Vorzeichen nach Buchungsart', () => {
    expect(signedCents('expense', 1250)).toBe(-1250);
    expect(signedCents('income', 1250)).toBe(1250);
  });
});
