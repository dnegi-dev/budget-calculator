import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrastRatio, isOutOfGamut, relativeLuminance } from './contrast';
import {
  ACCENT_LABELS,
  ACCENT_NAMES,
  AMOLED_BAR_COLOR,
  DEFAULT_ACCENT,
  DEFAULT_THEME,
  THEMES,
  THEME_NAMES,
  resolveAccent,
  type AccentName,
  type ThemeName,
} from './themes';

/**
 * Der Test, der die Zusage „auf Lesbarkeit geprüft“ trägt.
 *
 * Er liest `app/themes.css` als Text und baut die Kaskade nach: Welche Blöcke
 * gelten für eine Kombination aus Modus, Theme, Akzent und AMOLED-Schalter, in
 * welcher Reihenfolge, und was steht am Ende in den Tokens? Danach rechnet er
 * jedes Paar durch, bei dem Text auf Fläche liegt.
 *
 * Warum aus dem CSS gelesen und nicht aus einer TypeScript-Tabelle erzeugt:
 * Das CSS ist, was der Browser ausführt. Eine zweite Quelle in TypeScript wäre
 * eine zweite Wahrheit, und geprüft würde dann die falsche.
 *
 * Die Kaskade hier kennt nur, was `themes.css` benutzt: Attributselektoren,
 * keine Verschachtelung, keine Media-Queries, keine `var()`-Verweise. Genau
 * deshalb steht in der Datei nichts anderes — ein `var()` in einer Palette
 * würde diesen Test unterlaufen.
 */

const CSS = readFileSync(fileURLToPath(new URL('../../app/themes.css', import.meta.url)), 'utf8');

interface Block {
  /** Bedingungen aus dem Selektor: `mode='light'`, `amoled` ohne Wert. */
  conditions: { attribute: string; value: string | null }[];
  declarations: Record<string, string>;
  order: number;
}

function parseBlocks(css: string): Block[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const blocks: Block[] = [];
  const blockPattern = /([^{}]+)\{([^{}]*)\}/g;

  let match: RegExpExecArray | null;
  while ((match = blockPattern.exec(withoutComments)) !== null) {
    const [, selector, body] = match;
    const conditions = [...selector!.matchAll(/\[data-([a-z-]+)(?:='([^']*)')?\]/g)].map(
      (attribute) => ({ attribute: attribute[1]!, value: attribute[2] ?? null }),
    );
    expect(conditions.length, `Selektor ohne Attribute: ${selector!.trim()}`).toBeGreaterThan(0);

    const declarations: Record<string, string> = {};
    for (const line of body!.split(';')) {
      const colon = line.indexOf(':');
      if (colon === -1) continue;
      const property = line.slice(0, colon).trim();
      const value = line.slice(colon + 1).trim();
      if (property.startsWith('--')) declarations[property] = value;
    }

    blocks.push({ conditions, declarations, order: blocks.length });
  }
  return blocks;
}

const BLOCKS = parseBlocks(CSS);

interface Combination {
  mode: 'light' | 'dark';
  theme: ThemeName;
  accent: AccentName;
  amoled: boolean;
}

/** Was am Wurzelelement steht, wenn diese Kombination gewählt ist. */
function attributesOf(combination: Combination): Record<string, string | true> {
  const attributes: Record<string, string | true> = {
    mode: combination.mode,
    theme: combination.theme,
    accent: combination.accent,
  };
  if (combination.amoled && combination.mode === 'dark') attributes.amoled = true;
  return attributes;
}

/**
 * Die Kaskade: gleiche Spezifität (Anzahl Attribute) entscheidet die
 * Reihenfolge in der Datei, mehr Attribute gewinnen. Genau so, wie ein Browser
 * es für diese Selektoren tut.
 */
function resolveTokens(combination: Combination): Record<string, string> {
  const attributes = attributesOf(combination);
  const matching = BLOCKS.filter((block) =>
    block.conditions.every((condition) =>
      condition.value === null
        ? attributes[condition.attribute] === true
        : attributes[condition.attribute] === condition.value,
    ),
  ).sort((a, b) =>
    a.conditions.length === b.conditions.length
      ? a.order - b.order
      : a.conditions.length - b.conditions.length,
  );

  const tokens: Record<string, string> = {};
  for (const block of matching) Object.assign(tokens, block.declarations);
  return tokens;
}

/** Jede Kombination, die die Oberfläche anbietet. */
function allCombinations(): Combination[] {
  const combinations: Combination[] = [];
  for (const theme of THEMES) {
    for (const accent of theme.accents) {
      combinations.push({ mode: 'light', theme: theme.name, accent, amoled: false });
      combinations.push({ mode: 'dark', theme: theme.name, accent, amoled: false });
      combinations.push({ mode: 'dark', theme: theme.name, accent, amoled: true });
    }
  }
  return combinations;
}

const COMBINATIONS = allCombinations();

function nameOf(combination: Combination): string {
  return [
    combination.theme,
    combination.mode,
    combination.accent,
    combination.amoled ? 'amoled' : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

const FLAECHEN = ['--bg', '--bg-elevated', '--bg-subtle'] as const;
const PFLICHT_TOKENS = [
  '--bg',
  '--bg-elevated',
  '--bg-subtle',
  '--border',
  '--border-strong',
  '--text',
  '--text-muted',
  '--positive',
  '--negative',
  '--warning',
  '--accent',
  '--accent-text',
  '--accent-subtle',
] as const;

describe('Paletten in app/themes.css', () => {
  it('liest überhaupt Blöcke', () => {
    // Ein stiller Parser-Fehler würde jede Prüfung unten leerlaufen lassen.
    expect(BLOCKS.length).toBeGreaterThan(30);
    expect(COMBINATIONS.length).toBeGreaterThan(50);
  });

  it.each(COMBINATIONS.map((combination) => [nameOf(combination), combination] as const))(
    '%s ist vollständig',
    (_name, combination) => {
      const tokens = resolveTokens(combination);
      for (const token of PFLICHT_TOKENS) {
        expect(tokens[token], `${token} fehlt`).toBeTruthy();
      }
    },
  );

  it.each(COMBINATIONS.map((combination) => [nameOf(combination), combination] as const))(
    '%s bleibt in sRGB',
    (_name, combination) => {
      const tokens = resolveTokens(combination);
      for (const [token, value] of Object.entries(tokens)) {
        if (!value.startsWith('oklch(')) continue;
        expect(isOutOfGamut(value), `${token} liegt außerhalb von sRGB: ${value}`).toBe(false);
      }
    },
  );

  it.each(COMBINATIONS.map((combination) => [nameOf(combination), combination] as const))(
    '%s ist lesbar',
    (_name, combination) => {
      const tokens = resolveTokens(combination);
      const pruefe = (vorne: string, hinten: string, mindestens: number) => {
        const ratio = contrastRatio(tokens[vorne]!, tokens[hinten]!);
        expect(
          Number(ratio.toFixed(2)),
          `${vorne} auf ${hinten} = ${ratio.toFixed(2)}:1, gefordert ${mindestens}:1`,
        ).toBeGreaterThanOrEqual(mindestens);
      };

      for (const flaeche of FLAECHEN) {
        // Fließtext: AAA. Diese App besteht aus Listen mit kleinen Zahlen.
        pruefe('--text', flaeche, 7);
        // Zweite Zeile, Hinweise, Einheiten: AA.
        pruefe('--text-muted', flaeche, 4.5);
        // Beträge und Warnungen sind Schrift, keine Flächen.
        pruefe('--positive', flaeche, 4.5);
        pruefe('--negative', flaeche, 4.5);
        pruefe('--warning', flaeche, 4.5);
      }

      // Jeder Link ist `text-accent` — also AA, nicht die 3:1 für Flächen.
      pruefe('--accent', '--bg', 4.5);
      pruefe('--accent', '--bg-elevated', 4.5);
      // Schrift auf dem Akzent (Knöpfe, schwebender Knopf).
      pruefe('--accent-text', '--accent', 4.5);
      // Gewählte Kacheln: `bg-accent-subtle` mit gewöhnlicher Schrift darauf.
      pruefe('--text', '--accent-subtle', 4.5);
    },
  );

  it.each(COMBINATIONS.map((combination) => [nameOf(combination), combination] as const))(
    '%s hält die Topffarben unterscheidbar',
    (_name, combination) => {
      const tokens = resolveTokens(combination);
      for (const token of Object.keys(tokens).filter((key) => key.startsWith('--pot-'))) {
        // Flächen und Diagrammbalken: 3:1 nach WCAG für nicht-textliche Teile.
        const ratio = contrastRatio(tokens[token]!, tokens['--bg-elevated']!);
        expect(
          Number(ratio.toFixed(2)),
          `${token} auf --bg-elevated = ${ratio.toFixed(2)}:1`,
        ).toBeGreaterThanOrEqual(3);
      }
    },
  );
});

/** Hex → relative Leuchtdichte, für den Vergleich mit der Statusleistenfarbe. */
function hexLuminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255);
  const linear = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

describe('lib/ui/themes.ts', () => {
  it('beschreibt jedes Theme genau einmal', () => {
    expect(THEMES.map((theme) => theme.name)).toEqual([...THEME_NAMES]);
  });

  it('benennt jeden Akzent', () => {
    for (const accent of ACCENT_NAMES) expect(ACCENT_LABELS[accent]).toBeTruthy();
  });

  it('bietet nur Akzente an, die es im CSS gibt', () => {
    for (const theme of THEMES) {
      expect(theme.accents.length, `${theme.name} ohne Akzente`).toBeGreaterThan(0);
      for (const accent of theme.accents) {
        expect(ACCENT_NAMES, `${theme.name} nennt ${accent}`).toContain(accent);
      }
    }
  });

  it('hat für die Voreinstellung eine gültige Paarung', () => {
    expect(resolveAccent(DEFAULT_THEME, DEFAULT_ACCENT)).toBe(DEFAULT_ACCENT);
  });

  it('fällt auf den ersten Akzent des Themes zurück', () => {
    // Pastell bietet kein Magenta — angezeigt wird dann Rosenrot.
    expect(resolveAccent('pastel', 'magenta')).toBe('rose');
  });

  it.each(THEMES.flatMap((theme) => (['light', 'dark'] as const).map((mode) => [theme, mode])))(
    'hält die Statusleistenfarbe von %s (%s) am Hintergrund',
    (theme, mode) => {
      const tokens = resolveTokens({
        mode: mode as 'light' | 'dark',
        theme: (theme as (typeof THEMES)[number]).name,
        accent: (theme as (typeof THEMES)[number]).accents[0]!,
        amoled: false,
      });
      const hex = (theme as (typeof THEMES)[number]).barColor[mode as 'light' | 'dark'];
      // Die Statusleiste soll die Fläche fortsetzen, nicht eine Kante bilden.
      // Toleranz, weil Hex acht Bit hat und `oklch()` nicht.
      expect(Math.abs(hexLuminance(hex) - relativeLuminance(tokens['--bg']!))).toBeLessThan(0.01);
    },
  );

  it('setzt für echtes Schwarz auch die Statusleiste auf Schwarz', () => {
    expect(AMOLED_BAR_COLOR).toBe('#000000');
    for (const theme of THEMES) {
      const tokens = resolveTokens({
        mode: 'dark',
        theme: theme.name,
        accent: theme.accents[0]!,
        amoled: true,
      });
      expect(relativeLuminance(tokens['--bg']!), `${theme.name} ist nicht schwarz`).toBe(0);
    }
  });
});
