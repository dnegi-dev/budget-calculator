'use client';

/**
 * Erweiterte Einstellungen eines Topfes.
 *
 * Hier wird sichtbar, dass `kind` nur ein Preset ist: Limit und Übertrag sind
 * einzeln schaltbar. Eine Kombination, die von der gewählten Art abweicht,
 * wird als „angepasst“ markiert statt stillschweigend korrigiert — sonst wäre
 * unklar, warum ein „Monatsbudget“ plötzlich überträgt.
 */

import { useState } from 'react';
import { useData } from '../../lib/data/provider';
import { parseAmountToCents } from '../../lib/domain/money';
import { POT_KINDS, matchesPreset, potKindPreset } from '../../lib/domain/pot-kinds';
import type { Pot, PotKind } from '../../lib/domain/types';
import { AmountInput } from '../../lib/ui/AmountInput';
import { Banner } from '../../lib/ui/Banner';
import { Button } from '../../lib/ui/Button';
import { Field, inputClass, selectClass } from '../../lib/ui/Field';
import { POT_COLORS, POT_ICONS, potColorVar } from '../../lib/ui/colors';
import { useFormat } from '../../lib/ui/useFormat';

/**
 * Hülle, die das Formular bei jeder gespeicherten Revision neu aufbaut.
 *
 * So ziehen fremde Änderungen (Import, zweiter Tab) die Felder nach, ohne
 * dass ein Effect alle Zustände einzeln überschreiben muss — was bei jedem
 * neuen Feld eine Fehlerquelle mehr wäre.
 */
export function PotSettingsForm({ pot }: { pot: Pot }) {
  return <PotFields key={`${pot.id}-${pot.revision}`} pot={pot} />;
}

function PotFields({ pot }: { pot: Pot }) {
  const { repository } = useData();
  const format = useFormat();

  const [name, setName] = useState(pot.name);
  const [icon, setIcon] = useState(pot.icon);
  const [color, setColor] = useState(pot.color);
  const [kind, setKind] = useState<PotKind>(pot.kind);
  const [limitRaw, setLimitRaw] = useState(() =>
    pot.limitCents === null ? '' : format.moneyPlain(pot.limitCents),
  );
  const [carryOver, setCarryOver] = useState(pot.carryOver);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const limitCents = parseAmountToCents(limitRaw);
  const needsLimit = kind !== 'category';
  const deviates = !matchesPreset({ kind, limitCents: needsLimit ? limitCents : null, carryOver });

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await repository.updatePot(pot.id, {
        name,
        icon,
        color,
        kind,
        limitCents: needsLimit ? limitCents : null,
        carryOver,
      });
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unbekannter Fehler');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5 px-4 py-4">
      <Field label="Name">
        {(props) => (
          <input
            {...props}
            className={inputClass}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        )}
      </Field>

      <Field label="Art" hint={potKindPreset(kind).explanation}>
        {(props) => (
          <select
            {...props}
            className={selectClass}
            value={kind}
            onChange={(event) => {
              const next = event.target.value as PotKind;
              setKind(next);
              // Die Art setzt den Übertrag auf ihren Standard — abweichen kann
              // man danach bewusst über den Schalter.
              setCarryOver(potKindPreset(next).carryOver);
            }}
          >
            {POT_KINDS.map((option) => (
              <option key={option} value={option}>
                {potKindPreset(option).label}
              </option>
            ))}
          </select>
        )}
      </Field>

      {needsLimit && (
        <AmountInput
          value={limitRaw}
          onChange={setLimitRaw}
          label="Limit pro Periode"
          currencySymbol={format.currencySymbol}
        />
      )}

      {needsLimit && (
        <label className="flex items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3">
          <input
            type="checkbox"
            checked={carryOver}
            onChange={(event) => setCarryOver(event.target.checked)}
            className="mt-0.5 accent-[var(--accent)]"
          />
          <span className="min-w-0">
            <span className="block font-medium">Restbetrag übertragen</span>
            <span className="mt-0.5 block text-sm text-ink-muted">
              Was übrig bleibt, erhöht das Limit der nächsten Periode. Überziehungen werden
              genauso mitgenommen.
            </span>
          </span>
        </label>
      )}

      {deviates && (
        <Banner icon="✎">
          Diese Kombination weicht von „{potKindPreset(kind).label}“ ab. Das ist erlaubt — der Topf
          wird in Listen als angepasst geführt.
        </Banner>
      )}

      <div>
        <p className="mb-2 text-sm font-medium text-ink-muted">Symbol</p>
        <div className="grid grid-cols-6 gap-2 sm:grid-cols-9">
          {POT_ICONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setIcon(option)}
              aria-pressed={icon === option}
              aria-label={`Symbol ${option}`}
              className={[
                'grid h-11 place-items-center rounded-xl border text-lg',
                icon === option ? 'border-accent bg-accent-subtle' : 'border-line bg-surface',
              ].join(' ')}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-ink-muted">Farbe</p>
        <div className="flex flex-wrap gap-2">
          {POT_COLORS.map((option) => (
            <button
              key={option.name}
              type="button"
              onClick={() => setColor(option.name)}
              aria-pressed={color === option.name}
              aria-label={option.label}
              className={[
                'h-11 w-11 rounded-xl border-2',
                color === option.name ? 'border-ink' : 'border-transparent',
              ].join(' ')}
              style={{ background: potColorVar(option.name) }}
            />
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-negative">{error}</p>}

      <div className="flex items-center gap-3">
        <Button variant="primary" disabled={saving} onClick={() => void save()}>
          {saving ? 'Wird gespeichert …' : 'Änderungen speichern'}
        </Button>
        {saved && <span className="text-sm text-positive">Gespeichert</span>}
      </div>
    </div>
  );
}
