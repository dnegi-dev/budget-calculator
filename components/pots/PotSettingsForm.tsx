'use client';

/**
 * Erweiterte Einstellungen eines Topfes.
 *
 * Hier wird sichtbar, dass `kind` nur ein Preset ist: Das Limit bleibt frei
 * einstellbar. Der Übertrag hat dagegen **keinen eigenen Schalter** mehr —
 * er hing sonst doppelt an der Bedienung: einmal über die Art
 * („Monatsbudget“ vs. „Budget mit Übertrag“), einmal über eine zusätzliche
 * Checkbox, die genau dasselbe Feld (`carryOver`) setzte und dabei
 * stillschweigend überschrieb, was die Art gerade gewählt hatte. Jetzt setzt
 * ausschließlich der Wechsel der Art den Übertrag — auf ihren Standard.
 *
 * Ein Topf, dessen `carryOver` aus der Zeit vor dieser Änderung noch von
 * seiner Art abweicht, bleibt unangetastet, solange niemand die Art wechselt
 * — und wird weiterhin als „angepasst“ markiert statt stillschweigend
 * korrigiert, damit klar bleibt, warum ein „Monatsbudget“ überträgt.
 */

import { useState } from 'react';
import { useData } from '../../lib/data/provider';
import { todayIso } from '../../lib/domain/dates';
import { parseAmountToCents } from '../../lib/domain/money';
import { POT_KINDS, matchesPreset, potKindPreset } from '../../lib/domain/pot-kinds';
import type { Pot, PotKind } from '../../lib/domain/types';
import { AmountInput } from '../../lib/ui/AmountInput';
import { Lock, Pencil } from 'lucide-react';
import { Banner } from '../../lib/ui/Banner';
import { Icon } from '../../lib/ui/Icon';
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
  const [goalRaw, setGoalRaw] = useState(() =>
    pot.goalCents === null ? '' : format.moneyPlain(pot.goalCents),
  );
  const [targetDate, setTargetDate] = useState(pot.targetDate ?? '');
  const [carryOver, setCarryOver] = useState(pot.carryOver);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ein gesperrtes Sparziel bekommt keinen zweiten Weg, seine Frist zu
  // ändern: der einzige ist das eigene Verlängern-Feld unten.
  const [extendTo, setExtendTo] = useState('');
  const [extending, setExtending] = useState(false);
  const [extendError, setExtendError] = useState<string | null>(null);

  const locked = pot.lockedAt !== null;
  const limitCents = parseAmountToCents(limitRaw);
  const goalCents = parseAmountToCents(goalRaw);
  const needsLimit = kind !== 'category' && kind !== 'goal';
  const needsGoal = kind === 'goal';
  const deviates = !matchesPreset({
    kind,
    limitCents: needsLimit ? limitCents : null,
    carryOver,
    goalCents: needsGoal ? goalCents : null,
  });

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
        goalCents: needsGoal ? goalCents : null,
        targetDate: needsGoal ? targetDate || null : null,
      });
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unbekannter Fehler');
    } finally {
      setSaving(false);
    }
  }

  async function extend() {
    setExtending(true);
    setExtendError(null);
    try {
      await repository.updatePot(pot.id, { targetDate: extendTo });
      setExtendTo('');
    } catch (caught) {
      setExtendError(caught instanceof Error ? caught.message : 'Unbekannter Fehler');
    } finally {
      setExtending(false);
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

      {locked ? (
        <>
          <Banner icon={<Icon icon={Lock} size={18} />}>
            Dieses Sparziel ist am {format.day(pot.targetDate ?? pot.lockedAt ?? todayIso())}{' '}
            abgelaufen und gesperrt. Neue Buchungen sind nicht mehr möglich.
          </Banner>
          <Field label="Neue Frist">
            {(props) => (
              <input
                {...props}
                type="date"
                className={inputClass}
                value={extendTo}
                onChange={(event) => setExtendTo(event.target.value)}
              />
            )}
          </Field>
          {extendError && <p className="text-sm text-negative">{extendError}</p>}
          <Button
            variant="primary"
            disabled={extending || extendTo === '' || extendTo <= todayIso()}
            onClick={() => void extend()}
          >
            {extending ? 'Wird verlängert …' : 'Frist verlängern und entsperren'}
          </Button>
        </>
      ) : (
        <>
          <Field label="Art" hint={potKindPreset(kind).explanation}>
            {(props) => (
              <select
                {...props}
                className={selectClass}
                value={kind}
                onChange={(event) => {
                  const next = event.target.value as PotKind;
                  setKind(next);
                  // Die Art setzt den Übertrag auf ihren Standard — abweichen
                  // kann man danach bewusst über den Schalter.
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

          {needsGoal && (
            <>
              <AmountInput
                value={goalRaw}
                onChange={setGoalRaw}
                label="Sparziel-Betrag"
                currencySymbol={format.currencySymbol}
              />
              <Field label="Bis wann?">
                {(props) => (
                  <input
                    {...props}
                    type="date"
                    className={inputClass}
                    value={targetDate}
                    onChange={(event) => setTargetDate(event.target.value)}
                  />
                )}
              </Field>
            </>
          )}

          {deviates && (
            <Banner icon={<Icon icon={Pencil} size={18} />}>
              Diese Kombination weicht von „{potKindPreset(kind).label}“ ab. Das ist erlaubt — der
              Topf wird in Listen als angepasst geführt.
            </Banner>
          )}
        </>
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
