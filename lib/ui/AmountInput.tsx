'use client';

/**
 * Betragseingabe.
 *
 * Auf dem Telefon soll die Zifferntastatur erscheinen (`inputMode="decimal"`),
 * auf dem Desktop soll man einfach tippen können. Deshalb ein normales
 * Textfeld mit eigener Parserlogik statt `type="number"`: letzteres liefert je
 * nach Gebietseinstellung unterschiedliche Werte und verschluckt das Komma.
 */

import { useId } from 'react';
import { parseAmountToCents } from '../domain/money';

export interface AmountInputProps {
  value: string;
  onChange: (raw: string) => void;
  label?: string;
  currencySymbol?: string;
  autoFocus?: boolean;
  large?: boolean;
  placeholder?: string;
}

export function AmountInput({
  value,
  onChange,
  label = 'Betrag',
  currencySymbol = '€',
  autoFocus = false,
  large = false,
  placeholder = '0,00',
}: AmountInputProps) {
  const id = useId();
  const cents = parseAmountToCents(value);
  const invalid = value.trim() !== '' && cents === null;

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink-muted">
        {label}
      </label>
      <div
        className={[
          'flex items-center gap-2 rounded-xl border bg-surface px-4',
          large ? 'h-20' : 'h-12',
          invalid ? 'border-negative' : 'border-line focus-within:border-accent',
        ].join(' ')}
      >
        <input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          inputMode="decimal"
          autoComplete="off"
          // Im Erfassungs-Sheet ist der Betrag das erste und einzige Feld.
          autoFocus={autoFocus}
          placeholder={placeholder}
          aria-invalid={invalid}
          aria-describedby={invalid ? `${id}-error` : undefined}
          className={[
            // Den Fokus zeigt die Hülle (focus-within:border-accent). Ohne
            // focus-visible:outline-none läge zusätzlich der globale Fokusring
            // im Feld — zwei Rahmen übereinander.
            'tabular min-w-0 flex-1 bg-transparent outline-none focus-visible:outline-none',
            large ? 'text-4xl font-semibold' : 'text-lg',
          ].join(' ')}
        />
        <span aria-hidden className={large ? 'text-2xl text-ink-muted' : 'text-ink-muted'}>
          {currencySymbol}
        </span>
      </div>
      {invalid && (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-negative">
          Kein gültiger Betrag. Beispiel: 12,50
        </p>
      )}
    </div>
  );
}
