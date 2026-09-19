'use client';

/**
 * Wie sich das Betragsfeld verhält — eine Gerätevorliebe, kein Haushaltswert.
 *
 * Steht bei „Erfassen“ und nicht bei „Darstellung“: Es geht ums Tippen, nicht
 * ums Aussehen. Dass es trotzdem im `localStorage` liegt, hat denselben Grund
 * wie beim Theme (`lib/prefs/device-prefs.ts`): Wer vom Telefon eine Sicherung
 * einspielt, soll am Desktop nicht plötzlich anders tippen.
 */

import { setAmountMode, type AmountMode } from '../../lib/prefs/device-prefs';
import { useAmountMode } from '../../lib/prefs/useDevicePref';
import { Card, CardHeader } from '../../lib/ui/Card';
import { SegmentedControl } from '../../lib/ui/SegmentedControl';

const AMOUNT_OPTIONS: readonly { value: AmountMode; label: string }[] = [
  { value: 'cents', label: 'Komma automatisch' },
  { value: 'free', label: 'Freitext' },
];

export function AmountModeSection() {
  const amountMode = useAmountMode();

  return (
    <Card>
      <CardHeader title="Dieses Gerät" />
      <div className="flex flex-col gap-4 px-4 py-4">
        <div>
          <p className="mb-1.5 text-sm font-medium text-ink-muted">Betrag eingeben</p>
          <SegmentedControl
            label="Betrag eingeben"
            value={amountMode}
            onChange={setAmountMode}
            options={AMOUNT_OPTIONS}
          />
          <p className="mt-1.5 text-xs text-ink-muted">
            {amountMode === 'cents'
              ? 'Nur Ziffern tippen — die letzten zwei sind Cent. Aus 1250 wird 12,50, aus 12 wird 0,12.'
              : 'Komma oder Punkt selbst tippen. 12,50 und 12.50 werden beide erkannt.'}
          </p>
        </div>

        <p className="text-xs text-ink-muted">
          Gilt nur auf diesem Gerät und steht nicht in der Sicherung.
        </p>
      </div>
    </Card>
  );
}
