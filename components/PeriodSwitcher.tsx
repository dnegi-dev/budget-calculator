'use client';

/**
 * Vor- und zurückblättern zwischen Perioden.
 *
 * Kein Kalender-Popup: In der Praxis schaut man auf die aktuelle und die
 * vorige Periode. Wer weiter zurück will, tippt mehrmals — das ist billiger als
 * ein Datumsdialog, den niemand versteht.
 */

import { formatPeriodLabel, periodFromKey, shiftPeriodKey } from '../lib/domain/period';
import { useFormat } from '../lib/ui/useFormat';

export function PeriodSwitcher({
  periodKey,
  onChange,
  currentKey,
}: {
  periodKey: string;
  onChange: (key: string) => void;
  /** Die Periode, in der „heute“ liegt — für den Sprung zurück. */
  currentKey: string;
}) {
  const format = useFormat();
  const period = periodFromKey(periodKey, format.periodStartDay);
  const label = formatPeriodLabel(period, format.locale, format.periodStartDay);

  return (
    <div className="flex items-center justify-between gap-2">
      <button
        type="button"
        onClick={() => onChange(shiftPeriodKey(periodKey, -1))}
        aria-label="Vorige Periode"
        className="grid h-9 w-9 place-items-center rounded-lg text-ink-muted hover:bg-subtle"
      >
        ‹
      </button>

      <div className="min-w-0 text-center">
        <p className="truncate font-medium">{label}</p>
        {periodKey !== currentKey && (
          <button
            type="button"
            onClick={() => onChange(currentKey)}
            className="text-xs text-accent underline"
          >
            zurück zu heute
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => onChange(shiftPeriodKey(periodKey, 1))}
        aria-label="Nächste Periode"
        className="grid h-9 w-9 place-items-center rounded-lg text-ink-muted hover:bg-subtle"
      >
        ›
      </button>
    </div>
  );
}
