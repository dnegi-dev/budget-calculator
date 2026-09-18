'use client';

/** Zwei bis drei Optionen, immer alle sichtbar. Ersetzt ein Dropdown, wo es nur wenige Werte gibt. */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-xl bg-subtle p-1">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={[
              'h-10 flex-1 rounded-lg text-sm font-medium transition-colors',
              // Ohne Schatten trägt die Fläche allein — dafür etwas kräftiger.
              active ? 'bg-surface text-ink' : 'text-ink-muted',
            ].join(' ')}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
