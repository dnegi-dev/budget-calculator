'use client';

/**
 * Einen digitalen Kassenbon (PDF) einlesen und auf Töpfe verteilen.
 *
 * Der Ablauf ist absichtlich zweistufig: Erst zeigen, was erkannt wurde, dann
 * buchen. Wer einen Bon einliest, gibt Kontrolle ab — die Vorschau gibt sie
 * zurück, bevor Daten entstehen.
 *
 * Wie viel Vertrauen angebracht ist, steht dabei: „aus dem Beleg selbst"
 * (angehängte `ekabs.json`), „erkannt, Posten gehen auf die Summe auf" oder
 * „Summe unklar" — im letzten Fall gibt es gar keine Postenliste, nur Summe
 * und Datum. Die Regel dahinter steht in `lib/domain/receipt-parse.ts`.
 */

import { useEffect, useState } from 'react';
import { useCan } from '../../lib/auth/provider';
import { useData } from '../../lib/data/provider';
import { newId } from '../../lib/domain/ids';
import { todayIso } from '../../lib/domain/dates';
import {
  groupItemsByPot,
  normalizeKeyword,
  parseEkabs,
  parseTextLines,
  suggestPot,
  type ParsedReceipt,
} from '../../lib/domain/receipt-parse';
import { TEXT_LIMITS } from '../../lib/domain/schemas';
import type { Pot } from '../../lib/domain/types';
import { extractPdf, PdfReadError } from '../../lib/pdf/extract';
import { Banner } from '../../lib/ui/Banner';
import { Button } from '../../lib/ui/Button';
import { Sheet } from '../../lib/ui/Sheet';
import { selectClass } from '../../lib/ui/Field';
import { useFormat } from '../../lib/ui/useFormat';

const HERKUNFT: Record<ParsedReceipt['quality'], string> = {
  exakt: 'Aus dem Beleg selbst gelesen.',
  geprüft: 'Erkannt — die Posten gehen auf die Endsumme auf.',
  unsicher: 'Erkannt, aber die Posten gehen nicht auf die Summe auf. Nur Summe und Datum.',
};

export interface ReceiptImportSheetProps {
  /** Die gewählte Datei. Die Komponente wird mit ihr gemountet. */
  file: File;
  pots: readonly Pot[];
  onClose: () => void;
  /** Läuft, nachdem gebucht wurde — der Aufrufer schließt dann sein Sheet. */
  onImported: () => void;
}

export function ReceiptImportSheet({ file, pots, onClose, onImported }: ReceiptImportSheetProps) {
  const { repository, snapshot } = useData();
  const format = useFormat();
  const can = useCan();

  const [parsed, setParsed] = useState<ParsedReceipt | null>(null);
  const [potIds, setPotIds] = useState<(string | null)[]>([]);
  const [manuell, setManuell] = useState<boolean[]>([]);
  const [fehler, setFehler] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const { attachments, lines } = await extractPdf(file);

        // Erst der angehängte Beleg, dann die Textschicht: Der Anhang muss
        // nicht geraten werden.
        const anhang = attachments['ekabs.json'];
        let ergebnis: ParsedReceipt | null = null;
        if (anhang) {
          try {
            ergebnis = parseEkabs(JSON.parse(new TextDecoder().decode(anhang)));
          } catch {
            ergebnis = null;
          }
        }
        ergebnis ??= parseTextLines(lines);
        if (cancelled) return;

        const vorschlag = ergebnis.items.map((item) => suggestPot(item.label, snapshot.itemRules));
        setParsed(ergebnis);
        setPotIds(vorschlag);
        setManuell(ergebnis.items.map(() => false));
      } catch (caught) {
        if (cancelled) return;
        setFehler(
          caught instanceof PdfReadError
            ? caught.message
            : 'Das PDF ließ sich nicht lesen. Ein Foto lässt sich noch nicht auswerten.',
        );
      }
    })();

    return () => {
      cancelled = true;
    };
    // snapshot.itemRules absichtlich nicht in den Abhängigkeiten: Die
    // Vorschläge sollen sich nicht ändern, während man zuordnet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  function setzePot(index: number, potId: string | null) {
    setPotIds((previous) => previous.map((value, i) => (i === index ? potId : value)));
    setManuell((previous) => previous.map((value, i) => (i === index ? true : value)));
  }

  function allesAuf(potId: string | null) {
    setPotIds((previous) => previous.map(() => potId));
    setManuell((previous) => previous.map(() => true));
  }

  async function buchen() {
    if (!parsed) return;
    setSaving(true);
    setFehler(null);
    try {
      const date = parsed.date ?? todayIso();
      const merchant = parsed.merchant;
      const groups = groupItemsByPot(parsed.items, potIds);

      if (groups.length === 0 && parsed.totalCents === null) {
        setFehler('Auf dem Beleg war kein Betrag zu finden.');
        setSaving(false);
        return;
      }

      // Die Kennung klammert die Buchungen eines Einkaufs. Bei nur einer
      // Buchung bleibt sie leer — da gibt es nichts zu klammern.
      const splitGroupId = groups.length > 1 ? newId() : null;

      const entries =
        groups.length > 0
          ? await repository.createEntries(
              groups.map((group) => ({
                potId: group.potId,
                kind: group.kind,
                amountCents: group.amountCents,
                date,
                merchant,
                note: group.labels.join(', ').slice(0, TEXT_LIMITS.note),
                splitGroupId,
              })),
            )
          : [
              await repository.createEntry({
                potId: null,
                kind: 'expense',
                amountCents: parsed.totalCents ?? 0,
                date,
                merchant,
              }),
            ];

      // Der Beleg hängt an der ersten Buchung; über die Gruppe ist er für alle
      // Buchungen des Einkaufs auffindbar.
      const erste = entries[0];
      if (erste && can('receipt.upload')) {
        await repository.addReceipt(erste.id, {
          filename: file.name,
          mime: file.type || 'application/pdf',
          blob: file,
          thumbnail: null,
        });
      }

      // Nur von Hand gesetzte Zuordnungen werden gelernt. Einen Vorschlag zu
      // bestätigen ist keine neue Information.
      for (const [index, item] of parsed.items.entries()) {
        const potId = potIds[index];
        if (!manuell[index] || !potId) continue;
        const keyword = normalizeKeyword(item.label);
        if (keyword !== '') await repository.rememberItemRule(keyword, potId);
      }

      onImported();
    } catch (caught) {
      setFehler(caught instanceof Error ? caught.message : 'Buchen fehlgeschlagen.');
      setSaving(false);
    }
  }

  const ohneTopf = parsed
    ? parsed.items.filter((_, index) => (potIds[index] ?? null) === null)
    : [];
  const groups = parsed ? groupItemsByPot(parsed.items, potIds) : [];

  return (
    <Sheet
      open
      onClose={onClose}
      title="Bon einlesen"
      description={file.name}
      footer={
        <div className="flex gap-3">
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            variant="primary"
            block
            disabled={!parsed || saving}
            onClick={() => void buchen()}
          >
            {saving
              ? 'Wird gebucht …'
              : groups.length > 1
                ? `${groups.length} Buchungen anlegen`
                : 'Buchung anlegen'}
          </Button>
        </div>
      }
    >
      {fehler && (
        <Banner tone="negative" icon="⚠">
          {fehler}
        </Banner>
      )}

      {!parsed && !fehler && <p className="text-sm text-ink-muted">PDF wird gelesen …</p>}

      {parsed && (
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-lg font-semibold">
              {parsed.totalCents === null ? 'Betrag unbekannt' : format.money(parsed.totalCents)}
            </p>
            <p className="text-sm text-ink-muted">
              {[parsed.merchant, parsed.date ? format.day(parsed.date) : null]
                .filter(Boolean)
                .join(' · ') || 'Ohne Händler und Datum'}
            </p>
            <p className="mt-1 text-xs text-ink-muted">{HERKUNFT[parsed.quality]}</p>
          </div>

          {parsed.items.length > 0 && (
            <>
              <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-muted">
                Alles auf einen Topf
                <select
                  className={selectClass}
                  defaultValue=""
                  onChange={(event) => allesAuf(event.target.value || null)}
                >
                  <option value="">— auswählen —</option>
                  {pots.map((pot) => (
                    <option key={pot.id} value={pot.id}>
                      {pot.icon} {pot.name}
                    </option>
                  ))}
                </select>
              </label>

              <ul className="flex flex-col divide-y divide-[var(--border)]">
                {parsed.items.map((item, index) => (
                  <li key={`${item.label}-${index}`} className="flex flex-col gap-1.5 py-2.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {item.quantity !== null && item.quantity !== 1 ? `${item.quantity} × ` : ''}
                        {item.label}
                      </span>
                      <span className="tabular shrink-0 text-sm font-semibold">
                        {format.money(item.amountCents)}
                      </span>
                    </div>
                    <select
                      className={selectClass}
                      aria-label={`Topf für ${item.label}`}
                      value={potIds[index] ?? ''}
                      onChange={(event) => setzePot(index, event.target.value || null)}
                    >
                      <option value="">Ohne Topf</option>
                      {pots.map((pot) => (
                        <option key={pot.id} value={pot.id}>
                          {pot.icon} {pot.name}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>

              {ohneTopf.length > 0 && (
                <p className="text-sm text-ink-muted">
                  {ohneTopf.length === 1
                    ? 'Ein Posten hat noch keinen Topf'
                    : `${ohneTopf.length} Posten haben noch keinen Topf`}{' '}
                  — sie werden zu einer Buchung ohne Topf.
                </p>
              )}
            </>
          )}

          {parsed.items.length === 0 && (
            <Banner icon="ℹ">
              Einzelposten waren nicht verlässlich zu erkennen. Es wird eine Buchung über die
              Endsumme angelegt, die du danach wie gewohnt aufteilen kannst.
            </Banner>
          )}
        </div>
      )}
    </Sheet>
  );
}
