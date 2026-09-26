'use client';

/**
 * Die Gefahrenzone: was sich nicht rückgängig machen lässt.
 *
 * Zwei Dinge stehen hier, und beide standen vorher zwischen harmlosen
 * Schaltern:
 *
 * - **Alles löschen** lag unter „Speicher“ und über „Anmeldung“.
 * - **Ersetzend einlesen** lag als danger-Knopf neben „Zusammenführen“ im
 *   selben Bestätigungsblock. Ein Fehlgriff dort verwarf den ganzen Haushalt.
 *
 * Was hier **nicht** hingehört, und warum: Topf archivieren und Tag umbenennen
 * sind umkehrbar. `resetLocalDeviceRole` ist der Reparaturweg, kein Risiko.
 * Einen Topf zu löschen bleibt auf seiner Detailseite — dort steht der
 * Kontext, ohne den die Entscheidung nicht zu treffen ist.
 */

import { useState } from 'react';
import { CircleCheck, TriangleAlert } from 'lucide-react';
import { useCan } from '../../lib/auth/provider';
import { useData } from '../../lib/data/provider';
import { Banner } from '../../lib/ui/Banner';
import { Button } from '../../lib/ui/Button';
import { Card, CardHeader } from '../../lib/ui/Card';
import { Icon } from '../../lib/ui/Icon';
import { BackupFilePicker } from './BackupFilePicker';
import { describeImportResult, useBackupImport } from './useBackupImport';

export function DangerZoneSection() {
  const { repository } = useData();
  const can = useCan();
  const ersetzen = useBackupImport();
  const [confirmWipe, setConfirmWipe] = useState(false);

  if (!can('settings.manage') && !can('data.import')) {
    return (
      <Banner icon={<Icon icon={TriangleAlert} size={18} />}>
        Deine Rolle darf hier nichts ändern.
      </Banner>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Banner tone="negative" icon={<Icon icon={TriangleAlert} size={18} />}>
        Beides auf dieser Seite lässt sich nicht rückgängig machen und trifft nur dieses Gerät. Lade
        vorher eine Sicherung herunter.
      </Banner>

      {can('data.import') && (
        <Card className="border-[var(--negative)]">
          <CardHeader title="Sicherung ersetzend einlesen" />
          <div className="flex flex-col gap-3 px-4 py-4">
            <p className="text-sm text-ink-muted">
              Verwirft Haushalt, Töpfe, Buchungen und Belege auf diesem Gerät und setzt den Stand
              aus der Datei. Richtig beim Gerätewechsel. Zum Abgleich zweier Geräte ist
              „Zusammenführen“ unter „Sicherung“ das Richtige.
            </p>
            <div>
              <BackupFilePicker
                label="Datei wählen"
                disabled={ersetzen.busy}
                onFile={(file) => void ersetzen.lesen(file)}
              />
            </div>

            {ersetzen.pending !== null && (
              <div className="rounded-card border border-[var(--negative)] px-4 py-3">
                <p className="font-medium">Wirklich ersetzen?</p>
                {ersetzen.truncated > 0 && (
                  <p className="mt-1 text-sm text-ink-muted">
                    {ersetzen.truncated === 1
                      ? 'Ein zu langer Text wurde auf die zulässige Länge gekürzt.'
                      : `${ersetzen.truncated} zu lange Texte wurden auf die zulässige Länge gekürzt.`}
                  </p>
                )}
                <p className="mt-1 text-sm text-ink-muted">
                  Alles, was jetzt auf diesem Gerät steht, ist danach weg.
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <Button
                    variant="danger"
                    disabled={ersetzen.busy}
                    onClick={() => void ersetzen.ausfuehren('replace')}
                  >
                    Ja, ersetzen
                  </Button>
                  <Button variant="ghost" onClick={ersetzen.abbrechen}>
                    Abbrechen
                  </Button>
                </div>
              </div>
            )}

            {ersetzen.result && (
              <Banner icon={<Icon icon={CircleCheck} size={18} />}>
                {describeImportResult(ersetzen.result)}
              </Banner>
            )}
            {ersetzen.error && (
              <Banner tone="negative" icon={<Icon icon={TriangleAlert} size={18} />}>
                <span className="whitespace-pre-line">{ersetzen.error}</span>
              </Banner>
            )}
          </div>
        </Card>
      )}

      {can('settings.manage') && (
        <Card className="border-[var(--negative)]">
          <CardHeader title="Alles löschen" />
          <div className="flex flex-col gap-3 px-4 py-4">
            <p className="text-sm text-ink-muted">
              Entfernt Haushalt, Töpfe, Buchungen und Belege von diesem Gerät. Nicht
              wiederherstellbar — danach steht die Ersteinrichtung wieder am Anfang.
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
              <div>
                <Button variant="danger" onClick={() => setConfirmWipe(true)}>
                  Daten löschen
                </Button>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
