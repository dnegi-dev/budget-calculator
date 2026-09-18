/**
 * Farbauswahl für Töpfe.
 *
 * Nur sechs Farben — mehr macht die Liste unruhig und ist auf einem
 * Telefondisplay nicht mehr unterscheidbar. Die Werte selbst stehen als
 * CSS-Variablen in globals.css.
 */

export const POT_COLORS = [
  { name: 'emerald', label: 'Grün', cssVar: '--pot-emerald' },
  { name: 'sky', label: 'Blau', cssVar: '--pot-sky' },
  { name: 'amber', label: 'Gelb', cssVar: '--pot-amber' },
  { name: 'violet', label: 'Violett', cssVar: '--pot-violet' },
  { name: 'rose', label: 'Rot', cssVar: '--pot-rose' },
  { name: 'slate', label: 'Grau', cssVar: '--pot-slate' },
] as const;

export type PotColorName = (typeof POT_COLORS)[number]['name'];

export function potColorVar(color: string): string {
  const match = POT_COLORS.find((entry) => entry.name === color);
  return `var(${match?.cssVar ?? '--pot-slate'})`;
}

/** Vorschlagsliste für Topf-Symbole. Emoji statt Icon-Bibliothek: null Bytes Abhängigkeit. */
export const POT_ICONS = [
  '🧺', '🛒', '🏠', '🚗', '🏋️', '🍽️', '🎬', '💡', '👕', '💊',
  '🎁', '✈️', '📚', '🐕', '☕', '📱', '🧾', '💰',
] as const;
