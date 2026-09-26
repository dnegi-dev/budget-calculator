/**
 * Das Symbol eines Topfes auf seiner eingefärbten Kachel.
 *
 * Stand vorher sechsmal ausgeschrieben (Topf-Zeile, Detailseite, Buchungsliste,
 * Einkauf, Erfassen, Wiederkehrend) — mit eigener Mischung, eigenem
 * Ersatzzeichen und einmal ganz ohne Farbe. Größe und Schrift bleiben beim
 * Aufrufer (`className`), weil sie je Ort verschieden sein sollen; Farbe,
 * Ersatz und `aria-hidden` sind überall dieselben.
 */

import type { Pot } from '../../lib/domain/types';
import { potColorVar } from '../../lib/ui/colors';

export function PotIcon({
  pot,
  fallback = '–',
  className,
}: {
  pot: Pick<Pot, 'icon' | 'color'> | null | undefined;
  /** Zeichen für „kein Topf" — etwa ↓ für eine Einnahme auf den Haushalt. */
  fallback?: string;
  /** Größe, Ecken, Schriftgröße. */
  className: string;
}) {
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center ${className}`}
      style={{
        background: pot
          ? `color-mix(in oklch, ${potColorVar(pot.color)} 18%, transparent)`
          : 'var(--bg-subtle)',
      }}
    >
      {pot?.icon ?? fallback}
    </span>
  );
}
