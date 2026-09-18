'use client';

/**
 * Einstellungen dieses Geräts: Darstellung und Betragseingabe.
 *
 * Ohne Rechteprüfung, anders als die Haushalt-Einstellungen daneben: Wie die
 * App auf diesem Gerät aussieht und wie sich das Betragsfeld verhält, ist
 * keine Haushaltsangelegenheit. Auch wer nur lesen darf, darf dunkel lesen.
 *
 * Warum die Werte im `localStorage` liegen und nicht am Haushalt, steht in
 * `lib/prefs/device-prefs.ts`.
 */

import {
  setAmountMode,
  setTheme,
  type AmountMode,
  type ThemeChoice,
} from '../../lib/prefs/device-prefs';
import { useAmountMode, useTheme } from '../../lib/prefs/useDevicePref';
import { Card, CardHeader } from '../../lib/ui/Card';
import { SegmentedControl } from '../../lib/ui/SegmentedControl';

const THEME_OPTIONS: readonly { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'Automatisch' },
  { value: 'light', label: 'Hell' },
  { value: 'dark', label: 'Dunkel' },
];

const AMOUNT_OPTIONS: readonly { value: AmountMode; label: string }[] = [
  { value: 'cents', label: 'Komma automatisch' },
  { value: 'free', label: 'Freitext' },
];

export function DeviceSection() {
  const theme = useTheme();
  const amountMode = useAmountMode();

  return (
    <Card>
      <CardHeader title="Dieses Gerät" />
      <div className="flex flex-col gap-4 px-4 py-4">
        <div>
          <p className="mb-1.5 text-sm font-medium text-ink-muted">Darstellung</p>
          <SegmentedControl
            label="Darstellung"
            value={theme}
            onChange={setTheme}
            options={THEME_OPTIONS}
          />
          <p className="mt-1.5 text-xs text-ink-muted">
            „Automatisch“ folgt der Einstellung des Betriebssystems.
          </p>
        </div>

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
          Beides gilt nur auf diesem Gerät und steht nicht in der Sicherung.
        </p>
      </div>
    </Card>
  );
}
