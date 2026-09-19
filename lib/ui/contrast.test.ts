import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  isOutOfGamut,
  oklchToLinearRgb,
  parseOklch,
  relativeLuminance,
} from './contrast';

const WEISS = 'oklch(100% 0 0)';
const SCHWARZ = 'oklch(0% 0 0)';

describe('parseOklch', () => {
  it('rechnet Prozent auf 0–1 um', () => {
    expect(parseOklch('oklch(52% 0.13 250)')).toEqual({ l: 0.52, c: 0.13, h: 250 });
  });

  it('nimmt auch die Dezimalschreibweise', () => {
    expect(parseOklch('oklch(0.52 0.13 250)')).toEqual({ l: 0.52, c: 0.13, h: 250 });
  });

  it('wirft bei Unsinn statt still Schwarz zu liefern', () => {
    // Ein Rückfall auf Schwarz käme im Kontrasttest als bester Wert durch —
    // also genau falsch herum.
    expect(() => parseOklch('#fbfbfd')).toThrow(/Kein oklch/);
  });
});

describe('oklchToLinearRgb', () => {
  it('trifft Weiß und Schwarz', () => {
    const weiss = oklchToLinearRgb(parseOklch(WEISS));
    expect(weiss.r).toBeCloseTo(1, 2);
    expect(weiss.g).toBeCloseTo(1, 2);
    expect(weiss.b).toBeCloseTo(1, 2);

    const schwarz = oklchToLinearRgb(parseOklch(SCHWARZ));
    expect(schwarz.r).toBeCloseTo(0, 4);
  });

  it('trifft mittleres Grau', () => {
    // Bei einem Grau ohne Buntheit fallen alle drei Zapfenwerte auf L
    // zusammen, werden gewürfelt, und die Matrixzeilen summieren sich auf 1 —
    // also genau 0,5³ = 0,125 lineare Leuchtdichte. Ein Vorzeichenfehler in
    // der Matrix fiele hier auf, und die 12,5 % zeigen zugleich, dass Oklab
    // wahrnehmungsgleichabständig ist und nicht linear.
    expect(relativeLuminance('oklch(50% 0 0)')).toBeCloseTo(0.125, 5);
  });
});

describe('contrastRatio', () => {
  it('liefert 21 für Schwarz auf Weiß', () => {
    expect(contrastRatio(SCHWARZ, WEISS)).toBeCloseTo(21, 1);
  });

  it('ist richtungsunabhängig', () => {
    expect(contrastRatio(SCHWARZ, WEISS)).toBeCloseTo(contrastRatio(WEISS, SCHWARZ), 6);
  });

  it('liefert 1 für dieselbe Farbe', () => {
    expect(contrastRatio('oklch(52% 0.13 250)', 'oklch(52% 0.13 250)')).toBeCloseTo(1, 6);
  });
});

describe('isOutOfGamut', () => {
  it('erkennt eine Farbe, die sRGB nicht darstellen kann', () => {
    // Volles Neon-Grün jenseits des sRGB-Dreiecks.
    expect(isOutOfGamut('oklch(85% 0.4 140)')).toBe(true);
  });

  it('lässt darstellbare Farben durch', () => {
    expect(isOutOfGamut('oklch(52% 0.13 250)')).toBe(false);
    expect(isOutOfGamut(WEISS)).toBe(false);
  });
});
