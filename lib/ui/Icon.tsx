'use client';

/**
 * Die Hülle um jedes Bediensymbol.
 *
 * Zwei Dinge macht sie, und beide wären an vierzig Aufrufstellen nicht zu
 * halten:
 *
 * 1. **Die Strichstärke kommt aus der Einstellung.** „Dünn / Normal / Fett“
 *    auf der Seite „Darstellung“ ist genau dieser Wert. Lucide nimmt
 *    `strokeWidth` als Prop, also braucht es eine Stelle, die ihn setzt.
 * 2. **`aria-hidden`.** Ein Symbol ist Dekoration; der Name steht im
 *    `aria-label` des Knopfes oder im Text daneben. Ohne das läse ein
 *    Screenreader den Lucide-Titel vor und wiederholte sich.
 *
 * Icons werden **einzeln** importiert (`import { Search } from 'lucide-react'`).
 * Der Sammelimport zieht rund 1500 Module in den Entwicklungs-Build und macht
 * jeden Start langsam.
 *
 * Topf-Symbole bleiben Emoji (`POT_ICONS` in `lib/ui/colors.ts`): Die wählt
 * der Nutzer, und ein Icon-Satz kann „🥑“ nicht abbilden.
 */

import type { LucideIcon } from 'lucide-react';
import { useIconStyle } from '../prefs/useDevicePref';
import type { IconStyle } from '../prefs/device-prefs';

const STROKE: Record<IconStyle, number> = {
  thin: 1.25,
  normal: 1.75,
  bold: 2.5,
};

export interface IconProps {
  icon: LucideIcon;
  /** Kantenlänge in Pixeln. 18 passt zu `text-sm`, 20 zu Knöpfen, 24 zur Navigation. */
  size?: number;
  className?: string;
}

export function Icon({ icon: Glyph, size = 20, className }: IconProps) {
  const style = useIconStyle();
  return (
    <Glyph
      aria-hidden
      focusable={false}
      width={size}
      height={size}
      strokeWidth={STROKE[style]}
      className={className}
    />
  );
}

/** Für die Vorschau in den Einstellungen, wo alle drei Stärken nebeneinander stehen. */
export function strokeWidthOf(style: IconStyle): number {
  return STROKE[style];
}
