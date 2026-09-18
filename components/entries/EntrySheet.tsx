'use client';

/**
 * Buchung erfassen — der Weg, der täglich mehrfach gegangen wird.
 *
 * Drei Bildschirme: Betrag, Topf, Details. Gespeichert werden kann ab dem
 * ersten, denn eine Ausgabe ohne Topf ist besser erfasst als eine, die man aus
 * Bequemlichkeit weggelassen hat.
 *
 * Bei Einnahmen wird der Topf-Schritt übersprungen: Einnahmen laufen in der
 * Regel auf den Haushalt, nicht in einen Ausgabentopf.
 */

import { useState } from 'react';
import { useData } from '../../lib/data/provider';
import { todayIso } from '../../lib/domain/dates';
import { parseAmountToCents } from '../../lib/domain/money';
import type { Entry, EntryKind, Pot } from '../../lib/domain/types';
import { AmountInput } from '../../lib/ui/AmountInput';
import { Button } from '../../lib/ui/Button';
import { Field, inputClass, textareaClass } from '../../lib/ui/Field';
import { SegmentedControl } from '../../lib/ui/SegmentedControl';
import { Sheet } from '../../lib/ui/Sheet';
import { potColorVar } from '../../lib/ui/colors';
import { useFormat } from '../../lib/ui/useFormat';
import { ReceiptPicker } from '../receipts/ReceiptPicker';

type Step = 'amount' | 'pot' | 'details';

export interface EntrySheetProps {
  open: boolean;
  onClose: () => void;
  pots: readonly Pot[];
  /** Vorbelegter Topf, wenn aus einem Topf-Detail heraus gebucht wird. */
  defaultPotId?: string | null;
  defaultKind?: EntryKind;
  /** Gesetzt = Bearbeiten statt Neuanlage. */
  entry?: Entry | null;
}

/**
 * Hülle: rendert das Formular erst, wenn das Sheet offen ist.
 *
 * Damit entsteht bei jedem Öffnen eine frische Instanz, und der Zustand kommt
 * aus den `useState`-Initialisierern. Die Alternative — ein Effect, der beim
 * Öffnen alle Felder zurücksetzt — löst eine Kaskade von Re-Renders aus und
 * vergisst bei jeder neuen Eingabe leicht ein Feld.
 */
export function EntrySheet({ open, ...props }: EntrySheetProps) {
  if (!open) return null;
  return <EntryForm key={props.entry?.id ?? 'neu'} {...props} />;
}

function EntryForm({
  onClose,
  pots,
  defaultPotId = null,
  defaultKind = 'expense',
  entry = null,
}: Omit<EntrySheetProps, 'open'>) {
  const { repository } = useData();
  const format = useFormat();
  const editing = entry !== null;

  const [step, setStep] = useState<Step>('amount');
  const [kind, setKind] = useState<EntryKind>(entry?.kind ?? defaultKind);
  const [amountRaw, setAmountRaw] = useState(() =>
    entry ? format.moneyPlain(entry.amountCents) : '',
  );
  const [potId, setPotId] = useState<string | null>(entry ? entry.potId : defaultPotId);
  const [date, setDate] = useState(entry?.date ?? todayIso());
  const [merchant, setMerchant] = useState(entry?.merchant ?? '');
  const [note, setNote] = useState(entry?.note ?? '');
  const [savedEntryId, setSavedEntryId] = useState<string | null>(entry?.id ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountCents = parseAmountToCents(amountRaw);
  const amountValid = amountCents !== null && amountCents > 0;
  const selectedPot = pots.find((pot) => pot.id === potId) ?? null;

  async function persist(): Promise<string | null> {
    if (!amountValid) return null;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        potId,
        kind,
        amountCents,
        date,
        note: note.trim() || null,
        merchant: merchant.trim() || null,
      };

      if (savedEntryId) {
        await repository.updateEntry(savedEntryId, payload);
        return savedEntryId;
      }
      const created = await repository.createEntry(payload);
      setSavedEntryId(created.id);
      return created.id;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unbekannter Fehler');
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function saveAndClose() {
    const id = await persist();
    if (id !== null) onClose();
  }

  /** Vor dem Beleg-Upload muss die Buchung existieren — ein Beleg braucht etwas zu belegen. */
  async function goToDetails() {
    if (kind === 'expense' && step === 'amount') {
      setStep('pot');
      return;
    }
    const id = await persist();
    if (id !== null) setStep('details');
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={
        editing
          ? 'Buchung bearbeiten'
          : kind === 'expense'
            ? 'Ausgabe erfassen'
            : 'Einnahme erfassen'
      }
      footer={
        <div className="flex gap-3">
          {step !== 'amount' && (
            <Button
              variant="ghost"
              onClick={() =>
                setStep(step === 'details' ? (kind === 'expense' ? 'pot' : 'amount') : 'amount')
              }
            >
              Zurück
            </Button>
          )}
          {step === 'details' ? (
            <Button variant="primary" block disabled={saving} onClick={() => void saveAndClose()}>
              {saving ? 'Wird gespeichert …' : 'Fertig'}
            </Button>
          ) : (
            <>
              <Button
                variant="primary"
                block
                disabled={!amountValid || saving}
                onClick={() => void goToDetails()}
              >
                Weiter
              </Button>
              <Button
                variant="secondary"
                disabled={!amountValid || saving}
                onClick={() => void saveAndClose()}
              >
                Speichern
              </Button>
            </>
          )}
        </div>
      }
    >
      {step === 'amount' && (
        <div className="flex flex-col gap-5">
          {!editing && (
            <SegmentedControl
              label="Art der Buchung"
              value={kind}
              onChange={(next) => setKind(next)}
              options={[
                { value: 'expense', label: 'Ausgabe' },
                { value: 'income', label: 'Einnahme' },
              ]}
            />
          )}
          <AmountInput
            value={amountRaw}
            onChange={setAmountRaw}
            label="Betrag"
            currencySymbol={format.currencySymbol}
            large
            autoFocus
          />
          {selectedPot && (
            <p className="text-sm text-ink-muted">
              Wird auf „{selectedPot.name}“ gebucht. Im nächsten Schritt änderbar.
            </p>
          )}
        </div>
      )}

      {step === 'pot' && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-ink-muted">Auf welchen Topf?</p>
          <div className="grid grid-cols-3 gap-2">
            {pots.map((pot) => {
              const selected = pot.id === potId;
              return (
                <button
                  key={pot.id}
                  type="button"
                  onClick={() => setPotId(pot.id)}
                  aria-pressed={selected}
                  className={[
                    'flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3',
                    selected ? 'border-accent bg-accent-subtle' : 'border-line bg-surface',
                  ].join(' ')}
                >
                  <span
                    aria-hidden
                    className="grid h-9 w-9 place-items-center rounded-lg text-lg"
                    style={{
                      background: `color-mix(in oklch, ${potColorVar(pot.color)} 18%, transparent)`,
                    }}
                  >
                    {pot.icon}
                  </span>
                  <span className="w-full truncate text-center text-xs">{pot.name}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setPotId(null)}
              aria-pressed={potId === null}
              className={[
                'flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3',
                potId === null ? 'border-accent bg-accent-subtle' : 'border-line bg-surface',
              ].join(' ')}
            >
              <span
                aria-hidden
                className="grid h-9 w-9 place-items-center rounded-lg bg-subtle text-lg"
              >
                –
              </span>
              <span className="w-full truncate text-center text-xs">Kein Topf</span>
            </button>
          </div>
          {pots.length === 0 && (
            <p className="text-sm text-ink-muted">
              Noch keine Töpfe angelegt. Die Buchung wird ohne Topf gespeichert und kann später
              zugeordnet werden.
            </p>
          )}
        </div>
      )}

      {step === 'details' && (
        <div className="flex flex-col gap-4">
          <Field label="Datum">
            {(props) => (
              <input
                {...props}
                type="date"
                className={inputClass}
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            )}
          </Field>

          <Field label="Wo?" hint="Optional — hilft beim Suchen.">
            {(props) => (
              <input
                {...props}
                className={inputClass}
                value={merchant}
                onChange={(event) => setMerchant(event.target.value)}
                placeholder="z. B. Supermarkt"
                autoComplete="off"
              />
            )}
          </Field>

          <Field label="Notiz">
            {(props) => (
              <textarea
                {...props}
                className={textareaClass}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Optional"
              />
            )}
          </Field>

          {savedEntryId && <ReceiptPicker entryId={savedEntryId} />}
        </div>
      )}

      {error && <p className="mt-4 text-sm text-negative">{error}</p>}
    </Sheet>
  );
}
