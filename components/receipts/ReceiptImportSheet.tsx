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
 *
 * Tags gibt es hier auf zwei Ebenen: für den **ganzen Einkauf** und je
 * **Posten**. Weil ein Bon zu einer Buchung pro Topf wird, sammelt jede
 * Buchung die Tags ihrer Posten ein — die Zuordnung dafür liefert
 * `groupItemsByPot` über `indices`, damit die Gruppierung nicht zweimal
 * existiert.
 */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Info, TriangleAlert } from 'lucide-react';
import { useCan } from '../../lib/auth/provider';
import { useData } from '../../lib/data/provider';
import { todayIso } from '../../lib/domain/dates';
import {
  groupItemsByPot,
  normalizeKeyword,
  parseEkabs,
  parseTextLines,
  suggestPot,
  type ParsedReceipt,
} from '../../lib/domain/receipt-parse';
import { collectTags } from '../../lib/domain/tags';
import { CHAIN_PROFILES } from '../../lib/domain/receipt/chains';
import { matchProfile, suggestFromProfile } from '../../lib/domain/receipt/profile';
import { resolveCategoryPot } from '../../lib/domain/pot-categories';
import { bookablePots } from '../../lib/domain/pot-kinds';
import type { Pot } from '../../lib/domain/types';
import { extractPdf, PdfReadError } from '../../lib/pdf/extract';
import { Banner } from '../../lib/ui/Banner';
import { Button } from '../../lib/ui/Button';
import { Icon } from '../../lib/ui/Icon';
import { Sheet } from '../../lib/ui/Sheet';
import { TagInput } from '../entries/TagInput';
import { selectClass } from '../../lib/ui/Field';
import { useFormat } from '../../lib/ui/useFormat';
import { PotOptions } from '../pots/PotOptions';

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
  const [einkaufTags, setEinkaufTags] = useState<string[]>([]);
  const [postenTags, setPostenTags] = useState<string[][]>([]);
  /** Posten, für die das Tag-Feld aufgeklappt ist. */
  const [offeneTagFelder, setOffeneTagFelder] = useState<number[]>([]);
  const [fehler, setFehler] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** Nach dem Buchen: was entstanden ist, und der Weg dorthin. */
  const [gebucht, setGebucht] = useState<{ purchaseId: string | null; anzahl: number } | null>(
    null,
  );

  const tagsEnabled = snapshot.household?.tagsEnabled ?? false;
  const vorschlaege = useMemo(
    () => collectTags(snapshot.entries).map((usage) => usage.tag),
    [snapshot.entries],
  );

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

        /*
          Zwei Quellen für die Vorbelegung, und die Reihenfolge ist die
          Aussage: Was der Nutzer selbst zugeordnet hat (`itemRules`), schlägt
          immer die mitgelieferte Tabelle des Profils. Andersherum würde eine
          Tabelle im Code eine Entscheidung des Nutzers überstimmen.

          Das Profil erkennt das Bonformat am Layout (`matchProfile`); trifft
          keines, bleibt alles wie vorher. Sichtbar ist davon nichts — nur
          dass Topf und Tags schon ausgefüllt sind.
        */
        const profil = matchProfile(lines, CHAIN_PROFILES)?.profile ?? null;
        const aktivePots = bookablePots(snapshot.pots);
        const buchbar = new Set(aktivePots.map((pot) => pot.id));

        const vorschlag = ergebnis.items.map((item) => {
          // Eine gelernte Zuordnung auf einen inzwischen archivierten oder
          // gesperrten Topf ist kein Vorschlag mehr — dieselbe Prüfung wie
          // beim Profil, nicht nur dort.
          const gelernt = suggestPot(item.label, snapshot.itemRules);
          if (gelernt !== null && buchbar.has(gelernt)) return gelernt;
          if (!profil) return null;
          const treffer = suggestFromProfile(item.label, profil.products);
          return treffer ? resolveCategoryPot(treffer.kategorie, aktivePots) : null;
        });

        const profilTags = ergebnis.items.map((item) => {
          if (!profil || !tagsEnabled) return [];
          // Tags aus dem Profil auch dann, wenn der Topf aus einer gelernten
          // Regel kommt: Das eine sagt nichts über das andere.
          return [...(suggestFromProfile(item.label, profil.products)?.tags ?? [])];
        });

        setParsed(ergebnis);
        setPotIds(vorschlag);
        setManuell(ergebnis.items.map(() => false));
        setPostenTags(profilTags);
      } catch (caught) {
        if (cancelled) return;
        // Der Grund gehört in die Meldung. Eine Sammelmeldung ohne Ursache
        // kostet bei jedem Bericht eine Rückfrage — und „ein Foto lässt sich
        // nicht auswerten" war bei einem PDF schlicht irreführend.
        const grund = caught instanceof Error ? caught.message : String(caught);
        setFehler(
          caught instanceof PdfReadError ? grund : `Das PDF ließ sich nicht lesen: ${grund}`,
        );
      }
    })();

    return () => {
      cancelled = true;
    };
    // `snapshot` und `tagsEnabled` absichtlich nicht in den Abhängigkeiten:
    // Die Vorbelegung wird **einmal** beim Einlesen gerechnet. Stünden sie
    // drin, sprängen Topf und Tags zurück, sobald der Nutzer nebenbei etwas
    // ändert — er ordnet ja gerade zu.
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

      /*
        Zwei Wege, und der Unterschied ist nicht Bequemlichkeit:

        Gibt es Posten, entsteht ein **Einkauf** — Einkauf, Posten und
        Buchungen in einer Transaktion, gerechnet im Repository. Die
        Aufteilung auf Töpfe passiert dort und nicht hier, damit eine
        künftige API denselben Weg nimmt.

        Bleibt die Summenprobe unklar (`quality: 'unsicher'`), gibt es keine
        Posten — dann auch keinen Einkauf, sondern eine einzelne Buchung über
        die Endsumme. Ein Einkauf ohne Posten wäre eine leere Hülle, die in
        der Einkaufsansicht nichts zu zeigen hätte.
      */
      let purchaseId: string | null = null;
      let entries;
      if (groups.length > 0) {
        const ergebnis = await repository.createPurchase({
          merchant,
          date,
          totalCents: parsed.totalCents,
          quality: parsed.quality,
          tags: tagsEnabled ? einkaufTags : [],
          items: parsed.items.map((item, index) => ({
            label: item.label,
            amountCents: item.amountCents,
            quantity: item.quantity,
            potId: potIds[index] ?? null,
            tags: tagsEnabled ? (postenTags[index] ?? []) : [],
          })),
        });
        purchaseId = ergebnis.purchase.id;
        entries = ergebnis.entries;
      } else {
        entries = [
          await repository.createEntry({
            potId: null,
            kind: 'expense',
            amountCents: parsed.totalCents ?? 0,
            date,
            merchant,
            tags: tagsEnabled ? einkaufTags : [],
          }),
        ];
      }

      // Der Beleg hängt an der ersten Buchung; über die Gruppe ist er für alle
      // Buchungen des Einkaufs auffindbar. Wandert diese Buchung später weg,
      // hängt `updatePurchaseItem` ihn um.
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
      // bestätigen ist keine neue Information — das gilt auch für die
      // Vorschläge aus einem Profil: Würden sie gelernt, stände die Liste
      // unter „Ordnen" nach einem Einkauf voller Einträge, die der Nutzer
      // nie angelegt hat. `manuell` bleibt für sie deshalb `false`.
      for (const [index, item] of parsed.items.entries()) {
        const potId = potIds[index];
        if (!manuell[index] || !potId) continue;
        const keyword = normalizeKeyword(item.label);
        if (keyword !== '') await repository.rememberItemRule(keyword, potId);
      }

      setGebucht({ purchaseId, anzahl: entries.length });
      setSaving(false);
    } catch (caught) {
      setFehler(caught instanceof Error ? caught.message : 'Buchen fehlgeschlagen.');
      setSaving(false);
    }
  }

  const ohneTopf = parsed
    ? parsed.items.filter((_, index) => (potIds[index] ?? null) === null)
    : [];
  const groups = parsed ? groupItemsByPot(parsed.items, potIds) : [];

  /*
    Nach dem Buchen bleibt das Sheet kurz stehen, statt sofort zu schließen.
    Der Grund ist der Weg zum Einkauf: Wer die Posten nachher noch braucht,
    findet sie sonst nur über eine Buchung und deren Detailschritt — und
    weiß in dem Moment noch gar nicht, dass es sie gibt.
  */
  if (gebucht) {
    return (
      <Sheet
        open
        onClose={onImported}
        title="Gebucht"
        description={file.name}
        footer={
          <Button variant="primary" block onClick={onImported}>
            Fertig
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm">
            {gebucht.anzahl === 1
              ? 'Eine Buchung ist entstanden.'
              : `${gebucht.anzahl} Buchungen sind entstanden — eine je Topf.`}
          </p>
          {gebucht.purchaseId && (
            <p className="text-sm text-ink-muted">
              Die Einzelposten bleiben erhalten.{' '}
              <Link
                href={`/buchungen/einkauf?einkauf=${gebucht.purchaseId}`}
                className="text-accent hover:underline"
                onClick={onImported}
              >
                Einkauf ansehen
              </Link>{' '}
              — dort lässt sich der Topf je Posten noch ändern.
            </p>
          )}
        </div>
      </Sheet>
    );
  }

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
        <Banner tone="negative" icon={<Icon icon={TriangleAlert} size={18} />}>
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

          {tagsEnabled && (
            <TagInput
              tags={einkaufTags}
              onChange={setEinkaufTags}
              suggestions={vorschlaege}
              label="Tags für den ganzen Einkauf"
              hint="Gelten für jede Buchung, die aus diesem Bon entsteht."
            />
          )}

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
                  <PotOptions pots={pots} />
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
                      <PotOptions pots={pots} />
                    </select>

                    {/*
                      Aufklappbar und nicht gleich sichtbar: Ein echter Bon hat
                      zwanzig Posten, und zwanzig offene Tag-Felder machen die
                      Liste unlesbar. Wer schon Tags gesetzt hat, sieht sie.
                    */}
                    {tagsEnabled &&
                      (offeneTagFelder.includes(index) || (postenTags[index]?.length ?? 0) > 0 ? (
                        <TagInput
                          tags={postenTags[index] ?? []}
                          onChange={(next) =>
                            setPostenTags((previous) =>
                              previous.map((value, i) => (i === index ? next : value)),
                            )
                          }
                          suggestions={vorschlaege}
                          label={`Tags für ${item.label}`}
                          hint=""
                          maxSuggestions={3}
                        />
                      ) : (
                        <button
                          type="button"
                          className="self-start text-xs text-accent hover:underline"
                          onClick={() => setOffeneTagFelder((previous) => [...previous, index])}
                        >
                          + Tags
                        </button>
                      ))}
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
            <Banner icon={<Icon icon={Info} size={18} />}>
              Einzelposten waren nicht verlässlich zu erkennen. Es wird eine Buchung über die
              Endsumme angelegt, die du danach wie gewohnt aufteilen kannst.
            </Banner>
          )}
        </div>
      )}
    </Sheet>
  );
}
