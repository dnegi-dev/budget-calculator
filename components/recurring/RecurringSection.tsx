'use client';

/**
 * Wiederkehrende Buchungen.
 *
 * Miete, Abos, Gehalt — Dinge, die man nicht jeden Monat neu eintippen will.
 * Die Regeln stehen in den Einstellungen, weil sie einmal angelegt und dann
 * jahrelang nicht mehr angefasst werden; der Alltag findet auf der Startseite
 * statt.
 *
 * Erzeugt werden die Buchungen beim App-Start (siehe AppGate). Ohne Server ist
 * das der einzige Zeitpunkt — eine Regel „am 1.“ erzeugt ihre Buchung also,
 * wenn die App nach dem 1. das erste Mal geöffnet wird, mit dem korrekten
 * Datum des 1.
 */

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useCan } from '../../lib/auth/provider';
import { useData, useSnapshot } from '../../lib/data/provider';
import { todayIso } from '../../lib/domain/dates';
import { entryKindLabel } from '../../lib/domain/entry-kinds';
import { parseAmountToCents } from '../../lib/domain/money';
import { TEXT_LIMITS } from '../../lib/domain/schemas';
import { describeRecurrence, nextOccurrenceAfter } from '../../lib/domain/recurrence';
import type { EntryKind, Frequency, RecurringRule } from '../../lib/domain/types';
import { AmountInput } from '../../lib/ui/AmountInput';
import { Button } from '../../lib/ui/Button';
import { Card, CardHeader } from '../../lib/ui/Card';
import { EmptyState } from '../../lib/ui/EmptyState';
import { Icon } from '../../lib/ui/Icon';
import { Field, inputClass, selectClass } from '../../lib/ui/Field';
import { SegmentedControl } from '../../lib/ui/SegmentedControl';
import { Sheet } from '../../lib/ui/Sheet';
import { WEEKDAY_LABELS } from '../../lib/domain/recurrence';
import { useFormat } from '../../lib/ui/useFormat';

/**
 * Die Liste der Regeln.
 *
 * `rules` kommt von der Seite und ist schon durchsucht und gefiltert — die
 * Leiste darüber hält Suchbegriff und Filter, weil sie klebt und die Karte
 * nicht. Ohne `rules` (etwa in einem anderen Zusammenhang) stehen alle
 * Regeln da.
 *
 * Die Überschrift trägt die Anzahl und nicht den Namen: Der steht in der
 * Leiste eine Zeile höher, und zweimal dasselbe Wort ist keine Gliederung.
 */
export function RecurringSection({
  rules,
  filtering = false,
  defaultPotId = null,
}: {
  rules?: readonly RecurringRule[];
  /** Ob gerade gesucht oder gefiltert wird — dann lautet der leere Zustand anders. */
  filtering?: boolean;
  /**
   * Vorbelegter Topf beim Anlegen — gesetzt, wenn die Liste in den
   * Einstellungen **eines** Topfes steht. Dort nach dem Topf zu fragen, den
   * man gerade offen hat, wäre eine Frage ohne Antwortmöglichkeit.
   */
  defaultPotId?: string | null;
} = {}) {
  const snapshot = useSnapshot();
  const { repository } = useData();
  const format = useFormat();
  const can = useCan();

  const [editing, setEditing] = useState<RecurringRule | null>(null);
  const [creating, setCreating] = useState(false);

  const sichtbar = rules ?? snapshot.recurringRules;
  const potsById = new Map(snapshot.pots.map((pot) => [pot.id, pot]));
  const allowed = can('recurring.manage');

  return (
    <Card>
      <CardHeader
        title={`${sichtbar.length} Regel${sichtbar.length === 1 ? '' : 'n'}`}
        action={
          allowed ? (
            <Button variant="ghost" size="sm" onClick={() => setCreating(true)}>
              + Regel
            </Button>
          ) : undefined
        }
      />

      {sichtbar.length === 0 ? (
        <EmptyState
          icon={<Icon icon={RefreshCw} size={30} />}
          title={filtering ? 'Keine Regel passt' : 'Keine Regeln'}
          hint={
            filtering
              ? 'Zu Suche und Filtern gibt es keine Regel.'
              : 'Lege Miete, Abos oder das Gehalt einmal an — die Buchungen entstehen dann automatisch.'
          }
          action={
            allowed && !filtering ? (
              <Button variant="primary" onClick={() => setCreating(true)}>
                Erste Regel anlegen
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {sichtbar.map((rule) => {
            const pot = rule.potId ? potsById.get(rule.potId) : null;
            const next = rule.paused
              ? null
              : nextOccurrenceAfter(rule, rule.lastMaterializedDate ?? todayIso());
            return (
              <li key={rule.id} className="flex items-center gap-3 px-4 py-3">
                <span
                  aria-hidden
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-subtle"
                >
                  {pot?.icon ?? (rule.kind === 'income' ? '↓' : '↻')}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {rule.note || pot?.name || entryKindLabel(rule.kind, pot ?? null)}
                  </p>
                  <p className="truncate text-xs text-ink-muted">
                    {describeRecurrence(rule)}
                    {pot ? ` · ${pot.name}` : ''}
                    {rule.paused ? ' · pausiert' : next ? ` · nächste am ${format.day(next)}` : ''}
                  </p>
                </div>
                <span
                  className={`tabular shrink-0 font-semibold ${rule.kind === 'income' ? 'text-positive' : ''}`}
                >
                  {rule.kind === 'income' ? '+' : '−'}
                  {format.money(rule.amountCents)}
                </span>
                {allowed && (
                  <Button variant="ghost" size="sm" onClick={() => setEditing(rule)}>
                    Ändern
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {(creating || editing) && (
        <RecurringSheet
          rule={editing}
          defaultPotId={defaultPotId}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onDelete={
            editing
              ? async () => {
                  await repository.deleteRecurringRule(editing.id);
                  setEditing(null);
                }
              : undefined
          }
        />
      )}
    </Card>
  );
}

function RecurringSheet({
  rule,
  defaultPotId = null,
  onClose,
  onDelete,
}: {
  rule: RecurringRule | null;
  defaultPotId?: string | null;
  onClose: () => void;
  onDelete?: () => Promise<void>;
}) {
  const { repository, snapshot } = useData();
  const format = useFormat();

  const [kind, setKind] = useState<EntryKind>(rule?.kind ?? 'expense');
  const [amountRaw, setAmountRaw] = useState(rule ? format.moneyPlain(rule.amountCents) : '');
  // Beim Bearbeiten gewinnt die Regel, beim Anlegen der Topf der Seite.
  const [potId, setPotId] = useState<string>(rule?.potId ?? defaultPotId ?? '');
  const [note, setNote] = useState(rule?.note ?? '');
  const [freq, setFreq] = useState<Frequency>(rule?.freq ?? 'monthly');
  const [interval, setInterval] = useState(rule?.interval ?? 1);
  const [dayOfMonth, setDayOfMonth] = useState(rule?.dayOfMonth ?? 1);
  const [weekday, setWeekday] = useState(rule?.weekday ?? 1);
  const [month, setMonth] = useState(rule?.month ?? 1);
  const [startDate, setStartDate] = useState(rule?.startDate ?? todayIso());
  const [paused, setPaused] = useState(rule?.paused ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountCents = parseAmountToCents(amountRaw);
  const valid = amountCents !== null && amountCents > 0;
  const selectedPot = potId === '' ? null : (snapshot.pots.find((pot) => pot.id === potId) ?? null);

  async function save() {
    if (!valid) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        potId: potId === '' ? null : potId,
        kind,
        amountCents,
        note: note.trim() || null,
        freq,
        interval,
        dayOfMonth: freq === 'weekly' ? null : dayOfMonth,
        weekday: freq === 'weekly' ? weekday : null,
        month: freq === 'yearly' ? month : null,
        startDate,
        paused,
      };
      if (rule) await repository.updateRecurringRule(rule.id, payload);
      else await repository.createRecurringRule(payload);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unbekannter Fehler');
      setSaving(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={rule ? 'Regel ändern' : 'Neue Regel'}
      description="Erzeugt Buchungen automatisch, sobald ein Termin fällig ist."
      footer={
        <div className="flex gap-3">
          {onDelete && (
            <Button variant="danger" onClick={() => void onDelete()}>
              Löschen
            </Button>
          )}
          <Button variant="primary" block disabled={!valid || saving} onClick={() => void save()}>
            {saving ? 'Wird gespeichert …' : 'Speichern'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <SegmentedControl
          label="Art"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'expense', label: entryKindLabel('expense', selectedPot) },
            { value: 'income', label: entryKindLabel('income', selectedPot) },
          ]}
        />

        <AmountInput
          value={amountRaw}
          onChange={setAmountRaw}
          label="Betrag"
          currencySymbol={format.currencySymbol}
        />

        <Field label="Bezeichnung" hint="Erscheint an jeder erzeugten Buchung.">
          {(props) => (
            <input
              {...props}
              className={inputClass}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="z. B. Miete"
              maxLength={TEXT_LIMITS.note}
            />
          )}
        </Field>

        <Field label="Topf">
          {(props) => (
            <select
              {...props}
              className={selectClass}
              value={potId}
              onChange={(event) => setPotId(event.target.value)}
            >
              <option value="">Kein Topf</option>
              {snapshot.pots
                .filter(
                  (pot) => (pot.archivedAt === null && pot.lockedAt === null) || pot.id === potId,
                )
                .map((pot) => (
                  <option key={pot.id} value={pot.id}>
                    {pot.icon} {pot.name}
                  </option>
                ))}
            </select>
          )}
        </Field>

        <Field label="Rhythmus">
          {(props) => (
            <select
              {...props}
              className={selectClass}
              value={freq}
              onChange={(event) => setFreq(event.target.value as Frequency)}
            >
              <option value="weekly">Wöchentlich</option>
              <option value="monthly">Monatlich</option>
              <option value="yearly">Jährlich</option>
            </select>
          )}
        </Field>

        <Field label="Jede(n)" hint={interval === 1 ? undefined : `Nur jede ${interval}. Periode.`}>
          {(props) => (
            <select
              {...props}
              className={selectClass}
              value={interval}
              onChange={(event) => setInterval(Number(event.target.value))}
            >
              {[1, 2, 3, 4, 6, 12].map((value) => (
                <option key={value} value={value}>
                  {value === 1 ? 'jede Periode' : `jede ${value}.`}
                </option>
              ))}
            </select>
          )}
        </Field>

        {freq === 'weekly' ? (
          <Field label="Wochentag">
            {(props) => (
              <select
                {...props}
                className={selectClass}
                value={weekday}
                onChange={(event) => setWeekday(Number(event.target.value))}
              >
                {WEEKDAY_LABELS.map((label, index) => (
                  <option key={label} value={index}>
                    {label}
                  </option>
                ))}
              </select>
            )}
          </Field>
        ) : (
          <>
            {freq === 'yearly' && (
              <Field label="Monat">
                {(props) => (
                  <select
                    {...props}
                    className={selectClass}
                    value={month}
                    onChange={(event) => setMonth(Number(event.target.value))}
                  >
                    {Array.from({ length: 12 }, (_, index) => index + 1).map((value) => (
                      <option key={value} value={value}>
                        {new Intl.DateTimeFormat(format.locale, {
                          month: 'long',
                          timeZone: 'UTC',
                        }).format(new Date(Date.UTC(2026, value - 1, 1)))}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            )}
            <Field
              label="Tag im Monat"
              hint={
                dayOfMonth >= 29
                  ? 'In kürzeren Monaten wird auf den letzten Tag vorgezogen.'
                  : undefined
              }
            >
              {(props) => (
                <select
                  {...props}
                  className={selectClass}
                  value={dayOfMonth}
                  onChange={(event) => setDayOfMonth(Number(event.target.value))}
                >
                  {Array.from({ length: 31 }, (_, index) => index + 1).map((value) => (
                    <option key={value} value={value}>
                      {value}.
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </>
        )}

        <Field label="Beginnt am" hint="Termine vor diesem Datum werden nicht erzeugt.">
          {(props) => (
            <input
              {...props}
              type="date"
              className={inputClass}
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          )}
        </Field>

        <label className="flex items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={paused}
            onChange={(event) => setPaused(event.target.checked)}
            className="accent-[var(--accent)]"
          />
          Pausiert — erzeugt vorläufig keine Buchungen
        </label>

        {error && <p className="text-sm text-negative">{error}</p>}
      </div>
    </Sheet>
  );
}
