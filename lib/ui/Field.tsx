'use client';

import { useId, type ReactNode } from 'react';

/** Label + Feld + optionaler Hinweis. Hält Formulare ohne Bibliothek einheitlich. */
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: (props: { id: string; 'aria-describedby'?: string }) => ReactNode;
}) {
  const id = useId();
  const hintId = hint || error ? `${id}-hint` : undefined;

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink-muted">
        {label}
      </label>
      {children(hintId ? { id, 'aria-describedby': hintId } : { id })}
      {(hint || error) && (
        <p id={hintId} className={`mt-1.5 text-sm ${error ? 'text-negative' : 'text-ink-muted'}`}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

export const inputClass =
  'h-12 w-full rounded-xl border border-line bg-surface px-4 text-base outline-none focus:border-accent';

export const selectClass = `${inputClass} appearance-none pr-10 bg-[url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12"><path fill="%23888" d="M2 4.5 6 8.5l4-4z"/></svg>')] bg-[length:12px] bg-[right_1rem_center] bg-no-repeat`;

export const textareaClass =
  'min-h-24 w-full rounded-xl border border-line bg-surface px-4 py-3 text-base outline-none focus:border-accent';
