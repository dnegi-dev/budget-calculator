import type { ReactNode } from 'react';

/**
 * Leerer Zustand mit genau einer Handlung.
 *
 * Eine leere Liste ohne Hinweis ist die häufigste Stelle, an der jemand eine
 * App wieder zumacht.
 */
export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      {/* Groß und blass: Der Blick soll auf dem Text landen, nicht am Symbol. */}
      <span aria-hidden className="text-3xl text-ink-muted opacity-70">
        {icon}
      </span>
      <p className="font-medium">{title}</p>
      <p className="max-w-xs text-sm text-ink-muted">{hint}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
