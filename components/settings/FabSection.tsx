'use client';

/**
 * Was der schwebende Knopf tut — allgemein und je Bereich.
 *
 * Gehört zum **Haushalt** und nicht zum Gerät, aus demselben Grund wie
 * `askForPot`: Es ist eine Aussage darüber, wie dieser Haushalt erfasst, und
 * sie soll in der Sicherung stehen. Die Regeln (Vorrang des Bereichs, Rückfall
 * auf die Ausgabe) stehen in `lib/domain/fab.ts` und nicht hier — diese Seite
 * stellt nur ein, was dort gilt.
 *
 * Je Bereich ein Auswahlfeld und kein Umschalter mit vier Feldern: Vier
 * Beschriftungen nebeneinander (Ausgabe, Einnahme, Fragen, wie überall) passen
 * bei 320 px nicht in eine Zeile, und sechs solcher Reihen wären eine Wand.
 */

import { useState } from 'react';
import { useCan } from '../../lib/auth/provider';
import { useData } from '../../lib/data/provider';
import { FAB_ACTIONS, FAB_SCOPES, fabLabel, resolveFabAction } from '../../lib/domain/fab';
import type { FabAction, FabScope } from '../../lib/domain/types';
import { Card, CardHeader } from '../../lib/ui/Card';
import { selectClass } from '../../lib/ui/Field';
import { SegmentedControl } from '../../lib/ui/SegmentedControl';

/** Der Wert im Auswahlfeld, der „kein eigener Eintrag" bedeutet. */
const WIE_UEBERALL = '';

/** Der kurze Name einer Aktion — derselbe, der im Auswahlfeld steht. */
function aktionName(action: FabAction): string {
  return FAB_ACTIONS.find((option) => option.value === action)?.label ?? action;
}

export function FabSection() {
  const { repository, snapshot } = useData();
  const can = useCan();
  const [fehler, setFehler] = useState<string | null>(null);

  const household = snapshot.household;
  if (!household) return null;

  const darf = can('settings.manage');

  async function speichern(patch: {
    fabDefault?: FabAction;
    fabScopes?: Partial<Record<FabScope, FabAction>>;
  }) {
    setFehler(null);
    try {
      await repository.updateHousehold(patch);
    } catch (caught) {
      setFehler(caught instanceof Error ? caught.message : 'Unbekannter Fehler');
    }
  }

  /**
   * Ein Bereich wird gesetzt oder geräumt. Geräumt heißt: Schlüssel **weg**,
   * nicht auf den allgemeinen Wert gesetzt — sonst folgte der Bereich einer
   * späteren Änderung nicht mehr.
   */
  const setzeBereich = (scope: FabScope, wert: string) => {
    const scopes = { ...household.fabScopes };
    if (wert === WIE_UEBERALL) delete scopes[scope];
    else scopes[scope] = wert as FabAction;
    void speichern({ fabScopes: scopes });
  };

  return (
    <Card>
      <CardHeader title="Schwebender Knopf" />
      <div className="flex flex-col gap-4 px-4 py-4">
        <div>
          <p className="mb-1.5 text-sm font-medium text-ink-muted">Ein Tippen macht</p>
          <SegmentedControl
            label="Standardaktion des schwebenden Knopfes"
            value={household.fabDefault}
            onChange={(next) => void speichern({ fabDefault: next })}
            disabled={!darf}
            options={FAB_ACTIONS}
          />
          <p className="mt-1.5 text-xs text-ink-muted">
            {household.fabDefault === 'ask'
              ? 'Der Knopf fragt erst nach der Art — wie früher.'
              : `Der Knopf öffnet direkt „${fabLabel(household.fabDefault)}“. Langes Drücken zeigt beide Arten; mit der Tastatur tut das Pfeil nach oben.`}
          </p>
        </div>

        <div>
          <p className="mb-1.5 text-sm font-medium text-ink-muted">Abweichend je Seite</p>
          <dl className="divide-y divide-[var(--border)]">
            {FAB_SCOPES.map((info) => {
              const eigene = household.fabScopes[info.scope];
              return (
                <div key={info.scope} className="flex items-center gap-3 py-2.5">
                  <dt className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{info.label}</span>
                    <span className="block truncate text-xs text-ink-muted">{info.hint}</span>
                  </dt>
                  <dd>
                    <select
                      className={`${selectClass} w-auto`}
                      value={eigene ?? WIE_UEBERALL}
                      disabled={!darf}
                      aria-label={`Knopf auf „${info.label}“`}
                      onChange={(event) => setzeBereich(info.scope, event.target.value)}
                    >
                      <option value={WIE_UEBERALL}>wie überall</option>
                      {FAB_ACTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </dd>
                </div>
              );
            })}
          </dl>
          <p className="mt-1.5 text-xs text-ink-muted">
            „wie überall“ ist kein eigener Wert, sondern ein fehlender: Diese Seiten folgen dem
            oberen Schalter auch dann, wenn er später wechselt. Auf „Buchungen“ tut der Knopf gerade
            „{aktionName(resolveFabAction(household, 'entries'))}“.
          </p>
        </div>

        {fehler && <p className="text-sm text-negative">{fehler}</p>}
      </div>
    </Card>
  );
}
