'use client';

/**
 * Ersteinrichtung in vier Schritten — eine Frage pro Bildschirm.
 *
 * Reihenfolge nach dem Prinzip „erst das, was man ohne Nachdenken beantworten
 * kann“: Name, dann Periode, dann Töpfe (mit Vorschlägen zum Abwählen statt
 * einer leeren Liste), dann optional das Einkommen.
 *
 * Der letzte Schritt sagt ausdrücklich, dass die Daten nur auf diesem Gerät
 * liegen. Das ist keine Fußnote: ohne Export ist ein Gerätewechsel
 * Datenverlust.
 */

import { useState } from 'react';
import { SUGGESTED_POTS } from './suggested-pots';
import { useData } from '../../lib/data/provider';
import { todayIso } from '../../lib/domain/dates';
import { parseAmountToCents } from '../../lib/domain/money';
import { nowIso } from '../../lib/domain/dates';
import { Button } from '../../lib/ui/Button';
import { AmountInput } from '../../lib/ui/AmountInput';
import { Field, inputClass, selectClass } from '../../lib/ui/Field';
import { WizardSteps } from '../../lib/ui/WizardSteps';
import { Banner } from '../../lib/ui/Banner';
import { potColorVar } from '../../lib/ui/colors';

const STEP_COUNT = 4;

const CURRENCIES = [
  { code: 'EUR', label: 'Euro (€)' },
  { code: 'CHF', label: 'Schweizer Franken (CHF)' },
  { code: 'USD', label: 'US-Dollar ($)' },
  { code: 'GBP', label: 'Britisches Pfund (£)' },
];

export function OnboardingWizard() {
  const { repository } = useData();

  const [step, setStep] = useState(0);
  const [householdName, setHouseholdName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [periodStartDay, setPeriodStartDay] = useState(1);
  const [selectedPots, setSelectedPots] = useState<Set<string>>(
    () => new Set(SUGGESTED_POTS.filter((pot) => pot.preselected).map((pot) => pot.key)),
  );
  const [incomeRaw, setIncomeRaw] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameValid = householdName.trim().length > 0;
  const incomeCents = parseAmountToCents(incomeRaw);

  function togglePot(key: string) {
    setSelectedPots((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function finish() {
    setSaving(true);
    setError(null);
    try {
      await repository.setupHousehold({
        name: householdName,
        currency,
        locale: 'de-DE',
        periodStartDay,
        displayName,
      });

      for (const suggestion of SUGGESTED_POTS) {
        if (!selectedPots.has(suggestion.key)) continue;
        await repository.createPot({
          name: suggestion.name,
          icon: suggestion.icon,
          color: suggestion.color,
          kind: suggestion.kind,
          limitCents: suggestion.limitCents,
          carryOver: suggestion.carryOver,
        });
      }

      // Ein Einkommen, das sich jeden Monat wiederholt, ist als Regel richtig
      // aufgehoben — nicht als einzelne Buchung.
      if (incomeCents !== null && incomeCents > 0) {
        await repository.createRecurringRule({
          potId: null,
          kind: 'income',
          amountCents: incomeCents,
          freq: 'monthly',
          interval: 1,
          dayOfMonth: periodStartDay,
          startDate: todayIso(),
          note: 'Einkommen',
        });
      }

      await repository.updateHousehold({ onboardingCompletedAt: nowIso() });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unbekannter Fehler');
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 py-8">
      <div className="mb-8 flex items-center justify-between">
        <p className="text-sm font-medium text-ink-muted">Ersteinrichtung</p>
        <WizardSteps total={STEP_COUNT} current={step} />
      </div>

      <div className="flex-1">
        {step === 0 && (
          <section className="flex flex-col gap-5">
            <header>
              <h1 className="text-2xl font-semibold">Wie soll dein Haushalt heißen?</h1>
              <p className="mt-2 text-sm text-ink-muted">
                Nur ein Name für die Übersicht. Du kannst ihn später ändern.
              </p>
            </header>
            <Field label="Name des Haushalts">
              {(props) => (
                <input
                  {...props}
                  className={inputClass}
                  value={householdName}
                  onChange={(event) => setHouseholdName(event.target.value)}
                  placeholder="z. B. Zuhause"
                  autoComplete="off"
                />
              )}
            </Field>
            <Field label="Dein Name" hint="Erscheint an Buchungen als Urheber. Optional.">
              {(props) => (
                <input
                  {...props}
                  className={inputClass}
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Ich"
                  autoComplete="off"
                />
              )}
            </Field>
          </section>
        )}

        {step === 1 && (
          <section className="flex flex-col gap-5">
            <header>
              <h1 className="text-2xl font-semibold">Währung und Periode</h1>
              <p className="mt-2 text-sm text-ink-muted">
                Die Periode ist der Zeitraum, für den ein Topf sein Limit hat.
              </p>
            </header>
            <Field label="Währung">
              {(props) => (
                <select
                  {...props}
                  className={selectClass}
                  value={currency}
                  onChange={(event) => setCurrency(event.target.value)}
                >
                  {CURRENCIES.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.label}
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
                  : `Die Periode läuft vom ${periodStartDay}. bis zum ${periodStartDay - 1}. des Folgemonats — praktisch, wenn das Gehalt an diesem Tag kommt.`
              }
            >
              {(props) => (
                <select
                  {...props}
                  className={selectClass}
                  value={periodStartDay}
                  onChange={(event) => setPeriodStartDay(Number(event.target.value))}
                >
                  {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => (
                    <option key={day} value={day}>
                      {day}. des Monats
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </section>
        )}

        {step === 2 && (
          <section className="flex flex-col gap-5">
            <header>
              <h1 className="text-2xl font-semibold">Welche Töpfe brauchst du?</h1>
              <p className="mt-2 text-sm text-ink-muted">
                Auswahl zum Starten. Beträge und Arten kannst du danach jederzeit anpassen, und
                weitere Töpfe kommen später dazu.
              </p>
            </header>
            <ul className="flex flex-col gap-2">
              {SUGGESTED_POTS.map((suggestion) => {
                const selected = selectedPots.has(suggestion.key);
                return (
                  <li key={suggestion.key}>
                    <button
                      type="button"
                      onClick={() => togglePot(suggestion.key)}
                      aria-pressed={selected}
                      className={[
                        'flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left',
                        selected ? 'border-accent bg-accent-subtle' : 'border-line bg-surface',
                      ].join(' ')}
                    >
                      <span
                        aria-hidden
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-lg"
                        style={{ background: `color-mix(in oklch, ${potColorVar(suggestion.color)} 18%, transparent)` }}
                      >
                        {suggestion.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{suggestion.name}</span>
                        <span className="block text-sm text-ink-muted">
                          {suggestion.kind === 'category'
                            ? 'ohne Limit'
                            : `${(suggestion.limitCents ?? 0) / 100} ${currency}${suggestion.carryOver ? ', mit Übertrag' : ''}`}
                        </span>
                      </span>
                      <span aria-hidden className={selected ? 'text-accent' : 'text-ink-muted'}>
                        {selected ? '✓' : '+'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {step === 3 && (
          <section className="flex flex-col gap-5">
            <header>
              <h1 className="text-2xl font-semibold">Regelmäßiges Einkommen?</h1>
              <p className="mt-2 text-sm text-ink-muted">
                Optional. Wird als wiederkehrende Buchung zum {periodStartDay}. angelegt, damit die
                Auswertung einen Saldo zeigen kann.
              </p>
            </header>
            <AmountInput
              value={incomeRaw}
              onChange={setIncomeRaw}
              label="Betrag pro Periode"
              currencySymbol={currency === 'EUR' ? '€' : currency}
            />
            <Banner icon="💾">
              Alle Daten bleiben auf diesem Gerät — ohne Konto, ohne Server. Sichere sie in den
              Einstellungen als Datei, bevor du das Gerät wechselst.
            </Banner>
            {error && (
              <Banner tone="negative" icon="⚠">
                {error}
              </Banner>
            )}
          </section>
        )}
      </div>

      <footer className="mt-8 flex gap-3">
        {step > 0 && (
          <Button variant="ghost" size="lg" onClick={() => setStep((value) => value - 1)}>
            Zurück
          </Button>
        )}
        {step < STEP_COUNT - 1 ? (
          <Button
            variant="primary"
            size="lg"
            block
            disabled={step === 0 && !nameValid}
            onClick={() => setStep((value) => value + 1)}
          >
            Weiter
          </Button>
        ) : (
          <Button variant="primary" size="lg" block disabled={saving} onClick={() => void finish()}>
            {saving ? 'Wird angelegt …' : 'Los geht’s'}
          </Button>
        )}
      </footer>
    </div>
  );
}
