import type { ReactNode } from 'react';

export function Card({
  children,
  className = '',
  as: Element = 'section',
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'li' | 'article';
}) {
  return (
    <Element
      className={`rounded-card border border-line bg-surface shadow-[var(--shadow-card)] ${className}`}
    >
      {children}
    </Element>
  );
}

export function CardHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
      <h2 className="text-sm font-semibold tracking-wide text-ink-muted uppercase">{title}</h2>
      {action}
    </div>
  );
}
