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
  icon: string;
  title: string;
  hint: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <span aria-hidden className="text-3xl opacity-70">
        {icon}
      </span>
      <p className="font-medium">{title}</p>
      <p className="max-w-xs text-sm text-ink-muted">{hint}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
