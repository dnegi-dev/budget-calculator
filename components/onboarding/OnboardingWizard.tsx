'use client';

/**
 * Ersteinrichtung in acht Schritten — eine Frage pro Bildschirm.
 *
 * Reihenfolge nach dem Prinzip „erst das, was man ohne Nachdenken beantworten
 * kann“: Name, dann Periode, dann Einkommen, dann die Betragsart, dann je ein
 * eigener Bildschirm für jeden der vier Vorschlags-Töpfe — Lebensmittel
 * (Monatsbudget), Haushalt (Nur Kategorie), Hobby (Budget mit Übertrag),
 * Urlaub (Sparziel): ein Beispiel je Topf-Art statt einer langen Liste zum
 * An- und Abwählen. Ein Schalter „Diesen Topf anlegen" ist das Überspringen —
 * ein zweiter, eigener Knopf dafür wäre dieselbe Entscheidung zweimal bedient.
 *
 * Das Einkommen steht bewusst **vor** den Töpfen: Die „feste" Betragsart
 * rechnet einen Anteil davon (`lib/domain/onboarding-budget.ts`), und ohne
 * Einkommen bleibt nur „frei" übrig.
 *
 * Der letzte Schritt sagt ausdrücklich, dass die Daten nur auf diesem Gerät
 * liegen. Das ist keine Fußnote: ohne Export ist ein Gerätewechsel
 * Datenverlust.
 */

import { useRef, useState } from 'react';
import { SUGGESTED_POTS, type OnboardingPotKey } from './suggested-pots';
import { Save, TriangleAlert } from 'lucide-react';
import { useData } from '../../lib/data/provider';
import { addMonths, nowIso, todayIso } from '../../lib/domain/dates';
import { periodForDate } from '../../lib/domain/period';
import {
  amountFromIncomePercent,
  INCOME_PERCENT_SUGGESTIONS,
} from '../../lib/domain/onboarding-budget';
import { parseAmountToCents } from '../../lib/domain/money';
import { potKindPreset } from '../../lib/domain/pot-kinds';
import { Button } from '../../lib/ui/Button';
import { AmountInput } from '../../lib/ui/AmountInput';
import { Field, inputClass, selectClass } from '../../lib/ui/Field';
import { WizardSteps } from '../../lib/ui/WizardSteps';
import { Banner } from '../../lib/ui/Banner';
import { Icon } from '../../lib/ui/Icon';
import { potColorVar } from '../../lib/ui/colors';
import { exportFileSchema } from '../../lib/domain/schemas';
import { clampBackupText, describeImportError } from '../../lib/domain/backup';
import { LegalLinks } from '../AppShell';
import { useFormat } from '../../lib/ui/useFormat';

const STEP_COUNT = 8;
/** Schritte 4–7 sind je ein Topf aus `SUGGESTED_POTS`, in derselben Reihenfolge. */
const POT_STEP_START = 4;

const CURRENCIES = [
  { code: 'EUR', label: 'Euro (€)' },
  { code: 'CHF', label: 'Schweizer Franken (CHF)' },
  { code: 'USD', label: 'US-Dollar ($)' },
  { code: 'GBP', label: 'Britisches Pfund (£)' },
];

type Betragsart = 'fest' | 'frei';

interface PotStepState {
  include: boolean;
  /** Limit (Lebensmittel/Hobby) oder Zielbetrag (Urlaub) — bei Haushalt ungenutzt. */
  amountRaw: string;
  /** True, sobald der Nutzer den Betrag oder die Frist selbst geändert hat. */
  touched: boolean;
  /** Nur für „urlaub". */
  targetDate: string;
}

function leererPotState(include: boolean): PotStepState {
  return { include, amountRaw: '', touched: false, targetDate: '' };
}

export function OnboardingWizard() {
  const { repository } = useData();
  const format = useFormat();

  const [step, setStep] = useState(0);
  const [householdName, setHouseholdName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [periodStartDay, setPeriodStartDay] = useState(1);
  const [incomeRaw, setIncomeRaw] = useState('');
  const [betragsart, setBetragsart] = useState<Betragsart>('frei');
  const [potStates, setPotStates] = useState<Record<OnboardingPotKey, PotStepState>>(() => ({
    lebensmittel: leererPotState(true),
    haushalt: leererPotState(true),
    hobby: leererPotState(false),
    urlaub: leererPotState(false),
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const backupRef = useRef<HTMLInputElement>(null);

  const nameValid = householdName.trim().length > 0;
  const incomeCents = parseAmountToCents(incomeRaw);
  const currentSuggestion =
    step >= POT_STEP_START ? SUGGESTED_POTS[step - POT_STEP_START] : undefined;

  function vorschlagCents(key: 'lebensmittel' | 'hobby'): number {
    if (betragsart === 'fest' && incomeCents !== null && incomeCents > 0) {
      return amountFromIncomePercent(incomeCents, INCOME_PERCENT_SUGGESTIONS[key]);
    }
    return SUGGESTED_POTS.find((suggestion) => suggestion.key === key)!.limitCents ?? 0;
  }

  /**
   * Belegt Betrag/Frist eines Topf-Schritts beim Betreten vor — aber nur,
   * solange der Nutzer sie nicht selbst angefasst hat. So bleibt eine Eingabe
   * erhalten, auch wenn „Zurück" die Betragsart oder das Einkommen
   * nachträglich ändert und der Schritt erneut betreten wird.
   */
  function betretePotSchritt(zielSchritt: number) {
    const suggestion =
      zielSchritt >= POT_STEP_START ? SUGGESTED_POTS[zielSchritt - POT_STEP_START] : undefined;
    if (!suggestion) return;

    setPotStates((bisher) => {
      const zustand = bisher[suggestion.key];
      if (zustand.touched) return bisher;
      if (suggestion.key === 'haushalt') return bisher; // kein Betrag, nichts vorzubelegen
      if (suggestion.key === 'urlaub') {
        return {
          ...bisher,
          urlaub: {
            ...zustand,
            amountRaw: zustand.amountRaw || format.moneyPlain(suggestion.goalCents ?? 0),
            targetDate: zustand.targetDate || addMonths(todayIso(), 9),
          },
        };
      }
      return {
        ...bisher,
        [suggestion.key]: {
          ...zustand,
          amountRaw: format.moneyPlain(vorschlagCents(suggestion.key)),
        },
      };
    });
  }

  function weiter() {
    const naechster = step + 1;
    betretePotSchritt(naechster);
    setStep(naechster);
  }

  function zurueck() {
    const vorheriger = step - 1;
    betretePotSchritt(vorheriger);
    setStep(vorheriger);
  }

  function setzeTopf(key: OnboardingPotKey, patch: Partial<PotStepState>) {
    setPotStates((bisher) => ({ ...bisher, [key]: { ...bisher[key], ...patch } }));
  }

  /**
   * Sicherung einlesen, noch vor der Einrichtung.
   *
   * Ohne diesen Weg wäre ein neues Gerät eine Sackgasse: Der Import in den
   * Einstellungen ist erst nach der Einrichtung erreichbar, und eine
   * Einrichtung würde die Sicherung nur überflüssig machen.
   */
  async function restore(file: File) {
    setSaving(true);
    setError(null);
    try {
      const parsed: unknown = JSON.parse(await file.text());
      // Wie beim Import in den Einstellungen: zuerst kürzen, dann prüfen.
      clampBackupText(parsed);
      const validation = exportFileSchema.safeParse(parsed);
      if (!validation.success) {
        setError(describeImportError(validation.error));
        return;
      }
      await repository.restoreFromBackup(validation.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Die Datei konnte nicht gelesen werden.');
    } finally {
      setSaving(false);
      if (backupRef.current) backupRef.current.value = '';
    }
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
        const zustand = potStates[suggestion.key];
        if (!zustand.include) continue;
        const needsLimit = suggestion.kind === 'budget' || suggestion.kind === 'envelope';
        const needsGoal = suggestion.kind === 'goal';
        await repository.createPot({
          name: suggestion.name,
          icon: suggestion.icon,
          color: suggestion.color,
          kind: suggestion.kind,
          carryOver: suggestion.carryOver,
          limitCents: needsLimit ? (parseAmountToCents(zustand.amountRaw) ?? 0) : null,
          goalCents: needsGoal ? (parseAmountToCents(zustand.amountRaw) ?? 0) : null,
          targetDate: needsGoal ? zustand.targetDate : null,
        });
      }

      // Ein Einkommen, das sich jeden Monat wiederholt, ist als Regel richtig
      // aufgehoben — nicht als einzelne Buchung.
      //
      // Beginn ist der Anfang der *laufenden* Periode, nicht heute: Sonst
      // fällt der erste Termin in die nächste Periode, und die Auswertung
      // zeigt direkt nach der Einrichtung „Einnahmen 0 €" — obwohl man das
      // Einkommen gerade eingetragen hat.
      if (incomeCents !== null && incomeCents > 0) {
        await repository.createRecurringRule({
          potId: null,
          kind: 'income',
          amountCents: incomeCents,
          freq: 'monthly',
          interval: 1,
          dayOfMonth: periodStartDay,
          startDate: periodForDate(todayIso(), periodStartDay).start,
          note: 'Einkommen',
        });
      }

      await repository.updateHousehold({ onboardingCompletedAt: nowIso() });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unbekannter Fehler');
      setSaving(false);
    }
  }

  /** Ob der aktuelle Schritt — falls er ein Topf-Schritt ist — weitergehen darf. */
  const currentPotValid = (() => {
    if (!currentSuggestion) return true;
    const zustand = potStates[currentSuggestion.key];
    if (!zustand.include || currentSuggestion.kind === 'category') return true;
    const cents = parseAmountToCents(zustand.amountRaw);
    if (currentSuggestion.kind === 'goal') {
      return (
        cents !== null && cents > 0 && zustand.targetDate !== '' && zustand.targetDate > todayIso()
      );
    }
    return cents !== null && cents > 0;
  })();

  const percent =
    currentSuggestion &&
    (currentSuggestion.key === 'lebensmittel' || currentSuggestion.key === 'hobby')
      ? INCOME_PERCENT_SUGGESTIONS[currentSuggestion.key]
      : null;

  const isLastStep = step === STEP_COUNT - 1;

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

            <div className="border-t border-line pt-5">
              <p className="text-sm text-ink-muted">
                Du hast schon einen Haushalt auf einem anderen Gerät? Dann lies hier die Sicherung
                ein, statt neu anzufangen.
              </p>
              <input
                ref={backupRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void restore(file);
                }}
              />
              <Button
                variant="secondary"
                disabled={saving}
                className="mt-3"
                onClick={() => backupRef.current?.click()}
              >
                {saving ? 'Wird eingelesen …' : 'Sicherung einlesen'}
              </Button>
              {error && (
                <div className="mt-3">
                  <Banner tone="negative" icon={<Icon icon={TriangleAlert} size={18} />}>
                    <span className="whitespace-pre-line">{error}</span>
                  </Banner>
                </div>
              )}
            </div>
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
              <h1 className="text-2xl font-semibold">Regelmäßiges Einkommen?</h1>
              <p className="mt-2 text-sm text-ink-muted">
                Optional. Wird als wiederkehrende Buchung zum {periodStartDay}. angelegt — und ist
                die Grundlage, falls du die nächsten Topf-Beträge als festen Anteil davon setzen
                willst.
              </p>
            </header>
            <AmountInput
              value={incomeRaw}
              onChange={setIncomeRaw}
              label="Betrag pro Periode"
              currencySymbol={currency === 'EUR' ? '€' : currency}
            />
          </section>
        )}

        {step === 3 && (
          <section className="flex flex-col gap-5">
            <header>
              <h1 className="text-2xl font-semibold">Wie sollen die Beträge gesetzt werden?</h1>
              <p className="mt-2 text-sm text-ink-muted">
                Für die vorgeschlagenen Töpfe auf den nächsten Bildschirmen. Beide Wege lassen sich
                je Topf noch anpassen.
              </p>
            </header>
            <fieldset className="flex flex-col gap-2">
              <legend className="sr-only">Betragsart</legend>
              <label
                className={[
                  'flex gap-3 rounded-xl border px-4 py-3',
                  incomeCents === null || incomeCents <= 0
                    ? 'cursor-not-allowed opacity-50'
                    : 'cursor-pointer',
                  betragsart === 'fest'
                    ? 'border-accent bg-accent-subtle'
                    : 'border-line bg-surface',
                ].join(' ')}
              >
                <input
                  type="radio"
                  name="betragsart"
                  value="fest"
                  checked={betragsart === 'fest'}
                  disabled={incomeCents === null || incomeCents <= 0}
                  onChange={() => setBetragsart('fest')}
                  className="mt-1 accent-[var(--accent)]"
                />
                <span className="min-w-0">
                  <span className="block font-medium">Fest — ein Anteil vom Einkommen</span>
                  <span className="mt-0.5 block text-sm text-ink-muted">
                    {incomeCents === null || incomeCents <= 0
                      ? 'Erst ein Einkommen eintragen, dann lässt sich ein fester Schlüssel anwenden.'
                      : `Lebensmittel ${Math.round(INCOME_PERCENT_SUGGESTIONS.lebensmittel * 100)} %, Hobby ${Math.round(INCOME_PERCENT_SUGGESTIONS.hobby * 100)} % vom Einkommen.`}
                  </span>
                </span>
              </label>
              <label
                className={[
                  'flex cursor-pointer gap-3 rounded-xl border px-4 py-3',
                  betragsart === 'frei'
                    ? 'border-accent bg-accent-subtle'
                    : 'border-line bg-surface',
                ].join(' ')}
              >
                <input
                  type="radio"
                  name="betragsart"
                  value="frei"
                  checked={betragsart === 'frei'}
                  onChange={() => setBetragsart('frei')}
                  className="mt-1 accent-[var(--accent)]"
                />
                <span className="min-w-0">
                  <span className="block font-medium">Frei — selbst eingeben</span>
                  <span className="mt-0.5 block text-sm text-ink-muted">
                    Vorschläge mit runden Beträgen zum Start, jederzeit änderbar.
                  </span>
                </span>
              </label>
            </fieldset>
          </section>
        )}

        {currentSuggestion && (
          <section className="flex flex-col gap-5">
            <header className="flex items-start gap-3">
              <span
                aria-hidden
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-xl"
                style={{
                  background: `color-mix(in oklch, ${potColorVar(currentSuggestion.color)} 18%, transparent)`,
                }}
              >
                {currentSuggestion.icon}
              </span>
              <div>
                <h1 className="text-2xl font-semibold">{currentSuggestion.name}</h1>
                <p className="mt-1 text-sm text-ink-muted">
                  {potKindPreset(currentSuggestion.kind).label} —{' '}
                  {potKindPreset(currentSuggestion.kind).explanation}
                </p>
              </div>
            </header>

            <button
              type="button"
              onClick={() =>
                setzeTopf(currentSuggestion.key, {
                  include: !potStates[currentSuggestion.key].include,
                })
              }
              aria-pressed={potStates[currentSuggestion.key].include}
              className={[
                'flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left',
                potStates[currentSuggestion.key].include
                  ? 'border-accent bg-accent-subtle'
                  : 'border-line bg-surface',
              ].join(' ')}
            >
              <span className="font-medium">Diesen Topf anlegen</span>
              <span
                aria-hidden
                className={
                  potStates[currentSuggestion.key].include ? 'text-accent' : 'text-ink-muted'
                }
              >
                {potStates[currentSuggestion.key].include ? '✓' : '+'}
              </span>
            </button>

            {potStates[currentSuggestion.key].include && (
              <>
                {(currentSuggestion.kind === 'budget' || currentSuggestion.kind === 'envelope') && (
                  <div className="flex flex-col gap-2">
                    <AmountInput
                      value={potStates[currentSuggestion.key].amountRaw}
                      onChange={(raw) =>
                        setzeTopf(currentSuggestion.key, { amountRaw: raw, touched: true })
                      }
                      label="Betrag pro Periode"
                      currencySymbol={currency === 'EUR' ? '€' : currency}
                      large
                    />
                    <p className="text-sm text-ink-muted">
                      {betragsart === 'fest' && percent !== null
                        ? `${Math.round(percent * 100)} % deines Einkommens.`
                        : 'Vorschlag, anpassbar.'}
                    </p>
                  </div>
                )}

                {currentSuggestion.kind === 'category' && (
                  <p className="text-sm text-ink-muted">
                    Kein Limit — zeigt nur, was tatsächlich ausgegeben wurde.
                  </p>
                )}

                {currentSuggestion.kind === 'goal' && (
                  <div className="flex flex-col gap-4">
                    <AmountInput
                      value={potStates[currentSuggestion.key].amountRaw}
                      onChange={(raw) =>
                        setzeTopf(currentSuggestion.key, { amountRaw: raw, touched: true })
                      }
                      label="Sparziel-Betrag"
                      currencySymbol={currency === 'EUR' ? '€' : currency}
                      large
                    />
                    <Field label="Bis wann?">
                      {(props) => (
                        <input
                          {...props}
                          type="date"
                          className={inputClass}
                          value={potStates[currentSuggestion.key].targetDate}
                          onChange={(event) =>
                            setzeTopf(currentSuggestion.key, {
                              targetDate: event.target.value,
                              touched: true,
                            })
                          }
                          min={todayIso()}
                        />
                      )}
                    </Field>
                  </div>
                )}
              </>
            )}

            {isLastStep && (
              <>
                <Banner icon={<Icon icon={Save} size={18} />}>
                  Alle Daten bleiben auf diesem Gerät — ohne Konto, ohne Server. Sichere sie in den
                  Einstellungen als Datei, bevor du das Gerät wechselst.
                </Banner>
                {error && (
                  <Banner tone="negative" icon={<Icon icon={TriangleAlert} size={18} />}>
                    {error}
                  </Banner>
                )}
              </>
            )}
          </section>
        )}
      </div>

      <footer className="mt-8 flex gap-3">
        {step > 0 && (
          <Button variant="ghost" size="lg" onClick={zurueck}>
            Zurück
          </Button>
        )}
        {!isLastStep ? (
          <Button
            variant="primary"
            size="lg"
            block
            disabled={(step === 0 && !nameValid) || !currentPotValid}
            onClick={weiter}
          >
            Weiter
          </Button>
        ) : (
          <Button
            variant="primary"
            size="lg"
            block
            disabled={saving || !currentPotValid}
            onClick={() => void finish()}
          >
            {saving ? 'Wird angelegt …' : 'Los geht’s'}
          </Button>
        )}
      </footer>

      {/* Auch vor der Einrichtung erreichbar — dafür lässt AppGate diese Routen durch. */}
      <div className="mt-6 text-xs text-ink-muted">
        <LegalLinks />
      </div>
    </div>
  );
}
