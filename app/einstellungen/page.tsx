'use client';

/**
 * Einstellungen.
 *
 * Alles, was man selten braucht — bewusst auf einer Seite gesammelt, statt in
 * die Alltagsansichten gestreut. Auf dem Desktop liest sich das als lange
 * Liste, mobil scrollt man durch; beides ist in Ordnung, weil hier niemand
 * unter Zeitdruck steht.
 */

import { useMemo, useState } from 'react';
import { DataSection } from '../../components/settings/DataSection';
import { RolesSection } from '../../components/settings/RolesSection';
import { RecurringSection } from '../../components/recurring/RecurringSection';
import { useCan } from '../../lib/auth/provider';
import { useData, useSnapshot } from '../../lib/data/provider';
import { formatByteSize } from '../../lib/data/blobs';
import { Banner } from '../../lib/ui/Banner';
import { Button } from '../../lib/ui/Button';
import { Card, CardHeader } from '../../lib/ui/Card';
import { Field, inputClass, selectClass } from '../../lib/ui/Field';
import { useFormat } from '../../lib/ui/useFormat';

export default function SettingsPage() {
  const snapshot = useSnapshot();
  const { repository } = useData();
  const format = useFormat();
  const can = useCan();

  const household = snapshot.household;
  const [name, setName] = useState(household?.name ?? '');
  const [periodStartDay, setPeriodStartDay] = useState(household?.periodStartDay ?? 1);
  const [currency, setCurrency] = useState(household?.currency ?? 'EUR');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);

  const receiptBytes = useMemo(
    () => snapshot.receipts.reduce((total, receipt) => total + receipt.byteSize, 0),
    [snapshot.receipts],
  );

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
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-semibold">Einstellungen</h1>

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

      <RecurringSection />
      <DataSection />
      <RolesSection />

      <Card>
        <CardHeader title="Speicher" />
        <dl className="divide-y divide-[var(--border)]">
          <Row label="Töpfe" value={String(snapshot.pots.length)} />
          <Row label="Buchungen" value={String(snapshot.entries.length)} />
          <Row
            label="Belege"
            value={`${snapshot.receipts.length} · ${formatByteSize(receiptBytes, format.locale)}`}
          />
          <Row
            label="Datenquelle"
            value={repository.mode === 'local' ? 'Dieses Gerät (IndexedDB)' : 'Zentrale API'}
          />
        </dl>
      </Card>

      {can('settings.manage') && (
        <Card className="border-[var(--negative)]">
          <CardHeader title="Alles löschen" />
          <div className="flex flex-col gap-3 px-4 py-4">
            <p className="text-sm text-ink-muted">
              Entfernt Haushalt, Töpfe, Buchungen und Belege von diesem Gerät. Nicht
              wiederherstellbar — lade vorher eine Sicherung herunter.
            </p>
            {confirmWipe ? (
              <div className="flex flex-wrap gap-3">
                <Button variant="danger" onClick={() => void repository.wipeAll()}>
                  Ja, alles löschen
                </Button>
                <Button variant="ghost" onClick={() => setConfirmWipe(false)}>
                  Abbrechen
                </Button>
              </div>
            ) : (
              <Button variant="danger" onClick={() => setConfirmWipe(true)}>
                Daten löschen
              </Button>
            )}
          </div>
        </Card>
      )}

      <Banner icon="ℹ">
        Version 1 arbeitet ohne Konto und ohne Server. Zentrale Speicherung und Anmeldung über SSO
        sind vorbereitet, aber noch nicht eingeschaltet — siehe docs/roadmap-server.md im Projekt.
      </Banner>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="tabular font-medium">{value}</dd>
    </div>
  );
}
