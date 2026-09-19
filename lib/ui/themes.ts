/**
 * Die Liste der Themes und Akzente für die Oberfläche.
 *
 * Die Farben selbst stehen in `app/themes.css` — dort, weil sie CSS-Variablen
 * sind und vor dem ersten Rendern gelten müssen. Hier stehen nur Namen,
 * Beschriftungen und zwei Dinge, die CSS nicht liefern kann:
 *
 * 1. **Welche Akzente ein Theme anbietet.** Der Vorrat in `themes.css` gilt je
 *    Modus, nicht je Theme — jeder Akzent ist gegen jede Fläche geprüft. Was
 *    ein Theme *anbietet*, ist eine Frage des Geschmacks: Neon gehört zu
 *    Cyberpunk und Terminal, nicht zu Pastell.
 * 2. **Die Farbe der Statusleiste als Hex.** `<meta name="theme-color">`
 *    versteht `oklch()` nicht überall, deshalb steht der Wert doppelt — hier
 *    als Hex, in `themes.css` als Token. Die Hex-Werte sind aus denselben
 *    `oklch()`-Angaben gerechnet (`lib/ui/contrast.ts` macht dieselbe
 *    Umrechnung), und `lib/ui/themes.test.ts` prüft, dass sie zum `--bg` des
 *    Themes passen. Eine Palette zu ändern und den Hex zu vergessen, fällt
 *    damit auf.
 */

export const THEME_NAMES = ['classic', 'pastel', 'nerd', 'contrast', 'cyberpunk'] as const;
export type ThemeName = (typeof THEME_NAMES)[number];

export const ACCENT_NAMES = [
  'indigo',
  'sky',
  'teal',
  'emerald',
  'amber',
  'rose',
  'violet',
  'slate',
  'magenta',
  'cyan',
  'lime',
] as const;
export type AccentName = (typeof ACCENT_NAMES)[number];

export interface ThemeInfo {
  name: ThemeName;
  label: string;
  /** Ein Satz, was es ist — steht unter der Kachel. */
  hint: string;
  /** Die Akzente, die dieses Theme zur Wahl stellt. Der erste ist der Rückfall. */
  accents: readonly AccentName[];
  /** Für `<meta name="theme-color">`, passend zu `--bg`. */
  barColor: Record<'light' | 'dark', string>;
}

export const THEMES: readonly ThemeInfo[] = [
  {
    name: 'classic',
    label: 'Klassisch',
    hint: 'Gedeckte Flächen, blauer Akzent. Die Voreinstellung.',
    accents: ['indigo', 'sky', 'teal', 'emerald', 'amber', 'rose', 'violet', 'slate'],
    barColor: { light: '#f9fcfe', dark: '#0c1015' },
  },
  {
    name: 'pastel',
    label: 'Pastell',
    hint: 'Warmes Papier, weiche Töne, wenig Kontrastkanten.',
    accents: ['rose', 'violet', 'sky', 'teal', 'amber', 'emerald'],
    barColor: { light: '#fcf8f0', dark: '#191924' },
  },
  {
    name: 'nerd',
    label: 'Terminal',
    hint: 'Grün auf Schwarz, Zahlen und Text in Festbreite.',
    accents: ['lime', 'emerald', 'cyan', 'amber', 'slate'],
    barColor: { light: '#f4f6f0', dark: '#050b06' },
  },
  {
    name: 'contrast',
    label: 'Hoher Kontrast',
    hint: 'Reines Schwarz und Weiß, sichtbare Ränder, kräftige Topffarben.',
    accents: ['indigo', 'violet', 'rose', 'emerald', 'slate'],
    barColor: { light: '#ffffff', dark: '#000000' },
  },
  {
    name: 'cyberpunk',
    label: 'Cyberpunk',
    hint: 'Neon auf Tiefviolett. Laut, und das ist der Zweck.',
    accents: ['magenta', 'cyan', 'lime', 'violet', 'sky'],
    barColor: { light: '#f6f3fc', dark: '#050410' },
  },
];

export const ACCENT_LABELS: Record<AccentName, string> = {
  indigo: 'Indigo',
  sky: 'Himmelblau',
  teal: 'Petrol',
  emerald: 'Smaragd',
  amber: 'Bernstein',
  rose: 'Rosenrot',
  violet: 'Violett',
  slate: 'Grau',
  magenta: 'Magenta',
  cyan: 'Cyan',
  lime: 'Limette',
};

/** Echtes Schwarz — dieselbe Farbe für jedes Theme, das ist der Sinn. */
export const AMOLED_BAR_COLOR = '#000000';

export const DEFAULT_THEME: ThemeName = 'classic';
export const DEFAULT_ACCENT: AccentName = 'indigo';

export function themeInfo(name: ThemeName): ThemeInfo {
  return THEMES.find((theme) => theme.name === name) ?? THEMES[0]!;
}

/**
 * Der Akzent, den ein Theme tatsächlich zeigt.
 *
 * Wer von Cyberpunk (Magenta) auf Pastell wechselt, hat einen Akzent
 * gespeichert, den Pastell nicht anbietet. Angezeigt wird dann der erste des
 * Themes. Das CSS könnte Magenta durchaus auflösen — jeder Akzent ist gegen
 * jede Fläche geprüft —, aber eine Auswahl, in der nichts markiert ist, wäre
 * ein Rätsel.
 */
export function resolveAccent(theme: ThemeName, accent: AccentName): AccentName {
  const info = themeInfo(theme);
  return info.accents.includes(accent) ? accent : info.accents[0]!;
}
