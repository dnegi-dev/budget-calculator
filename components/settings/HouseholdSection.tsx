'use client';

/**
 * Name, Währung und Beginn der Periode.
 *
 * Die einzige Karte in den Einstellungen mit einem eigenen Speichern-Knopf:
 * Ein Name wird beim Tippen zwischendurch unsinnig, und der Beginn der Periode
 * verschiebt rückwirkend Buchungen. Beides soll nicht bei jedem Tastendruck
 * gelten — anders als die Schalter daneben, die sofort greifen.
 */

import { useState } from 'react';
import { useCan } from '../../lib/auth/provider';
import { useData, useSnapshot } from '../../lib/data/provider';
import { Button } from '../../lib/ui/Button';
import { Card, CardHeader } from '../../lib/ui/Card';
import { Field, inputClass, selectClass } from '../../lib/ui/Field';

export function HouseholdSection() {
  const snapshot = useSnapshot();
  const { repository } = useData();
  const can = useCan();

  const household = snapshot.household;
  const [name, setName] = useState(household?.name ?? '');
  const [periodStartDay, setPeriodStartDay] = useState(household?.periodStartDay ?? 1);
  const [currency, setCurrency] = useState(household?.currency ?? 'EUR');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveHousehold() {
    setError(null);
    setSaved(false);
    try {
      await repository.updateHousehold({ name, periodStartDay, currency });
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unbekannter Fehler');
    }
  }

  return (
    <Card>
      <CardHeader title="Haushalt" />
      <div className="flex flex-col gap-4 px-4 py-4">
        <Field label="Name">
          {(props) => (
            <input
              {...props}
              className={inputClass}
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={!can('settings.manage')}
            />
          )}
        </Field>

        <Field label="Währung">
          {(props) => (
            <select
              {...props}
              className={selectClass}
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
              disabled={!can('settings.manage')}
            >
              {['EUR', 'CHF', 'USD', 'GBP'].map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field
          label="Periode beginnt am"
          hint={
            periodStartDay === 1
              ? 'Entspricht dem Kalendermonat.'
              : 'Bereits erfasste Buchungen wandern dadurch in andere Perioden — Restbeträge ändern sich rückwirkend.'
          }
        >
          {(props) => (
            <select
              {...props}
              className={selectClass}
              value={periodStartDay}
              onChange={(event) => setPeriodStartDay(Number(event.target.value))}
              disabled={!can('settings.manage')}
            >
              {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => (
                <option key={day} value={day}>
                  {day}. des Monats
                </option>
              ))}
            </select>
          )}
        </Field>

        {can('settings.manage') && (
          <div className="flex items-center gap-3">
            <Button variant="primary" onClick={() => void saveHousehold()}>
              Speichern
            </Button>
            {saved && <span className="text-sm text-positive">Gespeichert</span>}
          </div>
        )}
        {error && <p className="text-sm text-negative">{error}</p>}
      </div>
    </Card>
  );
}
