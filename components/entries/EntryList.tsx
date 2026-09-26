'use client';

/**
 * Buchungsliste, nach Monat und darin nach Tag gruppiert.
 *
 * Gruppierung statt einer flachen Liste mit Datum in jeder Zeile: In einer
 * Woche mit zwanzig Buchungen ist „welcher Tag war das?“ die häufigste Frage.
 *
 * **Beide Köpfe kleben**, und sie kleben übereinander: der Monat unter der
 * Werkzeugleiste, der Tag unter dem Monat. Vorher scrollte der Monat weg,
 * und in einer langen Liste stand dann „14. September" ohne Jahr und ohne
 * Monat darüber — man musste hochscrollen, um zu wissen, wo man ist.
 *
 * Zwei Klebezeilen sind das Maximum. Sie kosten zusammen rund 3,3 rem über
 * der Liste; eine dritte Ebene wäre bei 320 px mehr Kopf als Inhalt.
 *
 * **Wischen löscht** — abschaltbar, mit Rückfrage voreingestellt, und nie bei
 * einer Buchung aus einem Bon (`canDeleteEntryDirectly`). Die Geste allein
 * wäre zu wenig: Für Tastatur und Screenreader ist sie unerreichbar, der
 * zweite Weg ist der Löschknopf im `EntrySheet`.
 */

import { useMemo, useState } from 'react';
import { MapPin, Trash2 } from 'lucide-react';
import { useCan } from '../../lib/auth/provider';
import { useData } from '../../lib/data/provider';
import { mapsHref, shortenAddress } from '../../lib/domain/address';
import { canDeleteEntryDirectly } from '../../lib/domain/ledger';
import { signSymbol } from '../../lib/domain/money';
import { bookablePots } from '../../lib/domain/pot-kinds';
import type { Entry, Pot } from '../../lib/domain/types';
import { Button } from '../../lib/ui/Button';
import { EmptyState } from '../../lib/ui/EmptyState';
import { Icon } from '../../lib/ui/Icon';
import { Sheet } from '../../lib/ui/Sheet';
import { PotIcon } from '../pots/PotIcon';
import { useFormat } from '../../lib/ui/useFormat';
import { useSwipeAction } from '../../lib/ui/useSwipeAction';
import { useSwipeConfirm, useSwipeDelete } from '../../lib/prefs/useDevicePref';
import { EntrySheet } from './EntrySheet';

export function EntryList({
  entries,
  pots,
  emptyHint,
}: {
  entries: readonly Entry[];
  pots: readonly Pot[];
  emptyHint: string;
}) {
  const format = useFormat();
  const { repository, snapshot } = useData();
  const can = useCan();
  const wischen = useSwipeDelete();
  const rueckfrage = useSwipeConfirm();
  const [editing, setEditing] = useState<Entry | null>(null);
  const [fragt, setFragt] = useState<Entry | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  const potsById = useMemo(() => new Map(pots.map((pot) => [pot.id, pot])), [pots]);
  const receiptCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const receipt of snapshot.receipts) {
      counts.set(receipt.entryId, (counts.get(receipt.entryId) ?? 0) + 1);
    }
    return counts;
  }, [snapshot.receipts]);

  /**
   * Belege und Umfang eines aufgeteilten Einkaufs.
   *
   * Der Beleg hängt an einer der Buchungen; die übrigen desselben Einkaufs
   * sollen ihn trotzdem anzeigen, sonst sucht man ihn bei der falschen Zeile.
   */
  const splitGroups = useMemo(() => {
    const info = new Map<string, { count: number; receipts: number }>();
    for (const entry of snapshot.entries) {
      if (!entry.splitGroupId) continue;
      const bisher = info.get(entry.splitGroupId) ?? { count: 0, receipts: 0 };
      bisher.count += 1;
      bisher.receipts += receiptCounts.get(entry.id) ?? 0;
      info.set(entry.splitGroupId, bisher);
    }
    return info;
  }, [snapshot.entries, receiptCounts]);

  /**
   * Monate, jeder mit seinen Tagen — beide absteigend sortiert.
   *
   * Der Monatsschlüssel ist `date.slice(0, 7)`: Bei ISO-Datumsangaben sortiert
   * die Zeichenkette wie das Datum, deshalb reicht `localeCompare` und es
   * braucht kein `Date`.
   */
  const months = useMemo(() => {
    const byMonth = new Map<string, Map<string, Entry[]>>();
    for (const entry of entries) {
      const monthKey = entry.date.slice(0, 7);
      let days = byMonth.get(monthKey);
      if (!days) {
        days = new Map();
        byMonth.set(monthKey, days);
      }
      const list = days.get(entry.date);
      if (list) list.push(entry);
      else days.set(entry.date, [entry]);
    }
    return [...byMonth.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([monthKey, days]) => ({
        monthKey,
        days: [...days.entries()].sort((a, b) => b[0].localeCompare(a[0])),
      }));
  }, [entries]);

  /**
   * Das Recht wird im Repository geprüft (`deleteEntry` verlangt
   * `entry.edit.any`); hier wird nur nicht angeboten, was ohnehin scheitern
   * würde.
   */
  const darfLoeschen = can('entry.edit.any');

  async function loeschen(entry: Entry) {
    setFehler(null);
    try {
      await repository.deleteEntry(entry.id);
    } catch (caught) {
      setFehler(caught instanceof Error ? caught.message : 'Unbekannter Fehler');
    }
  }

  function angewischt(entry: Entry) {
    if (rueckfrage) setFragt(entry);
    else void loeschen(entry);
  }

  if (entries.length === 0) {
    return <EmptyState icon="≡" title="Keine Buchungen" hint={emptyHint} />;
  }

  return (
    <>
      <ul>
        {months.map(({ monthKey, days }) => (
          <li key={monthKey}>
            {/*
              Klebt unter der Werkzeugleiste, nicht am Fensterrand: Deren Höhe
              steht als `--list-toolbar-h` am Wurzelelement (gesetzt von
              `components/lists/ListToolbar.tsx`, und sie ändert sich, sobald
              Suche oder Filter aufklappen). Ohne den Versatz verschwände der
              Kopf hinter der Leiste. Der Rückfall `0px` gilt auf Seiten ohne
              Leiste; der Sicherheitsbereich kommt in beiden Fällen dazu, damit
              als installierte App nichts unter der Statusleiste klebt.

              Beschriftet wird mit dem neuesten Tag des Monats — `format.month`
              braucht ein vollständiges Datum, und der liegt hier ohnehin vor.
            */}
            <p className="sticky top-[calc(var(--list-toolbar-h,0px)+env(safe-area-inset-top))] z-20 h-[var(--month-head-h)] border-y border-line bg-accent-subtle px-4 py-1.5 text-xs font-semibold text-ink">
              {format.month(days[0]![0])}
            </p>
            <ul>
              {days.map(([date, dayEntries]) => (
                <li key={date}>
                  {/*
                    Klebt unter dem Monatskopf, nicht unter der Leiste — sonst
                    lägen beide aufeinander. `--month-head-h` ist ein fester
                    Wert aus `app/globals.css`; anders als bei der
                    Werkzeugleiste geht das hier, weil dieser Kopf immer genau
                    eine Zeile ist und nicht aufklappen kann.
                  */}
                  <p className="sticky top-[calc(var(--list-toolbar-h,0px)+env(safe-area-inset-top)+var(--month-head-h))] z-10 border-y border-line bg-subtle px-4 py-1.5 text-xs font-medium text-ink-muted">
                    {format.day(date)}
                  </p>
                  <ul className="divide-y divide-[var(--border)]">
                    {dayEntries.map((entry) => {
                      const split = entry.splitGroupId ? splitGroups.get(entry.splitGroupId) : null;
                      return (
                        <EntryRow
                          key={entry.id}
                          entry={entry}
                          pot={entry.potId ? (potsById.get(entry.potId) ?? null) : null}
                          splitCount={split?.count ?? 0}
                          receiptCount={split ? split.receipts : (receiptCounts.get(entry.id) ?? 0)}
                          onOpen={() => setEditing(entry)}
                          onSwipe={
                            wischen && darfLoeschen && canDeleteEntryDirectly(entry)
                              ? () => angewischt(entry)
                              : null
                          }
                        />
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      <EntrySheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        // Beim Bearbeiten nur, was bebuchbar ist — plus der Topf, auf dem die
        // Buchung schon steht. Vorher bot diese Auswahl archivierte und
        // gesperrte Töpfe an, jede andere nicht.
        pots={bookablePots(pots, editing?.potId ?? null)}
        entry={editing}
      />

      {/*
        Die Rückfrage nach dem Wischen. Ein `Sheet` und keine eingeschobene
        Zeile: Die Liste soll beim Antworten nicht springen, und das Sheet
        bringt die Scrollsperre mit.
      */}
      <Sheet
        open={fragt !== null}
        onClose={() => setFragt(null)}
        title="Buchung löschen?"
        footer={
          <div className="flex gap-3">
            <Button variant="ghost" onClick={() => setFragt(null)}>
              Abbrechen
            </Button>
            <Button
              variant="danger"
              block
              onClick={() => {
                const opfer = fragt;
                setFragt(null);
                if (opfer) void loeschen(opfer);
              }}
            >
              Ja, löschen
            </Button>
          </div>
        }
      >
        <p className="text-sm text-ink-muted">
          {fragt
            ? `„${fragt.merchant || fragt.note || format.money(fragt.amountCents)}" wird entfernt, samt Belegen. Das lässt sich nicht rückgängig machen.`
            : null}
        </p>
      </Sheet>

      {fehler && <p className="px-4 py-2 text-sm text-negative">{fehler}</p>}
    </>
  );
}

/**
 * Eine Zeile der Liste — als eigene Komponente, weil sie einen Haken braucht.
 *
 * `useSwipeAction` in der `map`-Schleife der Liste aufzurufen wäre ein Haken
 * in einer Schleife; React verlangt eine feste Reihenfolge. Die Zeile ist
 * damit ohnehin besser aufgehoben.
 *
 * `onSwipe === null` heißt: keine Geste. Das ist der Fall, wenn das Wischen
 * abgeschaltet ist, das Recht fehlt oder die Buchung aus einem Bon stammt —
 * die Zeile verhält sich dann wie vor dieser Änderung.
 */
function EntryRow({
  entry,
  pot,
  splitCount,
  receiptCount,
  onOpen,
  onSwipe,
}: {
  entry: Entry;
  pot: Pot | null;
  splitCount: number;
  receiptCount: number;
  onOpen: () => void;
  onSwipe: (() => void) | null;
}) {
  const format = useFormat();
  const kurzeAdresse = entry.address ? shortenAddress(entry.address) : '';
  const karte = entry.address ? mapsHref(entry.address) : null;
  const { handlers, offset, ziehend, consumeTriggered } = useSwipeAction(
    () => onSwipe?.(),
    onSwipe !== null,
  );

  return (
    <li className="relative overflow-hidden">
      {/*
        Die Fläche hinter der Zeile. Nur so breit wie gezogen wurde, damit
        sie nicht schon vor der Geste durchscheint. Getönt statt gefüllt:
        Eine volle Fläche bräuchte eine eigene Vordergrundfarbe, die in fünf
        Themes und zwei Modi lesbar sein müsste — `text-negative` auf einer
        Tönung derselben Farbe ist geprüft.
      */}
      {offset > 0 && (
        <span
          aria-hidden
          className="absolute inset-y-0 right-0 flex items-center justify-center text-negative"
          style={{
            width: `${offset}px`,
            background: 'color-mix(in oklch, var(--negative) 18%, transparent)',
          }}
        >
          <Icon icon={Trash2} size={20} />
        </span>
      )}

      {/*
        Die Hülle trägt die Verschiebung, nicht die Schaltfläche: Die
        Anschrift darunter ist ein eigener Verweis und soll mitwandern.
      */}
      <div
        className="relative bg-surface"
        style={{
          transform: offset > 0 ? `translateX(-${offset}px)` : undefined,
          transition: ziehend ? 'none' : 'transform 150ms ease-out',
        }}
      >
        <button
          type="button"
          {...handlers}
          onClick={() => {
            // Nach einem Wischen kein Öffnen: Das `click` folgt auf
            // `pointerup` und zeigte sonst die Buchung, die gerade gelöscht
            // wurde.
            if (consumeTriggered()) return;
            onOpen();
          }}
          className={[
            'flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-subtle',
            // Senkrecht scrollt der Browser, waagerecht übernehmen wir. Ohne
            // das käme `preventDefault` bei einem passiven Listener zu spät.
            onSwipe !== null ? 'touch-pan-y' : '',
          ].join(' ')}
        >
          <PotIcon
            pot={pot}
            fallback={entry.kind === 'income' ? '↓' : '–'}
            className="h-9 w-9 rounded-lg text-base"
          />

          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">
              {entry.merchant ||
                entry.note ||
                pot?.name ||
                (entry.kind === 'income' ? 'Einnahme' : 'Ausgabe')}
            </span>
            <span className="block truncate text-xs text-ink-muted">
              {[
                pot?.name ?? 'ohne Topf',
                // Tags in dieselbe Zeile und nicht als eigene Marken: Die Liste
                // soll bei 320 px nicht in die Höhe wachsen, und hier zählt
                // „welcher Tag war das", nicht das Bearbeiten.
                (entry.tags ?? []).length > 0
                  ? (entry.tags ?? []).map((tag) => `#${tag}`).join(' ')
                  : null,
                entry.recurringRuleId ? 'wiederkehrend' : null,
                splitCount > 1 ? `Einkauf mit ${splitCount} Buchungen` : null,
                receiptCount > 0 ? `${receiptCount} Beleg${receiptCount > 1 ? 'e' : ''}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </span>

          <span
            className={[
              'tabular shrink-0 font-semibold',
              entry.kind === 'income' ? 'text-positive' : '',
            ].join(' ')}
          >
            {signSymbol(entry.kind)}
            {format.money(entry.amountCents)}
          </span>
        </button>

        {/*
          Die Anschrift steht **unter** der Zeile und nicht in ihr: Sie ist
          ein Verweis, und ein Verweis in einer Schaltfläche ist kein
          gültiges HTML — der Browser zieht ihn heraus und die Zeile
          zerfällt. Eine eigene Zeile kostet Höhe, aber nur bei Buchungen,
          die überhaupt eine Anschrift haben.

          Das Ziel ist `geo:` und keine Karten-Adresse im Netz — die
          Begründung steht in `lib/domain/address.ts`. Auf dem Telefon öffnet
          das die Karten-Anwendung, am Desktop passiert je nach System
          nichts; das ist der Preis dafür, die Anschrift nicht an einen
          Dritten zu schicken. Ohne verwertbaren Inhalt gibt `mapsHref`
          `null`, dann steht die Anschrift als Text da.
        */}
        {kurzeAdresse !== '' && (
          <div className="flex items-center gap-1 px-4 pb-2 pl-[3.25rem] text-xs text-ink-muted">
            <Icon icon={MapPin} size={13} />
            {karte ? (
              <a href={karte} className="truncate hover:underline" title={entry.address ?? ''}>
                {kurzeAdresse}
              </a>
            ) : (
              <span className="truncate" title={entry.address ?? ''}>
                {kurzeAdresse}
              </span>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
