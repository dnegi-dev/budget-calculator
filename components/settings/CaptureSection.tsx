'use client';

/**
 * Wie das Erfassen läuft: Standardtopf und ob der Topf abgefragt wird.
 *
 * Beides gehört zum **Haushalt** und nicht zum Gerät (anders als Darstellung
 * und Betragseingabe in `DeviceSection`): Ein Standardtopf verweist auf einen
 * Topf dieses Haushalts, und eine Sicherung, die ihn nicht mitnimmt, wäre
 * unvollständig.
 *
 * Gesetzt wird sofort beim Umschalten, ohne Speichern-Knopf. Zwei Schalter
 * sind keine Formularseite, und ein vergessener Knopf wäre hier die häufigere
 * Enttäuschung.
 *
 * Wichtig: Das eigentliche Auffangnetz sitzt **im Repository**
 * (`createEntries`), nicht hier. Diese Seite stellt nur ein, was dort gilt —
 * sonst hätte der Bon-Import seine eigene Regel.
 */

import { useState } from 'react';
import { useCan } from '../../lib/auth/provider';
import { useData } from '../../lib/data/provider';
import { bookablePots } from '../../lib/domain/pot-kinds';
import { Card, CardHeader } from '../../lib/ui/Card';
import { Field, selectClass } from '../../lib/ui/Field';
import { SegmentedControl } from '../../lib/ui/SegmentedControl';
import { PotOptions } from '../pots/PotOptions';

export function CaptureSection() {
  const { repository, snapshot } = useData();
  const can = useCan();
  const [fehler, setFehler] = useState<string | null>(null);

  const household = snapshot.household;
  if (!household) return null;

  const darf = can('settings.manage');
  const pots = bookablePots(snapshot.pots);
  const standard = pots.find((pot) => pot.id === household.defaultPotId) ?? null;

  async function speichern(patch: { defaultPotId?: string | null; askForPot?: boolean }) {
    setFehler(null);
    try {
      await repository.updateHousehold(patch);
    } catch (caught) {
      setFehler(caught instanceof Error ? caught.message : 'Unbekannter Fehler');
    }
  }

  return (
    <Card>
      <CardHeader title="Erfassen" />
      <div className="flex flex-col gap-4 px-4 py-4">
        <Field
          label="Standardtopf"
          hint={
            pots.length === 0
              ? 'Noch keine Töpfe angelegt.'
              : 'Ausgaben ohne eigene Zuordnung laufen auf diesen Topf — auch die aus einem Bon und aus wiederkehrenden Buchungen. Einnahmen nicht: Die laufen auf den Haushalt.'
          }
        >
          {(props) => (
            <select
              {...props}
              className={selectClass}
              value={household.defaultPotId ?? ''}
              disabled={!darf || pots.length === 0}
              onChange={(event) => void speichern({ defaultPotId: event.target.value || null })}
            >
              <option value="">— keiner, bleibt ohne Topf —</option>
              <PotOptions pots={pots} />
            </select>
          )}
        </Field>

        <div>
          <p className="mb-1.5 text-sm font-medium text-ink-muted">Topf beim Erfassen</p>
          <SegmentedControl
            label="Topf beim Erfassen"
            value={household.askForPot ? 'ask' : 'default'}
            onChange={(next) => void speichern({ askForPot: next === 'ask' })}
            disabled={!darf}
            options={[
              { value: 'ask', label: 'Abfragen' },
              { value: 'default', label: 'Direkt in den Standardtopf' },
            ]}
          />
          <p className="mt-1.5 text-xs text-ink-muted">
            {household.askForPot
              ? 'Nach dem Betrag kommt die Topf-Auswahl.'
              : standard
                ? `Der Schritt entfällt; die Buchung geht auf „${standard.name}“ und ist in den Details änderbar.`
                : 'Der Schritt entfällt. Ohne Standardtopf bleiben Ausgaben damit ohne Topf — wähle oben einen aus.'}
          </p>
        </div>

        {fehler && <p className="text-sm text-negative">{fehler}</p>}
      </div>
    </Card>
  );
}
