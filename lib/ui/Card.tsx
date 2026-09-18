import type { ReactNode } from 'react';

/**
 * Fläche für einen Inhaltsblock.
 *
 * Mobil ohne Rahmen: Dort steht eine Karte pro Bildschirmbreite, und ein
 * Kasten um etwas, das ohnehin allein steht, ist nur eine Linie mehr. Ab `md`
 * stehen mehrere nebeneinander — da trägt der Rahmen.
 */
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
    <Element className={`rounded-card bg-surface md:border md:border-line ${className}`}>
      {children}
    </Element>
  );
}

export function CardHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
      {/* Kein Versalsatz, keine Trennlinie: Der Abstand darunter reicht. */}
      <h2 className="text-sm font-medium text-ink-muted">{title}</h2>
      {action}
    </div>
  );
}
