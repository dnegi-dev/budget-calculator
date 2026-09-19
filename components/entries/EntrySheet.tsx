'use client';

/**
 * Buchung erfassen — der Weg, der täglich mehrfach gegangen wird.
 *
 * Drei Bildschirme: Betrag, Topf, Details. Gespeichert werden kann ab dem
 * ersten, denn eine Ausgabe ohne Topf ist besser erfasst als eine, die man aus
 * Bequemlichkeit weggelassen hat.
 *
 * Bei Einnahmen wird der Topf-Schritt übersprungen: Einnahmen laufen in der
 * Regel auf den Haushalt, nicht in einen Ausgabentopf. Dasselbe gilt für
 * Ausgaben, wenn „Topf beim Erfassen abfragen" aus ist — dann ist der
 * Standardtopf vorbelegt und in den Details änderbar. Sichtbar bleibt er
 * trotzdem: Ein stumm gesetzter Topf wäre eine Überraschung beim Auswerten.
 */

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { useCan } from '../../lib/auth/provider';
import { useData } from '../../lib/data/provider';
import { todayIso } from '../../lib/domain/dates';
import { canDeleteEntryDirectly } from '../../lib/domain/ledger';
import { useDeleteButton } from '../../lib/prefs/useDevicePref';
import { parseAmountToCents } from '../../lib/domain/money';
import { TEXT_LIMITS } from '../../lib/domain/schemas';
import type { Entry, EntryKind, Pot } from '../../lib/domain/types';
import { AmountInput } from '../../lib/ui/AmountInput';
import { Button } from '../../lib/ui/Button';
import { Field, inputClass, textareaClass } from '../../lib/ui/Field';
import { SegmentedControl } from '../../lib/ui/SegmentedControl';
import { Sheet } from '../../lib/ui/Sheet';
import { potColorVar } from '../../lib/ui/colors';
import { useFormat } from '../../lib/ui/useFormat';
import { collectTags } from '../../lib/domain/tags';
import { ReceiptPicker } from '../receipts/ReceiptPicker';
import { TagInput } from './TagInput';
import { ReceiptImportSheet } from '../receipts/ReceiptImportSheet';

type Step = 'amount' | 'pot' | 'details';

export interface EntrySheetProps {
  open: boolean;
  onClose: () => void;
  pots: readonly Pot[];
  /** Vorbelegter Topf, wenn aus einem Topf-Detail heraus gebucht wird. */
  defaultPotId?: string | null;
  defaultKind?: EntryKind;
  /**
   * Die Art wurde schon außerhalb bestimmt (etwa im schwebenden Knopf) und
   * wird im ersten Schritt nicht noch einmal abgefragt.
   */
  lockKind?: boolean;
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
  lockKind = false,
  entry = null,
}: Omit<EntrySheetProps, 'open'>) {
  const { repository, snapshot } = useData();
  const format = useFormat();
  const can = useCan();
  const loeschKnopf = useDeleteButton();
  const editing = entry !== null;

  const household = snapshot.household;
  /**
   * Fehlt der Haushalt (theoretisch: das Sheet steht hinter `AppGate`), gilt
   * das bisherige Verhalten — fragen, keine Tags.
   */
  const askForPot = household?.askForPot ?? true;
  const tagsEnabled = household?.tagsEnabled ?? false;
  const fallbackPotId = household?.defaultPotId ?? null;

  // Nicht von den Tags dieser Buchung abhängig: Die Vorschlagsliste soll nicht
  // springen, während man tippt.
  const vorschlaege = useMemo(
    () => collectTags(snapshot.entries).map((usage) => usage.tag),
    [snapshot.entries],
  );

  const [step, setStep] = useState<Step>('amount');
  const [kind, setKind] = useState<EntryKind>(entry?.kind ?? defaultKind);
  const [amountRaw, setAmountRaw] = useState(() =>
    entry ? format.moneyPlain(entry.amountCents) : '',
  );
  const [potId, setPotId] = useState<string | null>(() => {
    if (entry) return entry.potId;
    // Ein Topf, aus dessen Detailseite heraus gebucht wird, gewinnt immer.
    if (defaultPotId !== null) return defaultPotId;
    return askForPot ? null : fallbackPotId;
  });
  const [tags, setTags] = useState<string[]>(entry?.tags ?? []);
  const [date, setDate] = useState(entry?.date ?? todayIso());
  const [merchant, setMerchant] = useState(entry?.merchant ?? '');
  const [bonDatei, setBonDatei] = useState<File | null>(null);
  const bonRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState(entry?.note ?? '');
  const [savedEntryId, setSavedEntryId] = useState<string | null>(entry?.id ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Zweistufig: Ein Klick fragt nur, wie in der Einkaufsansicht. */
  const [fragtLoeschen, setFragtLoeschen] = useState(false);

  /** Buchungen aus einem Bon: Betrag gesperrt, Weg zum Einkauf daneben. */
  const ausEinkauf = entry?.purchaseId != null;

  /**
   * Der zweite Weg zum Löschen — der erste ist das Wischen in der Liste, und
   * das ist für Tastatur und Screenreader unerreichbar. Deshalb ist dieser
   * Knopf nicht bloß Bequemlichkeit.
   *
   * Nur beim Bearbeiten: An einer Buchung, die es noch nicht gibt, ist
   * nichts zu löschen.
   */
  const darfLoeschen =
    editing &&
    loeschKnopf &&
    can('entry.edit.any') &&
    entry !== null &&
    canDeleteEntryDirectly(entry);

  async function loeschen() {
    if (!entry) return;
    setSaving(true);
    setError(null);
    try {
      await repository.deleteEntry(entry.id);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unbekannter Fehler');
      setSaving(false);
    }
  }

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
        tags,
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
  /** Ob der Topf-Schritt zwischen Betrag und Details liegt. */
  const potStepActive = kind === 'expense' && askForPot;

  async function goToDetails() {
    if (potStepActive && step === 'amount') {
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
              onClick={() => setStep(step === 'details' && potStepActive ? 'pot' : 'amount')}
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
          {!editing && !lockKind && (
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
            readOnly={ausEinkauf}
          />
          {/*
            Der Betrag einer Bon-Buchung kommt aus den Posten. Ihn hier zu
            ändern hieße, einen Wert zu setzen, den das nächste Umhängen eines
            Postens still überschreibt — ein unsichtbarer Fehler. Der Weg
            dahin steht daneben.
          */}
          {ausEinkauf && (
            <p className="text-sm text-ink-muted">
              Der Betrag kommt aus den Posten des Bons, und gelöscht wird diese Buchung über den
              Einkauf.{' '}
              <Link
                href={`/buchungen/einkauf?einkauf=${entry?.purchaseId}`}
                className="text-accent hover:underline"
                onClick={onClose}
              >
                Einkauf ansehen
              </Link>
            </p>
          )}
          {selectedPot && (
            <p className="text-sm text-ink-muted">
              Wird auf „{selectedPot.name}“ gebucht.{' '}
              {potStepActive ? 'Im nächsten Schritt änderbar.' : 'In den Details änderbar.'}
            </p>
          )}

          {/*
            Der Bon-Import sitzt hier und nicht beim Beleg-Anhängen in Schritt
            drei: Dort steht der Betrag längst, und der ist genau das, was aus
            dem Bon kommen soll. Nur bei einer neuen Buchung — eine bestehende
            aus einem Bon zu überschreiben wäre keine Hilfe.
          */}
          {!editing && (
            <div className="border-t border-line pt-4">
              <input
                ref={bonRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(event) => {
                  const datei = event.target.files?.[0];
                  if (datei) setBonDatei(datei);
                  event.target.value = '';
                }}
              />
              <button
                type="button"
                className="text-sm text-accent hover:underline"
                onClick={() => bonRef.current?.click()}
              >
                Aus PDF-Bon einlesen →
              </button>
              <p className="mt-1 text-xs text-ink-muted">
                Liest Posten und Summe aus einem digitalen Kassenbon. Ein Foto lässt sich noch nicht
                auswerten.
              </p>
            </div>
          )}

          {/*
            Löschen steht im **ersten** Schritt und nicht bei den Details:
            Wer eine bestehende Buchung öffnet, landet hier. Zwei Klicks
            „Weiter" vor das Löschen zu legen wäre für den Weg, der die
            Wischgeste für Tastatur und Screenreader ersetzt, zu weit.

            Eine Buchung aus einem Bon steht nicht zur Wahl — ihr Weg führt
            über den Einkauf, und der Satz dazu steht schon oben.
          */}
          {darfLoeschen && (
            <div className="border-t border-line pt-4">
              {fragtLoeschen ? (
                <div className="flex flex-wrap items-center gap-3">
                  <p className="w-full text-sm text-ink-muted">
                    Wirklich löschen? Belege dieser Buchung gehen mit — das lässt sich nicht
                    rückgängig machen.
                  </p>
                  <Button variant="danger" disabled={saving} onClick={() => void loeschen()}>
                    Ja, entfernen
                  </Button>
                  <Button variant="ghost" onClick={() => setFragtLoeschen(false)}>
                    Abbrechen
                  </Button>
                </div>
              ) : (
                <Button variant="danger" onClick={() => setFragtLoeschen(true)}>
                  Buchung löschen
                </Button>
              )}
            </div>
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
          {kind === 'expense' && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5">
              <span className="min-w-0 truncate text-sm">
                {selectedPot ? (
                  <>
                    <span aria-hidden>{selectedPot.icon} </span>
                    {selectedPot.name}
                  </>
                ) : (
                  <span className="text-ink-muted">Ohne Topf</span>
                )}
              </span>
              <Button variant="ghost" onClick={() => setStep('pot')}>
                Topf ändern
              </Button>
            </div>
          )}

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
                maxLength={TEXT_LIMITS.merchant}
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
                maxLength={TEXT_LIMITS.note}
              />
            )}
          </Field>

          {tagsEnabled && <TagInput tags={tags} onChange={setTags} suggestions={vorschlaege} />}

          {savedEntryId && <ReceiptPicker entryId={savedEntryId} />}
        </div>
      )}

      {error && <p className="mt-4 text-sm text-negative">{error}</p>}

      {/*
        Liegt im Baum dieses Sheets und damit darüber. Nach dem Buchen
        schließen beide: Der Bon hat die Buchungen schon angelegt, das
        Formular dahinter hätte nichts mehr zu tun.
      */}
      {bonDatei && (
        <ReceiptImportSheet
          file={bonDatei}
          pots={pots}
          onClose={() => setBonDatei(null)}
          onImported={() => {
            setBonDatei(null);
            onClose();
          }}
        />
      )}
    </Sheet>
  );
}
