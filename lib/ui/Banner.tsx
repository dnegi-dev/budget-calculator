import type { ReactNode } from 'react';

type Tone = 'info' | 'warning' | 'negative';

const TONES: Record<Tone, string> = {
  info: 'border-line bg-subtle text-ink',
  warning: 'border-[var(--warning)] bg-subtle text-ink',
  negative: 'border-[var(--negative)] bg-subtle text-ink',
};

/** Kurzer Hinweis im Inhaltsfluss — für Dinge, die man wissen, aber nicht wegklicken muss. */
export function Banner({
  tone = 'info',
  icon,
  children,
}: {
  tone?: Tone;
  icon?: string;
  children: ReactNode;
}) {
  return (
    <div className={`flex gap-3 rounded-card border px-4 py-3 text-sm ${TONES[tone]}`}>
      {icon && (
        <span aria-hidden className="shrink-0">
          {icon}
        </span>
      )}
      <div className="min-w-0">{children}</div>
    </div>
  );
}
