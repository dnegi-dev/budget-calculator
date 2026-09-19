'use client';

/**
 * Eine Zeile, die auf eine Unterseite führt.
 *
 * Das Muster stand dreimal handgeschrieben im Projekt (Topfzeile,
 * Regelzeile, Zuordnungszeile) und wird von der Einstellungsübersicht ein
 * viertes Mal gebraucht — also einmal hier.
 *
 * `tone="negative"` ist für den Weg in die Gefahrenzone: Der einzige Eintrag,
 * der vorher sagen soll, was hinter ihm liegt.
 */

import Link from 'next/link';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import { Icon } from './Icon';

export function NavRow({
  href,
  icon,
  title,
  hint,
  tone = 'normal',
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  hint?: string;
  tone?: 'normal' | 'negative';
}) {
  const negativ = tone === 'negative';
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-4 py-3 text-left hover:bg-subtle focus-visible:bg-subtle"
    >
      <span
        aria-hidden
        className={[
          'grid h-9 w-9 shrink-0 place-items-center rounded-xl',
          negativ ? 'bg-[var(--negative)]/12 text-negative' : 'bg-subtle text-ink-muted',
        ].join(' ')}
      >
        <Icon icon={icon} size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block font-medium ${negativ ? 'text-negative' : ''}`}>{title}</span>
        {hint && <span className="block text-sm text-ink-muted">{hint}</span>}
      </span>
      <span aria-hidden className="shrink-0 text-ink-muted">
        <Icon icon={ChevronRight} size={18} />
      </span>
    </Link>
  );
}
