/**
 * Kontrast rechnen, damit „auf Lesbarkeit geprüft“ keine Behauptung bleibt.
 *
 * Die Farben in `app/themes.css` stehen als `oklch()` — dort gewählt, weil
 * sich Helligkeit und Buntheit getrennt verschieben lassen, ohne dass ein Ton
 * kippt. Prüfen lässt sich damit aber nichts: Das Kontrastverhältnis nach
 * WCAG 2 rechnet auf linearem sRGB. Also der Weg oklch → oklab → linear sRGB
 * → relative Leuchtdichte, alles hier als reine Funktionen.
 *
 * Die Matrizen sind die von Björn Ottosson veröffentlichten
 * (https://bottosson.github.io/posts/oklab/). Das ist kein Näherungswert:
 * Browser rechnen `oklch()` genauso.
 *
 * Wofür das gut ist, steht in `lib/ui/themes.test.ts` — dort wird jede
 * Kombination aus Theme, Modus, Akzent und AMOLED-Schalter durchgerechnet.
 * Ein nachjustierter Farbwert, der eine Schwelle reißt, lässt den Test
 * fehlschlagen, statt still unlesbar zu sein.
 *
 * Bewusst **kein** APCA: Es ist das bessere Modell, aber WCAG 2 ist das, worauf
 * sich Prüfwerkzeuge und die Barrierefreiheitsverordnung beziehen.
 */

export interface Oklch {
  /** 0–1 (nicht 0–100 — `parseOklch` rechnet Prozent um). */
  l: number;
  c: number;
  /** Grad. */
  h: number;
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/**
 * `oklch(52% 0.13 250)` → Zahlen.
 *
 * Nimmt Prozent oder Dezimalzahl für die Helligkeit und erlaubt fehlenden
 * Farbton (`oklch(100% 0 0)` ist grau, da ist der Winkel bedeutungslos).
 * Wirft bei allem anderen: Ein stillschweigender Rückfall auf Schwarz würde
 * im Test als bester Kontrast durchgehen — also genau falsch herum.
 */
export function parseOklch(value: string): Oklch {
  const match = /^oklch\(\s*([0-9.]+)(%?)\s+([0-9.]+)\s+([0-9.]+)(?:deg)?\s*\)$/.exec(value.trim());
  if (!match) throw new Error(`Kein oklch()-Wert: ${value}`);

  const [, lightness, percent, chroma, hue] = match;
  const l = Number(lightness) / (percent === '%' ? 100 : 1);
  return { l, c: Number(chroma), h: Number(hue) };
}

/**
 * oklch → lineares sRGB, auf den darstellbaren Bereich beschnitten.
 *
 * Das Beschneiden ist die Stelle, an der diese Rechnung von der des Browsers
 * abweichen kann: Liegt eine Farbe außerhalb des sRGB-Raums, bildet ein
 * Browser sie mit einem eigenen Verfahren ab. Deshalb meldet
 * `isOutOfGamut` das getrennt — eine Palette soll keine Farbe enthalten, bei
 * der sich beide Rechnungen streiten.
 */
export function oklchToLinearRgb(color: Oklch): Rgb {
  const hueRad = (color.h * Math.PI) / 180;
  const a = color.c * Math.cos(hueRad);
  const b = color.c * Math.sin(hueRad);

  const lCone = (color.l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mCone = (color.l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const sCone = (color.l - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return {
    r: 4.0767416621 * lCone - 3.3077115913 * mCone + 0.2309699292 * sCone,
    g: -1.2684380046 * lCone + 2.6097574011 * mCone - 0.3413193965 * sCone,
    b: -0.0041960863 * lCone - 0.7034186147 * mCone + 1.707614701 * sCone,
  };
}

/** Ob die Farbe außerhalb von sRGB liegt und der Browser sie abbilden muss. */
export function isOutOfGamut(value: string, tolerance = 0.002): boolean {
  const { r, g, b } = oklchToLinearRgb(parseOklch(value));
  return [r, g, b].some((channel) => channel < -tolerance || channel > 1 + tolerance);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Relative Leuchtdichte nach WCAG 2 — lineares sRGB, also ohne Gamma-Schritt. */
export function relativeLuminance(value: string): number {
  const { r, g, b } = oklchToLinearRgb(parseOklch(value));
  return 0.2126 * clamp01(r) + 0.7152 * clamp01(g) + 0.0722 * clamp01(b);
}

/** Kontrastverhältnis zweier `oklch()`-Werte, 1 bis 21. */
export function contrastRatio(a: string, b: string): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}
