'use client';

/**
 * Ein Symbol-Link in der Leiste über einer Liste.
 *
 * Der Name steht im `aria-label` und im `title`, nicht daneben: In der Leiste
 * ist bei 320 px Platz für die Überschrift und drei Symbole, nicht für drei
 * Wörter. Deshalb ist der Name Pflicht und kein Zusatz — ein Symbol ohne
 * Namen ist für Screenreader und für Ratende gleich nutzlos.
 */

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Icon } from '../../lib/ui/Icon';

export function ToolbarLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="grid h-9 w-9 place-items-center rounded-lg text-ink-muted hover:bg-subtle hover:text-ink"
    >
      <Icon icon={icon} size={20} />
    </Link>
  );
}
