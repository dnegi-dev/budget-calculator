'use client';

/**
 * Topf anlegen — vier Schritte, je eine Entscheidung.
 *
 * Der zweite Schritt ist der eigentliche Grund für einen Wizard: Die drei
 * Topf-Arten sind ohne Erklärung nicht unterscheidbar. In einem Formular wäre
 * das ein Dropdown mit drei Fachbegriffen; hier steht zu jeder Art ein Satz
 * und ein Beispiel.
 */

import { useState } from 'react';
import { useData } from '../../lib/data/provider';
import { todayIso } from '../../lib/domain/dates';
import { parseAmountToCents } from '../../lib/domain/money';
import { POT_KINDS, potKindPreset } from '../../lib/domain/pot-kinds';
import type { PotKind } from '../../lib/domain/types';
import { AmountInput } from '../../lib/ui/AmountInput';
import { Button } from '../../lib/ui/Button';
import { Field, inputClass } from '../../lib/ui/Field';
import { Sheet } from '../../lib/ui/Sheet';
import { WizardSteps } from '../../lib/ui/WizardSteps';
import { POT_COLORS, POT_ICONS, potColorVar } from '../../lib/ui/colors';
import { useFormat } from '../../lib/ui/useFormat';

export function PotWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { repository } = useData();
  const format = useFormat();

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<PotKind>('budget');
  const [limitRaw, setLimitRaw] = useState('');
  const [goalRaw, setGoalRaw] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [icon, setIcon] = useState<string>('🧺');
  const [color, setColor] = useState<string>('emerald');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preset = potKindPreset(kind);
  // Bei 'category' entfällt der Limit-Schritt — eine Frage, auf die es keine
  // Antwort gibt, wird nicht gestellt. Bei 'goal' tritt ein eigener Schritt
  // (Betrag + Frist) an die Stelle des Limit-Schritts.
  const steps: readonly ('name' | 'kind' | 'limit' | 'goal' | 'look')[] = preset.requiresLimit
    ? ['name', 'kind', 'limit', 'look']
    : preset.requiresGoal
      ? ['name', 'kind', 'goal', 'look']
      : ['name', 'kind', 'look'];
  const currentStep = steps[Math.min(step, steps.length - 1)];
  const limitCents = parseAmountToCents(limitRaw);
  const goalCents = parseAmountToCents(goalRaw);

  function reset() {
    setStep(0);
    setName('');
    setKind('budget');
    setLimitRaw('');
    setGoalRaw('');
    setTargetDate('');
    setIcon('🧺');
    setColor('emerald');
    setError(null);
    setSaving(false);
  }

  function close() {
    reset();
    onClose();
  }

  const canContinue =
    currentStep === 'name'
      ? name.trim().length > 0
      : currentStep === 'limit'
        ? limitCents !== null && limitCents > 0
        : currentStep === 'goal'
          ? goalCents !== null && goalCents > 0 && targetDate !== '' && targetDate > todayIso()
          : true;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await repository.createPot({
        name,
        icon,
        color,
        kind,
        limitCents: preset.requiresLimit ? limitCents : null,
        carryOver: preset.carryOver,
        goalCents: preset.requiresGoal ? goalCents : null,
        targetDate: preset.requiresGoal ? targetDate : null,
      });
      close();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unbekannter Fehler');
      setSaving(false);
    }
  }

  const isLast = step === steps.length - 1;

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Neuer Topf"
      description="Ein Topf sammelt Ausgaben eines Bereichs — etwa Lebensmittel oder Sport."
      footer={
        <div className="flex gap-3">
          {step > 0 && (
            <Button variant="ghost" onClick={() => setStep((value) => value - 1)}>
              Zurück
            </Button>
          )}
          {isLast ? (
            <Button variant="primary" block disabled={saving} onClick={() => void save()}>
              {saving ? 'Wird angelegt …' : 'Topf anlegen'}
            </Button>
          ) : (
            <Button
              variant="primary"
              block
              disabled={!canContinue}
              onClick={() => setStep((value) => value + 1)}
            >
              Weiter
            </Button>
          )}
        </div>
      }
    >
      <div className="mb-5">
        <WizardSteps total={steps.length} current={step} />
      </div>

      {currentStep === 'name' && (
        <Field label="Wofür ist der Topf?">
          {(props) => (
            <input
              {...props}
              className={inputClass}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="z. B. Lebensmittel"
              autoComplete="off"
            />
          )}
        </Field>
      )}

      {currentStep === 'kind' && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium text-ink-muted">
            Wie soll er sich verhalten?
          </legend>
          {POT_KINDS.map((option) => {
            const optionPreset = potKindPreset(option);
            const selected = option === kind;
            return (
              <label
                key={option}
                className={[
                  'flex cursor-pointer gap-3 rounded-xl border px-4 py-3',
                  selected ? 'border-accent bg-accent-subtle' : 'border-line bg-surface',
                ].join(' ')}
              >
                <input
                  type="radio"
                  name="potKind"
                  value={option}
                  checked={selected}
                  onChange={() => setKind(option)}
                  className="mt-1 accent-[var(--accent)]"
                />
                <span className="min-w-0">
                  <span className="block font-medium">{optionPreset.label}</span>
                  <span className="mt-0.5 block text-sm text-ink-muted">
                    {optionPreset.explanation}
                  </span>
                  <span className="mt-1 block text-sm text-ink-muted italic">
                    {optionPreset.example}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>
      )}

      {currentStep === 'limit' && (
        <div className="flex flex-col gap-4">
          <AmountInput
            value={limitRaw}
            onChange={setLimitRaw}
            label={`Limit pro Periode für „${name.trim()}“`}
            currencySymbol={format.currencySymbol}
            large
            autoFocus
          />
          <p className="text-sm text-ink-muted">
            {preset.carryOver
              ? 'Was am Ende der Periode übrig ist, bleibt im Topf und erhöht das Limit der nächsten Periode.'
              : 'Am Anfang jeder Periode steht wieder dieser Betrag zur Verfügung.'}
          </p>
        </div>
      )}

      {currentStep === 'goal' && (
        <div className="flex flex-col gap-4">
          <AmountInput
            value={goalRaw}
            onChange={setGoalRaw}
            label={`Sparziel-Betrag für „${name.trim()}“`}
            currencySymbol={format.currencySymbol}
            large
            autoFocus
          />
          <Field label="Bis wann?">
            {(props) => (
              <input
                {...props}
                type="date"
                className={inputClass}
                value={targetDate}
                onChange={(event) => setTargetDate(event.target.value)}
                min={todayIso()}
              />
            )}
          </Field>
          <p className="text-sm text-ink-muted">
            Danach ist der Topf gesperrt, egal wie viel zusammenkam — verlängern lässt sich die
            Frist später in den Topf-Einstellungen.
          </p>
        </div>
      )}

      {currentStep === 'look' && (
        <div className="flex flex-col gap-6">
          <div>
            <p className="mb-2 text-sm font-medium text-ink-muted">Symbol</p>
            <div className="grid grid-cols-6 gap-2">
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

          <div className="flex items-center gap-3 rounded-xl border border-line bg-subtle px-4 py-3">
            <span
              aria-hidden
              className="grid h-10 w-10 place-items-center rounded-lg text-xl"
              style={{ background: `color-mix(in oklch, ${potColorVar(color)} 20%, transparent)` }}
            >
              {icon}
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium">{name.trim() || 'Neuer Topf'}</p>
              <p className="text-sm text-ink-muted">
                {preset.requiresLimit && limitCents !== null
                  ? `${format.money(limitCents)} pro Periode${preset.carryOver ? ', mit Übertrag' : ''}`
                  : preset.requiresGoal && goalCents !== null
                    ? `Ziel: ${format.money(goalCents)}${targetDate ? ` bis ${format.day(targetDate)}` : ''}`
                    : 'Ohne Limit'}
              </p>
            </div>
          </div>

          {error && <p className="text-sm text-negative">{error}</p>}
        </div>
      )}
    </Sheet>
  );
}
